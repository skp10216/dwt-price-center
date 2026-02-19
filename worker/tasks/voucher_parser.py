"""
정산 관리 시스템 - UPM 전표 엑셀 파싱 Worker
판매/매입 전표 엑셀 파일 파싱 → 거래처 매칭 → diff 비교 → 미리보기 데이터 저장
변경 감지 규칙:
  - 신규 전표 → 즉시 반영 가능
  - OPEN/UNPAID → 덮어쓰기 가능
  - SETTLING/PARTIAL → 승인 대기 (VoucherChangeRequest)
  - LOCKED → 차단 (스킵)
"""

import os
import json
import uuid
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from typing import Optional

import pandas as pd
import redis
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker, Session

# 환경 변수
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://dwt_user:dwt_password@localhost:5432/dwt_price_center"
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# 데이터베이스 연결
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Redis 연결
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

# 기본 매핑: 매입 전표 (UPM 실제 컬럼명 기준, 리스트는 대체명 지원)
DEFAULT_PURCHASE_MAPPING = {
    "trade_date": ["매입일", "거래일", "일자"],
    "counterparty_name": ["매입처", "거래처", "업체명"],
    "voucher_number": ["번호", "전표번호", "No"],
    "quantity": ["수량"],
    "purchase_cost": ["매입원가"],
    "deduction_amount": ["차감금액"],
    "actual_purchase_price": ["실매입가"],
    "avg_unit_price": ["평균가"],
    "upm_settlement_status": ["정산현황"],
    "payment_info": ["송금정보"],
    "memo": ["비고"],
}

# 기본 매핑: 판매 전표 (UPM 실제 컬럼명 기준)
DEFAULT_SALES_MAPPING = {
    "trade_date": ["판매일", "거래일", "일자"],
    "counterparty_name": ["판매처", "거래처", "업체명"],
    "voucher_number": ["번호", "전표번호", "No"],
    "quantity": ["수량"],
    "purchase_cost": ["매입원가"],
    "purchase_deduction": ["매입차감"],
    "as_cost": ["A/S비용", "AS비용"],
    "sale_amount": ["판매금액"],
    "sale_deduction": ["판매차감"],
    "actual_sale_price": ["실판매가"],
    "actual_purchase_price": ["실매입가"],
    "profit": ["손익"],
    "profit_rate": ["수익율", "수익률"],
    "avg_margin": ["평균마진"],
    "memo": ["비고"],
}

# 비교 대상 필드 (diff 계산)
DIFF_FIELDS = [
    "quantity", "purchase_cost", "deduction_amount", "actual_purchase_price",
    "avg_unit_price", "purchase_deduction", "as_cost", "sale_amount",
    "sale_deduction", "actual_sale_price", "profit", "profit_rate",
    "avg_margin", "upm_settlement_status", "payment_info",
]


class DecimalEncoder(json.JSONEncoder):
    """JSON에 Decimal/date/UUID 직렬화"""
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, (date, datetime)):
            return o.isoformat()
        if isinstance(o, uuid.UUID):
            return str(o)
        return super().default(o)


def _safe_decimal(value) -> Optional[Decimal]:
    """안전한 Decimal 변환"""
    if value is None or pd.isna(value):
        return None
    try:
        s = str(value).strip().replace(",", "").replace("원", "").replace("₩", "")
        if s in ("", "-", "nan", "NaN"):
            return None
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def _safe_int(value) -> int:
    """안전한 int 변환"""
    if value is None or pd.isna(value):
        return 0
    try:
        return int(float(str(value).strip().replace(",", "")))
    except (ValueError, TypeError):
        return 0


def _safe_date(value) -> Optional[date]:
    """안전한 date 변환"""
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
        # pandas Timestamp
        return pd.Timestamp(s).date()
    except Exception:
        return None


def _safe_str(value) -> Optional[str]:
    """안전한 문자열 변환"""
    if value is None or pd.isna(value):
        return None
    s = str(value).strip()
    return s if s and s.lower() not in ("nan", "none") else None


def _find_column(df_columns, target_names):
    """엑셀 헤더에서 대상 컬럼 찾기 (유사 매칭)"""
    target_list = target_names if isinstance(target_names, list) else [target_names]
    for col in df_columns:
        col_clean = str(col).strip().replace(" ", "").lower()
        for target in target_list:
            target_clean = target.strip().replace(" ", "").lower()
            if target_clean in col_clean or col_clean in target_clean:
                return col
    return None


def _build_column_map(df, mapping: dict) -> dict:
    """매핑 설정 기반으로 실제 엑셀 컬럼 매핑 구성"""
    column_map = {}
    for db_field, excel_header in mapping.items():
        if isinstance(excel_header, list):
            col = _find_column(df.columns, excel_header)
        else:
            col = _find_column(df.columns, excel_header)
        if col is not None:
            column_map[db_field] = col
    return column_map


def _get_template_mapping(session: Session, voucher_type: str) -> Optional[dict]:
    """DB에서 기본 템플릿 매핑 가져오기"""
    try:
        result = session.execute(
            text("""
                SELECT column_mapping FROM upload_templates
                WHERE voucher_type = :vtype AND is_default = true
                LIMIT 1
            """),
            {"vtype": voucher_type}
        )
        row = result.fetchone()
        if row:
            return row[0] if isinstance(row[0], dict) else json.loads(row[0])
    except Exception:
        pass
    return None


def _resolve_counterparty(session: Session, name: str) -> Optional[str]:
    """거래처명 → counterparty_id (별칭 매칭 포함)"""
    if not name:
        return None

    name_clean = name.strip()

    # 1) 별칭 테이블에서 정확히 매칭
    result = session.execute(
        text("""
            SELECT ca.counterparty_id FROM counterparty_aliases ca
            WHERE ca.alias_name = :name
            LIMIT 1
        """),
        {"name": name_clean}
    )
    row = result.fetchone()
    if row:
        return str(row[0])

    # 2) 거래처 표준명에서 정확히 매칭
    result = session.execute(
        text("""
            SELECT id FROM counterparties
            WHERE name = :name AND is_active = true
            LIMIT 1
        """),
        {"name": name_clean}
    )
    row = result.fetchone()
    if row:
        return str(row[0])

    return None


def _compute_diff(existing_row: dict, new_data: dict) -> Optional[dict]:
    """기존 전표와 새 데이터의 diff 계산"""
    changes = []
    for field in DIFF_FIELDS:
        old_val = existing_row.get(field)
        new_val = new_data.get(field)

        # 둘 다 None이면 변경 없음
        if old_val is None and new_val is None:
            continue

        # Decimal 비교
        if isinstance(old_val, (Decimal, float)) and isinstance(new_val, (Decimal, float)):
            if abs(Decimal(str(old_val)) - Decimal(str(new_val))) < Decimal("0.01"):
                continue

        # 문자열 비교
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
    """Job 진행률 업데이트 (raw SQL)"""
    session.execute(
        text("UPDATE upload_jobs SET progress = :p WHERE id = :jid"),
        {"p": progress, "jid": job_id}
    )
    session.commit()


def _update_job_failed(session: Session, job_id: str, error_message: str):
    """Job 실패 상태로 업데이트 (raw SQL) - enum은 대문자"""
    session.execute(
        text("""
            UPDATE upload_jobs
            SET status = 'FAILED', error_message = :msg, completed_at = :now
            WHERE id = :jid
        """),
        {"jid": job_id, "msg": error_message, "now": datetime.utcnow()}
    )
    session.commit()


def parse_voucher_excel(job_id: str) -> dict:
    """
    UPM 전표 엑셀 파싱 태스크 (메인 엔트리)

    1. Job 조회 + 상태 업데이트
    2. 엑셀 파일 읽기
    3. 컬럼 매핑 (템플릿 기반 or 기본)
    4. 거래처 매칭 (별칭 테이블)
    5. 기존 전표 대비 diff 비교 + 변경 감지 규칙 적용
    6. 미리보기 데이터 Redis 저장 (TTL: 2시간)
    7. Job 결과 요약 저장

    ※ ORM 모델 대신 raw SQL 사용 (worker 컨테이너에 backend 패키지 없음)
    """
    session = SessionLocal()

    try:
        # =====================================================================
        # Step 1: Job 조회 + 상태 업데이트 (raw SQL)
        # =====================================================================
        job_row = session.execute(
            text("""
                SELECT id, job_type, status, file_path, original_filename
                FROM upload_jobs
                WHERE id = :job_id
                LIMIT 1
            """),
            {"job_id": job_id}
        ).fetchone()

        if not job_row:
            return {"error": "Job not found"}

        job_data = dict(job_row._mapping)
        file_path = job_data["file_path"]
        job_type_str = job_data["job_type"]

        # 상태 → RUNNING (PostgreSQL enum은 대문자)
        session.execute(
            text("""
                UPDATE upload_jobs
                SET status = 'RUNNING', started_at = :now, progress = 10
                WHERE id = :job_id
            """),
            {"job_id": job_id, "now": datetime.utcnow()}
        )
        session.commit()

        is_sales = ("sales" in str(job_type_str))
        voucher_type = "sales" if is_sales else "purchase"

        # =====================================================================
        # Step 2: 엑셀 파일 읽기
        # =====================================================================
        try:
            df = pd.read_excel(file_path, engine="openpyxl")
        except Exception as e:
            _update_job_failed(session, job_id, f"엑셀 파일 읽기 실패: {str(e)}")
            return {"error": str(e)}

        if df.empty:
            _update_job_failed(session, job_id, "엑셀 파일이 비어있습니다")
            return {"error": "Empty file"}

        # 빈 행 제거
        df = df.dropna(how="all").reset_index(drop=True)

        _update_job_progress(session, job_id, 25)

        # =====================================================================
        # Step 3: 컬럼 매핑 (DB 템플릿 → 기본 매핑)
        # =====================================================================
        template_mapping = _get_template_mapping(session, voucher_type)
        if template_mapping:
            mapping = template_mapping
        else:
            mapping = DEFAULT_SALES_MAPPING if is_sales else DEFAULT_PURCHASE_MAPPING

        column_map = _build_column_map(df, mapping)

        # 필수 컬럼 확인
        required = ["trade_date", "counterparty_name", "voucher_number"]
        missing = [f for f in required if f not in column_map]
        if missing:
            err_msg = (
                f"필수 컬럼을 찾을 수 없습니다: {', '.join(missing)}. "
                f"엑셀 헤더: {list(df.columns)}"
            )
            _update_job_failed(session, job_id, err_msg)
            return {"error": err_msg}

        _update_job_progress(session, job_id, 40)

        # =====================================================================
        # Step 4~5: 행 단위 파싱 + 거래처 매칭 + diff 비교
        # =====================================================================
        preview_rows = []
        unmatched_names = set()
        stats = {
            "total_rows": len(df),
            "new": 0,
            "update": 0,
            "conflict": 0,
            "locked": 0,
            "unmatched": 0,
            "error": 0,
        }

        for idx, row in df.iterrows():
            # 파싱
            trade_date_val = _safe_date(row.get(column_map.get("trade_date")))
            cp_name = _safe_str(row.get(column_map.get("counterparty_name")))
            v_number = _safe_str(row.get(column_map.get("voucher_number")))

            # 필수 값 검증
            if not trade_date_val or not cp_name or not v_number:
                preview_rows.append({
                    "row_index": int(idx),
                    "status": "error",
                    "counterparty_name": cp_name or "",
                    "counterparty_id": None,
                    "trade_date": str(trade_date_val) if trade_date_val else None,
                    "voucher_number": v_number or "",
                    "data": {},
                    "error": "필수 값(일자/거래처/전표번호)이 누락되었습니다",
                })
                stats["error"] += 1
                continue

            # 나머지 필드 파싱
            data = {}
            numeric_fields = [
                "quantity", "purchase_cost", "deduction_amount", "actual_purchase_price",
                "avg_unit_price", "purchase_deduction", "as_cost", "sale_amount",
                "sale_deduction", "actual_sale_price", "profit", "profit_rate", "avg_margin",
            ]
            for field in numeric_fields:
                if field in column_map:
                    if field == "quantity":
                        data[field] = _safe_int(row.get(column_map[field]))
                    else:
                        val = _safe_decimal(row.get(column_map[field]))
                        data[field] = float(val) if val is not None else None

            string_fields = ["upm_settlement_status", "payment_info"]
            for field in string_fields:
                if field in column_map:
                    data[field] = _safe_str(row.get(column_map[field]))

            # 거래처 매칭
            counterparty_id = _resolve_counterparty(session, cp_name)

            if not counterparty_id:
                unmatched_names.add(cp_name)
                preview_rows.append({
                    "row_index": int(idx),
                    "status": "unmatched",
                    "counterparty_name": cp_name,
                    "counterparty_id": None,
                    "trade_date": trade_date_val.isoformat(),
                    "voucher_number": v_number,
                    "data": data,
                    "error": f"거래처 '{cp_name}'을 찾을 수 없습니다",
                })
                stats["unmatched"] += 1
                continue

            # 기존 전표 조회 (UNIQUE KEY)
            existing = session.execute(
                text("""
                    SELECT id, settlement_status, payment_status,
                           quantity, purchase_cost, deduction_amount, actual_purchase_price,
                           avg_unit_price, purchase_deduction, as_cost, sale_amount,
                           sale_deduction, actual_sale_price, profit, profit_rate,
                           avg_margin, upm_settlement_status, payment_info
                    FROM vouchers
                    WHERE counterparty_id = :cp_id
                      AND trade_date = :td
                      AND voucher_number = :vn
                    LIMIT 1
                """),
                {
                    "cp_id": counterparty_id,
                    "td": trade_date_val,
                    "vn": v_number,
                }
            ).fetchone()

            if existing:
                existing_dict = dict(existing._mapping)
                s_status = existing_dict.get("settlement_status", "open")
                p_status = existing_dict.get("payment_status", "unpaid")

                # === 변경 감지 규칙 ===
                # LOCKED → 차단
                if s_status == "locked" or p_status == "locked":
                    preview_rows.append({
                        "row_index": int(idx),
                        "status": "locked",
                        "counterparty_name": cp_name,
                        "counterparty_id": counterparty_id,
                        "trade_date": trade_date_val.isoformat(),
                        "voucher_number": v_number,
                        "data": data,
                        "error": "마감된 전표입니다. 변경할 수 없습니다.",
                    })
                    stats["locked"] += 1
                    continue

                # diff 계산
                diff = _compute_diff(existing_dict, data)

                if diff is None:
                    # 변경 없음 → update (동일 데이터)
                    preview_rows.append({
                        "row_index": int(idx),
                        "status": "unchanged",
                        "counterparty_name": cp_name,
                        "counterparty_id": counterparty_id,
                        "trade_date": trade_date_val.isoformat(),
                        "voucher_number": v_number,
                        "data": data,
                    })
                    continue

                # SETTLING/PARTIAL → 승인 대기 (conflict)
                if s_status in ("settling", "settled") or p_status in ("partial", "paid"):
                    preview_rows.append({
                        "row_index": int(idx),
                        "status": "conflict",
                        "counterparty_name": cp_name,
                        "counterparty_id": counterparty_id,
                        "trade_date": trade_date_val.isoformat(),
                        "voucher_number": v_number,
                        "data": data,
                        "diff": diff,
                        "error": f"정산 진행 중인 전표입니다 (상태: {s_status}/{p_status}). 승인이 필요합니다.",
                    })
                    stats["conflict"] += 1
                    continue

                # OPEN/UNPAID → 덮어쓰기 가능
                preview_rows.append({
                    "row_index": int(idx),
                    "status": "update",
                    "counterparty_name": cp_name,
                    "counterparty_id": counterparty_id,
                    "trade_date": trade_date_val.isoformat(),
                    "voucher_number": v_number,
                    "data": data,
                    "diff": diff,
                })
                stats["update"] += 1

            else:
                # 신규 전표
                preview_rows.append({
                    "row_index": int(idx),
                    "status": "new",
                    "counterparty_name": cp_name,
                    "counterparty_id": counterparty_id,
                    "trade_date": trade_date_val.isoformat(),
                    "voucher_number": v_number,
                    "data": data,
                })
                stats["new"] += 1

            # 진행률 업데이트 (40~80)
            if len(df) > 0 and idx % max(1, len(df) // 10) == 0:
                progress = 40 + int((idx / len(df)) * 40)
                _update_job_progress(session, job_id, min(progress, 80))

        _update_job_progress(session, job_id, 85)

        # =====================================================================
        # Step 6: Redis에 미리보기 데이터 저장 (TTL: 2시간)
        # =====================================================================
        preview_key = f"settlement:upload:preview:{job_id}"
        redis_client.setex(
            preview_key,
            7200,  # 2시간
            json.dumps(preview_rows, cls=DecimalEncoder, ensure_ascii=False),
        )

        unmatched_key = f"settlement:upload:unmatched:{job_id}"
        unmatched_list = list(unmatched_names)
        redis_client.setex(
            unmatched_key,
            7200,
            json.dumps(unmatched_list, ensure_ascii=False),
        )

        _update_job_progress(session, job_id, 95)

        # =====================================================================
        # Step 7: Job 결과 요약 저장
        # =====================================================================
        result_summary = {
            "total_rows": stats["total_rows"],
            "new_count": stats["new"],
            "update_count": stats["update"],
            "conflict_count": stats["conflict"],
            "locked_count": stats["locked"],
            "unmatched_count": stats["unmatched"],
            "error_count": stats["error"],
            "unmatched_names": unmatched_list,
            "column_mapping_used": {k: str(v) for k, v in column_map.items()},
        }

        session.execute(
            text("""
                UPDATE upload_jobs
                SET result_summary = CAST(:summary AS jsonb),
                    status = 'SUCCEEDED',
                    progress = 100,
                    completed_at = :now
                WHERE id = :job_id
            """),
            {
                "job_id": job_id,
                "summary": json.dumps(result_summary, cls=DecimalEncoder, ensure_ascii=False),
                "now": datetime.utcnow(),
            }
        )
        session.commit()

        return result_summary

    except Exception as e:
        session.rollback()
        try:
            _update_job_failed(session, job_id, str(e)[:2000])
        except Exception:
            pass
        return {"error": str(e)}

    finally:
        session.close()
