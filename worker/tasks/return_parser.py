"""
정산 관리 시스템 - UPM 반품 내역 엑셀 파싱 Worker
개별 기기 단위 파싱 → 거래처 매칭 → dedupe_key 생성 → 기존 건 diff 비교 → 원전표 매칭
변경 감지 규칙:
  - 신규 → new
  - 기존 + 미잠금 + diff 있음 → update
  - 기존 + 미잠금 + diff 없음 → unchanged
  - 기존 + 잠금 → locked (스킵)
"""

import io
import os
import re
import json
import uuid
import logging
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from typing import Optional

import pandas as pd
import redis
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker, Session

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://dwt_user:dwt_password@localhost:5532/dwt_price_center"
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6479/0")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

# 반품 엑셀 기본 컬럼 매핑
DEFAULT_RETURN_MAPPING = {
    "return_date": ["반품일", "거래일", "일자"],
    "counterparty_name": ["반품처", "거래처", "업체명"],
    "slip_number": ["전표번호", "번호", "No"],
    "pg_no": ["P/G No", "PG No", "P/G", "PG번호", "PG NO"],
    "model_name": ["모델명", "모델", "기종"],
    "serial_number": ["일련번호", "시리얼", "S/N"],
    "imei": ["IMEI", "imei"],
    "color": ["색상", "컬러", "Color"],
    "purchase_cost": ["매입원가"],
    "purchase_deduction": ["매입차감"],
    "return_amount": ["반품금액"],
    "as_cost": ["A/S금액", "AS금액", "A/S비용"],
    "remarks": ["특이사항"],
    "memo": ["비고"],
}

RETURN_DIFF_FIELDS = [
    "purchase_cost", "purchase_deduction", "return_amount", "as_cost",
    "model_name", "color", "remarks", "memo",
]


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
    best_row = 0
    best_score = 0
    for row_idx in range(min(max_scan, len(df_scan))):
        score = 0
        for val in df_scan.iloc[row_idx]:
            s = str(val).strip() if val is not None and not (isinstance(val, float) and pd.isna(val)) else ""
            if re.search(r'[가-힣a-zA-Z]{2,}', s):
                score += 1
        if score > best_score:
            best_score = score
            best_row = row_idx
    return best_row if best_row > 0 else None


def _is_sum_row(row, column_map: dict) -> tuple:
    _SUMMARY_KEYWORDS = r'합계|소계|총계|통계|평균|수량\s*\(건수\)|TOTAL|SUM|AVERAGE|SUBTOTAL'
    cp_col = column_map.get("counterparty_name")
    cp_val = str(row.get(cp_col, "")).strip() if cp_col else ""
    if cp_val and re.search(_SUMMARY_KEYWORDS, cp_val, re.IGNORECASE):
        return True, f"거래처 컬럼에 통계 키워드 감지 ('{cp_val}')"
    sn_col = column_map.get("slip_number")
    sn_val = str(row.get(sn_col, "")).strip() if sn_col else ""
    if sn_val and re.search(_SUMMARY_KEYWORDS, sn_val, re.IGNORECASE):
        return True, f"전표번호 컬럼에 통계 키워드 감지 ('{sn_val}')"
    if sn_val and re.search(r'^\d+건$', sn_val):
        return True, f"전표번호가 건수 집계 ('{sn_val}')"
    td_col = column_map.get("return_date")
    td_val = _safe_date(row.get(td_col)) if td_col else None
    if not td_val:
        if not cp_val and not sn_val:
            return True, "필수값(반품일/반품처/전표번호) 모두 누락"
        amount_fields = ["purchase_cost", "return_amount", "as_cost"]
        has_amount = any(
            _safe_decimal(row.get(column_map.get(f)))
            for f in amount_fields if f in column_map
        )
        if sum([not cp_val, not sn_val]) >= 1 and has_amount:
            return True, "반품일 없음 + 필수값 누락 + 금액 존재 (통계/요약 행)"
    return False, ""


def _build_dedupe_key(counterparty_id: str, return_date: date, slip_number: str,
                      imei: Optional[str], pg_no: Optional[str],
                      serial_number: Optional[str]) -> str:
    """중복 감지 키 생성: IMEI 우선, 없으면 복합키"""
    if imei:
        return f"{return_date.isoformat()}|{counterparty_id}|{imei}"
    parts = [return_date.isoformat(), counterparty_id, slip_number,
             pg_no or "", serial_number or ""]
    return "|".join(parts)


def _resolve_counterparty(session: Session, name: str) -> Optional[str]:
    if not name:
        return None
    name_clean = name.strip()
    result = session.execute(
        text("SELECT counterparty_id FROM counterparty_aliases WHERE alias_name = :name LIMIT 1"),
        {"name": name_clean}
    )
    row = result.fetchone()
    if row:
        return str(row[0])
    result = session.execute(
        text("SELECT id FROM counterparties WHERE name = :name AND is_active = true LIMIT 1"),
        {"name": name_clean}
    )
    row = result.fetchone()
    if row:
        return str(row[0])
    return None


def _resolve_source_voucher(session: Session, counterparty_id: str, slip_number: str) -> Optional[str]:
    """원전표 매칭: 같은 거래처 + 같은 전표번호의 매입 전표"""
    result = session.execute(
        text("""
            SELECT id FROM vouchers
            WHERE counterparty_id = :cp_id
              AND voucher_number = :vn
              AND voucher_type = 'purchase'
            ORDER BY trade_date DESC
            LIMIT 1
        """),
        {"cp_id": counterparty_id, "vn": slip_number}
    )
    row = result.fetchone()
    return str(row[0]) if row else None


def _compute_return_diff(existing: dict, new_data: dict) -> Optional[dict]:
    changes = []
    for field in RETURN_DIFF_FIELDS:
        old_val = existing.get(field)
        new_val = new_data.get(field)
        if old_val is None and new_val is None:
            continue
        if isinstance(old_val, (Decimal, float)) and isinstance(new_val, (Decimal, float)):
            if abs(Decimal(str(old_val)) - Decimal(str(new_val))) < Decimal("0.01"):
                continue
        if str(old_val or "") != str(new_val or ""):
            changes.append({
                "field": field,
                "old": str(old_val) if old_val is not None else None,
                "new": str(new_val) if new_val is not None else None,
            })
    if not changes:
        return None
    return {
        "before": {c["field"]: c["old"] for c in changes},
        "after": {c["field"]: c["new"] for c in changes},
        "changes": changes,
    }


def _update_job_progress(session: Session, job_id: str, progress: int):
    try:
        session.execute(
            text("UPDATE upload_jobs SET progress = :p WHERE id = :jid"),
            {"p": progress, "jid": job_id}
        )
        session.commit()
    except Exception as e:
        logger.warning(f"[ReturnParser] progress 업데이트 실패: {e}")
        session.rollback()


def _update_job_failed(session: Session, job_id: str, error_message: str):
    try:
        session.rollback()
    except Exception:
        pass
    try:
        session.execute(
            text("""
                UPDATE upload_jobs
                SET status = 'FAILED', error_message = :msg, completed_at = :now
                WHERE id = :jid
            """),
            {"jid": job_id, "msg": error_message[:2000], "now": datetime.utcnow()}
        )
        session.commit()
    except Exception as e:
        logger.error(f"[ReturnParser] FAILED 상태 업데이트 실패: {e}")
        try:
            session.rollback()
        except Exception:
            pass


def parse_return_excel(job_id: str) -> dict:
    """
    UPM 반품 내역 엑셀 파싱 메인 엔트리
    1. Job 조회 + 상태 RUNNING
    2. 엑셀 파일 읽기 (헤더 행 자동 감지)
    3. 컬럼 매핑
    4. 행별 파싱 → 거래처 매칭 → dedupe_key 생성 → 기존 건 diff 비교 → 원전표 매칭
    5. Redis 미리보기 저장 (TTL: 2시간)
    6. Job 결과 요약 저장
    """
    session = SessionLocal()

    try:
        # Step 1: Job 조회
        job_row = session.execute(
            text("SELECT id, job_type, status, file_path, original_filename FROM upload_jobs WHERE id = :job_id LIMIT 1"),
            {"job_id": job_id}
        ).fetchone()

        if not job_row:
            return {"error": "Job not found"}

        job_data = dict(job_row._mapping)
        file_path = job_data["file_path"]

        session.execute(
            text("UPDATE upload_jobs SET status = 'RUNNING', started_at = :now, progress = 10 WHERE id = :job_id"),
            {"job_id": job_id, "now": datetime.utcnow()}
        )
        session.commit()

        # Step 2: 엑셀 읽기
        if not os.path.exists(file_path):
            _update_job_failed(session, job_id, f"파일을 찾을 수 없습니다: {file_path}")
            return {"error": "File not found"}

        header_row = _detect_header_row(file_path) or 0
        logger.info(f"[ReturnParser] 감지된 헤더 행: {header_row}")

        try:
            df = pd.read_excel(file_path, engine="openpyxl", header=header_row)
        except Exception as e:
            _update_job_failed(session, job_id, f"엑셀 파일 읽기 실패: {str(e)}")
            return {"error": str(e)}

        if df.empty:
            _update_job_failed(session, job_id, "엑셀 파일이 비어있습니다")
            return {"error": "Empty file"}

        df.columns = [
            str(c).strip() if not str(c).startswith("Unnamed") else f"col_{i}"
            for i, c in enumerate(df.columns)
        ]
        df = df.dropna(how="all").reset_index(drop=True)

        _update_job_progress(session, job_id, 25)

        # Step 3: 컬럼 매핑
        column_map = _build_column_map(df, DEFAULT_RETURN_MAPPING)

        required = ["return_date", "counterparty_name", "slip_number"]
        missing = [f for f in required if f not in column_map]
        if missing:
            err_msg = (
                f"필수 컬럼을 찾을 수 없습니다: {', '.join(missing)}. "
                f"엑셀 헤더(행 {header_row}): {list(df.columns)}"
            )
            _update_job_failed(session, job_id, err_msg)
            return {"error": err_msg}

        _update_job_progress(session, job_id, 40)

        # Step 4: 행별 파싱
        preview_rows = []
        unmatched_names = set()
        stats = {
            "total_rows": len(df), "new": 0, "update": 0, "unchanged": 0,
            "locked": 0, "unmatched": 0, "error": 0, "excluded": 0,
        }

        for idx, row in df.iterrows():
            is_summary, reason = _is_sum_row(row, column_map)
            if is_summary:
                preview_rows.append({
                    "row_index": int(idx),
                    "status": "excluded",
                    "counterparty_name": _safe_str(row.get(column_map.get("counterparty_name"))) or "",
                    "counterparty_id": None,
                    "return_date": None,
                    "slip_number": _safe_str(row.get(column_map.get("slip_number"))) or "",
                    "data": {},
                    "error": f"통계/요약 행 (자동 제외): {reason}",
                })
                stats["excluded"] += 1
                continue

            return_date_val = _safe_date(row.get(column_map.get("return_date")))
            cp_name = _safe_str(row.get(column_map.get("counterparty_name")))
            slip_num = _safe_str(row.get(column_map.get("slip_number")))

            if not return_date_val or not cp_name or not slip_num:
                preview_rows.append({
                    "row_index": int(idx),
                    "status": "error",
                    "counterparty_name": cp_name or "",
                    "counterparty_id": None,
                    "return_date": str(return_date_val) if return_date_val else None,
                    "slip_number": slip_num or "",
                    "data": {},
                    "error": "필수 값(반품일/반품처/전표번호)이 누락되었습니다",
                })
                stats["error"] += 1
                continue

            # 기기/금액/상태 필드 파싱
            data = {}
            for field in ["pg_no", "model_name", "serial_number", "imei", "color", "remarks", "memo"]:
                if field in column_map:
                    data[field] = _safe_str(row.get(column_map[field]))

            for field in ["purchase_cost", "purchase_deduction", "return_amount", "as_cost"]:
                if field in column_map:
                    val = _safe_decimal(row.get(column_map[field]))
                    data[field] = float(val) if val is not None else 0.0

            # 거래처 매칭
            counterparty_id = _resolve_counterparty(session, cp_name)
            if not counterparty_id:
                unmatched_names.add(cp_name)
                preview_rows.append({
                    "row_index": int(idx),
                    "status": "unmatched",
                    "counterparty_name": cp_name,
                    "counterparty_id": None,
                    "return_date": return_date_val.isoformat(),
                    "slip_number": slip_num,
                    "data": data,
                    "error": f"거래처 '{cp_name}'을 찾을 수 없습니다",
                })
                stats["unmatched"] += 1
                continue

            # dedupe_key 생성
            dedupe_key = _build_dedupe_key(
                counterparty_id, return_date_val, slip_num,
                data.get("imei"), data.get("pg_no"), data.get("serial_number"),
            )

            # 원전표 매칭
            source_voucher_id = _resolve_source_voucher(session, counterparty_id, slip_num)

            # 기존 건 조회
            existing = session.execute(
                text("""
                    SELECT id, is_locked,
                           purchase_cost, purchase_deduction, return_amount, as_cost,
                           model_name, color, remarks, memo
                    FROM return_items
                    WHERE dedupe_key = :dk
                    LIMIT 1
                """),
                {"dk": dedupe_key}
            ).fetchone()

            if existing:
                existing_dict = dict(existing._mapping)

                if existing_dict.get("is_locked"):
                    preview_rows.append({
                        "row_index": int(idx),
                        "status": "locked",
                        "counterparty_name": cp_name,
                        "counterparty_id": counterparty_id,
                        "return_date": return_date_val.isoformat(),
                        "slip_number": slip_num,
                        "dedupe_key": dedupe_key,
                        "data": data,
                        "source_voucher_id": source_voucher_id,
                        "error": "마감된 반품 내역입니다. 변경할 수 없습니다.",
                    })
                    stats["locked"] += 1
                    continue

                diff = _compute_return_diff(existing_dict, data)
                if diff is None:
                    preview_rows.append({
                        "row_index": int(idx),
                        "status": "unchanged",
                        "counterparty_name": cp_name,
                        "counterparty_id": counterparty_id,
                        "return_date": return_date_val.isoformat(),
                        "slip_number": slip_num,
                        "dedupe_key": dedupe_key,
                        "data": data,
                        "source_voucher_id": source_voucher_id,
                    })
                    stats["unchanged"] += 1
                    continue

                preview_rows.append({
                    "row_index": int(idx),
                    "status": "update",
                    "counterparty_name": cp_name,
                    "counterparty_id": counterparty_id,
                    "return_date": return_date_val.isoformat(),
                    "slip_number": slip_num,
                    "dedupe_key": dedupe_key,
                    "data": data,
                    "diff": diff,
                    "source_voucher_id": source_voucher_id,
                    "existing_id": str(existing_dict["id"]),
                })
                stats["update"] += 1
            else:
                preview_rows.append({
                    "row_index": int(idx),
                    "status": "new",
                    "counterparty_name": cp_name,
                    "counterparty_id": counterparty_id,
                    "return_date": return_date_val.isoformat(),
                    "slip_number": slip_num,
                    "dedupe_key": dedupe_key,
                    "data": data,
                    "source_voucher_id": source_voucher_id,
                })
                stats["new"] += 1

            if len(df) > 0 and idx % max(1, len(df) // 10) == 0:
                progress = 40 + int((idx / len(df)) * 40)
                _update_job_progress(session, job_id, min(progress, 80))

        _update_job_progress(session, job_id, 85)

        # Step 5: Redis 미리보기 저장
        preview_key = f"settlement:upload:preview:{job_id}"
        redis_client.setex(preview_key, 7200,
                           json.dumps(preview_rows, cls=DecimalEncoder, ensure_ascii=False))

        unmatched_key = f"settlement:upload:unmatched:{job_id}"
        unmatched_list = sorted(list(unmatched_names))
        redis_client.setex(unmatched_key, 7200,
                           json.dumps(unmatched_list, ensure_ascii=False))

        _update_job_progress(session, job_id, 95)

        # Step 6: Job 결과 저장
        result_summary = {
            **stats,
            "unmatched_names": unmatched_list,
            "column_mapping_used": {k: str(v) for k, v in column_map.items()},
            "header_row_detected": header_row,
            "new_count": stats["new"],
            "update_count": stats["update"],
            "unchanged_count": stats["unchanged"],
            "locked_count": stats["locked"],
            "unmatched_count": stats["unmatched"],
            "error_count": stats["error"],
            "excluded_count": stats["excluded"],
        }

        session.execute(
            text("""
                UPDATE upload_jobs
                SET result_summary = CAST(:summary AS jsonb),
                    status = 'SUCCEEDED', progress = 100, completed_at = :now
                WHERE id = :job_id
            """),
            {
                "job_id": job_id,
                "summary": json.dumps(result_summary, cls=DecimalEncoder, ensure_ascii=False),
                "now": datetime.utcnow(),
            }
        )
        session.commit()

        logger.info(f"[ReturnParser] Job {job_id} 완료: {stats}")
        return result_summary

    except Exception as e:
        logger.error(f"[ReturnParser] Job {job_id} 예외: {e}")
        _update_job_failed(session, job_id, str(e)[:2000])
        return {"error": str(e)}

    finally:
        session.close()
