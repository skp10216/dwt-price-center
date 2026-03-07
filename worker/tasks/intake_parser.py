"""
정산 관리 시스템 - UPM 반입 내역 엑셀 파싱 Worker
이중 거래처 매칭(반입처 필수, 매입처 선택) + dedupe_key + diff + lock + 원전표 매칭
한글->enum 변환 + 마진 검증(파싱만, 저장 안 함)
"""

import io, os, re, json, uuid, logging
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from typing import Optional

import pandas as pd
import redis
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://dwt_user:dwt_password@localhost:5532/dwt_price_center")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6479/0")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

DEFAULT_INTAKE_MAPPING = {
    "intake_date": ["반입일", "일자"],
    "counterparty_name": ["반입처", "거래처"],
    "slip_number": ["전표번호", "번호"],
    "pg_no": ["P/G No", "PG No", "P/G", "PG번호", "PG NO"],
    "model_name": ["모델명", "모델", "기종"],
    "serial_number": ["일련번호", "시리얼", "S/N"],
    "purchase_date": ["매입일"],
    "purchase_counterparty_name": ["매입처"],
    "actual_purchase_price": ["실매입가", "매입가"],
    "intake_price": ["반입가"],
    "margin": ["마진"],
    "intake_type": ["반입구분"],
    "current_status": ["현상태", "상태"],
    "remarks": ["특이사항"],
    "memo": ["비고"],
}

INTAKE_DIFF_FIELDS = [
    "actual_purchase_price", "intake_price",
    "model_name", "current_status", "intake_type",
    "remarks", "memo",
]

STATUS_KOREAN_MAP = {
    "반입": "RECEIVED", "입고": "RECEIVED", "입고완료": "RECEIVED",
    "재고": "IN_STOCK",
    "판매완료": "SOLD", "판매 완료": "SOLD", "완료": "SOLD", "sold": "SOLD",
    "보류": "HOLD",
    "제외": "EXCLUDED",
}

TYPE_KOREAN_MAP = {
    "반입": "NORMAL", "일반": "NORMAL", "일반반입": "NORMAL", "일반 반입": "NORMAL",
    "재반입": "RETURN_INTAKE", "반품후재반입": "RETURN_INTAKE",
    "이관": "TRANSFER",
    "기타": "OTHER",
}


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, (date, datetime)):
            return o.isoformat()
        if isinstance(o, uuid.UUID):
            return str(o)
        return super().default(o)


def _safe_decimal(value) -> Optional[Decimal]:
    if value is None or pd.isna(value):
        return None
    try:
        s = str(value).strip().replace(",", "").replace("원", "").replace("₩", "")
        if s in ("", "-", "nan", "NaN"):
            return None
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def _safe_str(value) -> Optional[str]:
    if value is None or pd.isna(value):
        return None
    s = str(value).strip()
    return s if s and s.lower() not in ("nan", "none") else None


def _safe_date(value) -> Optional[date]:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        s = str(value).strip()
        for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%m/%d/%Y", "%Y%m%d"):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
        return pd.Timestamp(s).date()
    except Exception:
        return None


def _find_column(df_columns, target_names):
    target_list = target_names if isinstance(target_names, list) else [target_names]
    for col in df_columns:
        col_clean = str(col).strip().replace(" ", "").lower()
        for target in target_list:
            target_clean = target.strip().replace(" ", "").lower()
            if target_clean in col_clean or col_clean in target_clean:
                return col
    return None


def _build_column_map(df, mapping: dict) -> dict:
    column_map = {}
    for db_field, excel_header in mapping.items():
        col = _find_column(df.columns, excel_header if isinstance(excel_header, list) else [excel_header])
        if col is not None:
            column_map[db_field] = col
    return column_map


def _detect_header_row(file_path: str, max_scan: int = 10) -> Optional[int]:
    try:
        df_scan = pd.read_excel(file_path, engine="openpyxl", header=None, nrows=max_scan)
    except Exception:
        return None
    best_row, best_score = 0, 0
    for row_idx in range(min(max_scan, len(df_scan))):
        score = sum(1 for val in df_scan.iloc[row_idx]
                    if re.search(r'[가-힣a-zA-Z]{2,}', str(val).strip() if val is not None and not (isinstance(val, float) and pd.isna(val)) else ""))
        if score > best_score:
            best_score, best_row = score, row_idx
    return best_row if best_row > 0 else None


def _is_sum_row(row, column_map: dict) -> tuple:
    _KW = r'합계|소계|총계|통계|평균|수량\s*\(건수\)|TOTAL|SUM'
    cp_val = str(row.get(column_map.get("counterparty_name"), "")).strip() if "counterparty_name" in column_map else ""
    if cp_val and re.search(_KW, cp_val, re.IGNORECASE):
        return True, f"반입처 컬럼에 통계 키워드 ('{cp_val}')"
    sn_val = str(row.get(column_map.get("slip_number"), "")).strip() if "slip_number" in column_map else ""
    if sn_val and re.search(_KW, sn_val, re.IGNORECASE):
        return True, f"전표번호 컬럼에 통계 키워드 ('{sn_val}')"
    if sn_val and re.search(r'^\d+건$', sn_val):
        return True, f"전표번호가 건수 집계 ('{sn_val}')"
    td_val = _safe_date(row.get(column_map.get("intake_date"))) if "intake_date" in column_map else None
    if not td_val and not cp_val and not sn_val:
        return True, "필수값 모두 누락"
    return False, ""


def _build_dedupe_key(cp_id: str, intake_date: date, slip_number: str,
                      serial_number: Optional[str], pg_no: Optional[str]) -> str:
    if serial_number:
        return f"{intake_date.isoformat()}|{cp_id}|{serial_number}"
    return f"{intake_date.isoformat()}|{cp_id}|{slip_number}|{pg_no or ''}"


def _resolve_counterparty(session: Session, name: str) -> Optional[str]:
    if not name:
        return None
    name_clean = name.strip()
    row = session.execute(text("SELECT counterparty_id FROM counterparty_aliases WHERE alias_name = :n LIMIT 1"), {"n": name_clean}).fetchone()
    if row:
        return str(row[0])
    row = session.execute(text("SELECT id FROM counterparties WHERE name = :n AND is_active = true LIMIT 1"), {"n": name_clean}).fetchone()
    return str(row[0]) if row else None


def _resolve_source_voucher(session: Session, cp_id: str, slip_number: str) -> Optional[str]:
    row = session.execute(text("""
        SELECT id FROM vouchers WHERE counterparty_id = :cp AND voucher_number = :vn AND voucher_type = 'purchase'
        ORDER BY trade_date DESC LIMIT 1
    """), {"cp": cp_id, "vn": slip_number}).fetchone()
    return str(row[0]) if row else None


def _map_status(raw: Optional[str]) -> str:
    if not raw:
        return "RECEIVED"
    return STATUS_KOREAN_MAP.get(raw.strip(), STATUS_KOREAN_MAP.get(raw.strip().replace(" ", ""), "RECEIVED"))


def _map_type(raw: Optional[str]) -> str:
    if not raw:
        return "NORMAL"
    return TYPE_KOREAN_MAP.get(raw.strip(), TYPE_KOREAN_MAP.get(raw.strip().replace(" ", ""), "NORMAL"))


def _compute_diff(existing: dict, new_data: dict) -> Optional[dict]:
    changes = []
    for field in INTAKE_DIFF_FIELDS:
        old_val, new_val = existing.get(field), new_data.get(field)
        if old_val is None and new_val is None:
            continue
        if isinstance(old_val, (Decimal, float)) and isinstance(new_val, (Decimal, float)):
            if abs(Decimal(str(old_val)) - Decimal(str(new_val))) < Decimal("0.01"):
                continue
        if str(old_val or "") != str(new_val or ""):
            changes.append({"field": field, "old": str(old_val) if old_val is not None else None, "new": str(new_val) if new_val is not None else None})
    if not changes:
        return None
    return {"before": {c["field"]: c["old"] for c in changes}, "after": {c["field"]: c["new"] for c in changes}, "changes": changes}


def _update_job(session, job_id, **kwargs):
    sets = ", ".join(f"{k} = :{k}" for k in kwargs)
    try:
        session.execute(text(f"UPDATE upload_jobs SET {sets} WHERE id = :jid"), {"jid": job_id, **kwargs})
        session.commit()
    except Exception as e:
        logger.warning(f"[IntakeParser] job update 실패: {e}")
        session.rollback()


def _fail_job(session, job_id, msg):
    try:
        session.rollback()
    except Exception:
        pass
    try:
        session.execute(text("UPDATE upload_jobs SET status='FAILED', error_message=:m, completed_at=:n WHERE id=:j"),
                        {"j": job_id, "m": msg[:2000], "n": datetime.utcnow()})
        session.commit()
    except Exception:
        pass


def parse_intake_excel(job_id: str) -> dict:
    session = SessionLocal()
    try:
        job_row = session.execute(text("SELECT id, file_path, original_filename FROM upload_jobs WHERE id=:j LIMIT 1"), {"j": job_id}).fetchone()
        if not job_row:
            return {"error": "Job not found"}
        file_path = dict(job_row._mapping)["file_path"]
        session.execute(text("UPDATE upload_jobs SET status='RUNNING', started_at=:n, progress=10 WHERE id=:j"), {"j": job_id, "n": datetime.utcnow()})
        session.commit()

        if not os.path.exists(file_path):
            _fail_job(session, job_id, f"파일 없음: {file_path}")
            return {"error": "File not found"}

        header_row = _detect_header_row(file_path) or 0
        try:
            df = pd.read_excel(file_path, engine="openpyxl", header=header_row)
        except Exception as e:
            _fail_job(session, job_id, f"엑셀 읽기 실패: {e}")
            return {"error": str(e)}

        if df.empty:
            _fail_job(session, job_id, "엑셀 비어있음")
            return {"error": "Empty"}

        df.columns = [str(c).strip() if not str(c).startswith("Unnamed") else f"col_{i}" for i, c in enumerate(df.columns)]
        df = df.dropna(how="all").reset_index(drop=True)
        _update_job(session, job_id, progress=25)

        column_map = _build_column_map(df, DEFAULT_INTAKE_MAPPING)
        required = ["intake_date", "counterparty_name", "slip_number"]
        missing = [f for f in required if f not in column_map]
        if missing:
            err = f"필수 컬럼 누락: {', '.join(missing)}. 헤더(행 {header_row}): {list(df.columns)}"
            _fail_job(session, job_id, err)
            return {"error": err}

        _update_job(session, job_id, progress=40)

        preview_rows, unmatched_names = [], set()
        stats = {"total_rows": len(df), "new": 0, "update": 0, "unchanged": 0, "locked": 0, "unmatched": 0, "error": 0, "excluded": 0}

        for idx, row in df.iterrows():
            is_sum, reason = _is_sum_row(row, column_map)
            if is_sum:
                preview_rows.append({"row_index": int(idx), "status": "excluded", "counterparty_name": _safe_str(row.get(column_map.get("counterparty_name"))) or "", "data": {}, "error": f"통계/요약 행: {reason}"})
                stats["excluded"] += 1
                continue

            intake_date_val = _safe_date(row.get(column_map.get("intake_date")))
            cp_name = _safe_str(row.get(column_map.get("counterparty_name")))
            slip_num = _safe_str(row.get(column_map.get("slip_number")))

            if not intake_date_val or not cp_name or not slip_num:
                preview_rows.append({"row_index": int(idx), "status": "error", "counterparty_name": cp_name or "", "data": {}, "error": "필수 값(반입일/반입처/전표번호) 누락"})
                stats["error"] += 1
                continue

            data = {}
            for f in ["pg_no", "model_name", "serial_number", "remarks", "memo"]:
                if f in column_map:
                    data[f] = _safe_str(row.get(column_map[f]))

            for f in ["actual_purchase_price", "intake_price"]:
                if f in column_map:
                    v = _safe_decimal(row.get(column_map[f]))
                    data[f] = float(v) if v is not None else 0.0

            data["purchase_date"] = _safe_date(row.get(column_map.get("purchase_date"))).isoformat() if "purchase_date" in column_map and _safe_date(row.get(column_map["purchase_date"])) else None

            raw_status = _safe_str(row.get(column_map.get("current_status"))) if "current_status" in column_map else None
            raw_type = _safe_str(row.get(column_map.get("intake_type"))) if "intake_type" in column_map else None
            data["current_status"] = _map_status(raw_status)
            data["intake_type"] = _map_type(raw_type)

            # 마진 검증 (저장하지 않음, 불일치 시 경고)
            warnings = []
            if "margin" in column_map:
                excel_margin = _safe_decimal(row.get(column_map["margin"]))
                calc_margin = (Decimal(str(data.get("actual_purchase_price", 0))) - Decimal(str(data.get("intake_price", 0))))
                if excel_margin is not None and abs(excel_margin - calc_margin) > Decimal("1"):
                    warnings.append(f"엑셀 마진({float(excel_margin)}) != 계산값({float(calc_margin)})")

            # 반입처 매칭 (필수)
            cp_id = _resolve_counterparty(session, cp_name)
            if not cp_id:
                unmatched_names.add(cp_name)
                preview_rows.append({"row_index": int(idx), "status": "unmatched", "counterparty_name": cp_name, "intake_date": intake_date_val.isoformat(), "slip_number": slip_num, "data": data, "error": f"반입처 '{cp_name}' 미매칭"})
                stats["unmatched"] += 1
                continue

            # 매입처 매칭 (선택)
            purchase_cp_name = _safe_str(row.get(column_map.get("purchase_counterparty_name"))) if "purchase_counterparty_name" in column_map else None
            purchase_cp_id = _resolve_counterparty(session, purchase_cp_name) if purchase_cp_name else None
            data["purchase_counterparty_id"] = purchase_cp_id
            data["purchase_counterparty_name"] = purchase_cp_name

            dedupe_key = _build_dedupe_key(cp_id, intake_date_val, slip_num, data.get("serial_number"), data.get("pg_no"))
            source_voucher_id = _resolve_source_voucher(session, cp_id, slip_num)

            existing = session.execute(text("""
                SELECT id, is_locked, actual_purchase_price, intake_price, model_name, current_status, intake_type, remarks, memo
                FROM intake_items WHERE dedupe_key = :dk LIMIT 1
            """), {"dk": dedupe_key}).fetchone()

            base_row = {
                "row_index": int(idx), "counterparty_name": cp_name, "counterparty_id": cp_id,
                "intake_date": intake_date_val.isoformat(), "slip_number": slip_num,
                "dedupe_key": dedupe_key, "data": data, "source_voucher_id": source_voucher_id,
                "warnings": warnings if warnings else None,
            }

            if existing:
                ed = dict(existing._mapping)
                if ed.get("is_locked"):
                    preview_rows.append({**base_row, "status": "locked", "error": "마감된 반입 내역"})
                    stats["locked"] += 1
                    continue

                diff = _compute_diff(ed, data)
                if diff is None:
                    preview_rows.append({**base_row, "status": "unchanged"})
                    stats["unchanged"] += 1
                else:
                    preview_rows.append({**base_row, "status": "update", "diff": diff, "existing_id": str(ed["id"])})
                    stats["update"] += 1
            else:
                preview_rows.append({**base_row, "status": "new"})
                stats["new"] += 1

            if len(df) > 0 and idx % max(1, len(df) // 10) == 0:
                _update_job(session, job_id, progress=min(40 + int((idx / len(df)) * 40), 80))

        _update_job(session, job_id, progress=85)

        preview_key = f"settlement:upload:preview:{job_id}"
        redis_client.setex(preview_key, 7200, json.dumps(preview_rows, cls=DecimalEncoder, ensure_ascii=False))
        unmatched_list = sorted(list(unmatched_names))
        redis_client.setex(f"settlement:upload:unmatched:{job_id}", 7200, json.dumps(unmatched_list, ensure_ascii=False))

        result_summary = {
            **stats, "unmatched_names": unmatched_list,
            "column_mapping_used": {k: str(v) for k, v in column_map.items()},
            "header_row_detected": header_row,
            "new_count": stats["new"], "update_count": stats["update"],
            "unchanged_count": stats["unchanged"], "locked_count": stats["locked"],
            "unmatched_count": stats["unmatched"], "error_count": stats["error"],
            "excluded_count": stats["excluded"],
        }
        session.execute(text("UPDATE upload_jobs SET result_summary=CAST(:s AS jsonb), status='SUCCEEDED', progress=100, completed_at=:n WHERE id=:j"),
                        {"j": job_id, "s": json.dumps(result_summary, cls=DecimalEncoder, ensure_ascii=False), "n": datetime.utcnow()})
        session.commit()
        logger.info(f"[IntakeParser] Job {job_id} 완료: {stats}")
        return result_summary

    except Exception as e:
        logger.error(f"[IntakeParser] Job {job_id} 예외: {e}")
        _fail_job(session, job_id, str(e)[:2000])
        return {"error": str(e)}
    finally:
        session.close()
