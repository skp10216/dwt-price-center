"""
정산 도메인 - UPM 전표 엑셀 업로드 (판매/매입 분리)
파일 업로드 → Job 생성 → Worker 파싱 → 미리보기 → 확정(UPSERT)
+ 미리보기(Preview): 업로드 전 엑셀 파싱 검증 (동기 처리)
"""

import uuid
import hashlib
import io
from typing import Optional
from pathlib import Path
from datetime import datetime, date
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

import pandas as pd

from app.core.config import settings
from app.core.database import get_db, get_redis
from app.api.deps import get_current_user
from app.models.user import User
from app.models.upload_job import UploadJob
from app.models.enums import JobType, JobStatus, AuditAction
from app.models.audit_log import AuditLog
from app.schemas.settlement import UploadJobResponse, UploadJobDetailResponse

import redis.asyncio as aioredis
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# 엑셀 파싱 유틸리티 (Preview용 - Worker 로직 재사용)
# =============================================================================

# 기본 매핑: 매입 전표 (UPM 실제 컬럼명 기준, 리스트는 대체명 지원)
_DEFAULT_PURCHASE_MAPPING = {
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
_DEFAULT_SALES_MAPPING = {
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


def _safe_decimal(value) -> Optional[Decimal]:
    """안전한 Decimal 변환"""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        s = str(value).strip().replace(",", "").replace("원", "").replace("₩", "")
        if s in ("", "-", "nan", "NaN"):
            return None
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def _safe_int(value) -> int:
    """안전한 int 변환"""
    if value is None:
        return 0
    try:
        if pd.isna(value):
            return 0
    except (TypeError, ValueError):
        pass
    try:
        return int(float(str(value).strip().replace(",", "")))
    except (ValueError, TypeError):
        return 0


def _safe_date(value) -> Optional[date]:
    """안전한 date 변환"""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
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


def _safe_str(value) -> Optional[str]:
    """안전한 문자열 변환"""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    s = str(value).strip()
    return s if s and s.lower() not in ("nan", "none") else None


def _normalize(s: str) -> str:
    """컬럼명 정규화: 공백·특수문자 제거, 소문자"""
    import re
    return re.sub(r'[\s\.\-_·/\\()（）\u200b\ufeff]+', '', str(s).strip()).lower()


def _find_column(df_columns, target_names):
    """
    엑셀 헤더에서 대상 컬럼 찾기 (3단계 매칭)
    1) 정규화된 정확 매칭
    2) 포함 매칭 (target in col 또는 col in target)
    3) 숫자 접미사 제거 후 매칭 (예: '번호.1' → '번호')
    """
    target_list = target_names if isinstance(target_names, list) else [target_names]
    normalized_targets = [_normalize(t) for t in target_list]

    # 1단계: 정확 매칭
    for col in df_columns:
        col_n = _normalize(str(col))
        if col_n in normalized_targets:
            return col

    # 2단계: 포함 매칭
    for col in df_columns:
        col_n = _normalize(str(col))
        if not col_n:
            continue
        for tn in normalized_targets:
            if tn and (tn in col_n or col_n in tn):
                return col

    # 3단계: 숫자 접미사 제거 후 매칭 (pandas duplicate 컬럼: '번호.1')
    import re
    for col in df_columns:
        col_base = re.sub(r'\.\d+$', '', _normalize(str(col)))
        if col_base in normalized_targets:
            return col

    return None


def _build_column_map(df, mapping: dict) -> dict:
    """매핑 설정 기반으로 실제 엑셀 컬럼 매핑 구성"""
    column_map = {}
    for db_field, excel_header in mapping.items():
        col = _find_column(df.columns, excel_header)
        if col is not None:
            column_map[db_field] = col
    return column_map


def _detect_header_row(contents: bytes, max_scan: int = 10) -> Optional[int]:
    """
    엑셀 파일에서 실제 헤더 행을 자동 감지한다.
    첫 번째 행이 비어있거나 숫자만 있는 경우, 실제 헤더 행 번호를 반환.
    (UPM 엑셀은 첫 행이 제목이거나 빈 행인 경우가 있음)
    """
    try:
        df_scan = pd.read_excel(io.BytesIO(contents), engine="openpyxl", header=None, nrows=max_scan)
    except Exception:
        return None

    # 각 행에 한글 텍스트가 포함된 개수를 세어 가장 많은 행을 헤더로 판단
    import re
    best_row = 0
    best_score = 0
    for row_idx in range(min(max_scan, len(df_scan))):
        score = 0
        for val in df_scan.iloc[row_idx]:
            s = str(val).strip() if val is not None and not (isinstance(val, float) and pd.isna(val)) else ""
            # 한글/영문 텍스트(2자 이상)가 있으면 헤더 후보
            if re.search(r'[가-힣a-zA-Z]{2,}', s):
                score += 1
        if score > best_score:
            best_score = score
            best_row = row_idx
    # 0번째 행이 아닌 경우만 반환 (0이면 pandas 기본 동작)
    return best_row if best_row > 0 else None


# =============================================================================
# Preview 엔드포인트 (업로드 전 엑셀 파싱 검증)
# =============================================================================

@router.post("/sales/preview")
async def preview_sales_upload(
    file: UploadFile = File(..., description="UPM 판매 전표 엑셀"),
    template_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """UPM 판매 전표 미리보기 검증 (업로드 전 데이터 확인)"""
    return await _handle_preview(file, "sales", db, template_id)


@router.post("/purchase/preview")
async def preview_purchase_upload(
    file: UploadFile = File(..., description="UPM 매입 전표 엑셀"),
    template_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """UPM 매입 전표 미리보기 검증 (업로드 전 데이터 확인)"""
    return await _handle_preview(file, "purchase", db, template_id)


async def _handle_preview(
    file: UploadFile,
    voucher_type: str,
    db: AsyncSession,
    template_id: Optional[str] = None,
) -> dict:
    """
    공통 미리보기 처리: 엑셀 파싱 → 컬럼 매핑 → 기본 검증 → 결과 반환
    DB에 저장하지 않고 파싱 결과만 반환한다.
    """
    # 파일 읽기
    contents = await file.read()
    logger.info(f"[Preview] 파일명={file.filename}, 크기={len(contents)}바이트, 타입={voucher_type}")
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="파일 크기가 50MB를 초과합니다")

    # 헤더 행 자동 감지 (첫 행이 타이틀/빈 행인 경우 대응)
    header_row = _detect_header_row(contents) or 0
    logger.info(f"[Preview] 감지된 헤더 행: {header_row}")

    # 엑셀 파싱
    try:
        df = pd.read_excel(io.BytesIO(contents), engine="openpyxl", header=header_row)
    except Exception as e:
        logger.error(f"[Preview] 엑셀 파싱 실패: {e}")
        raise HTTPException(status_code=400, detail=f"엑셀 파일 읽기 실패: {str(e)}")

    if df.empty:
        raise HTTPException(status_code=400, detail="엑셀 파일이 비어있습니다")

    # 컬럼명 정리: 'Unnamed:' 컬럼 제거, 앞뒤 공백 제거
    df.columns = [
        str(c).strip() if not str(c).startswith("Unnamed") else f"col_{i}"
        for i, c in enumerate(df.columns)
    ]

    # 빈 행 제거
    df = df.dropna(how="all").reset_index(drop=True)

    # 컬럼 매핑: DB 템플릿 → 기본 매핑
    from app.models.upload_template import UploadTemplate
    from app.models.enums import VoucherType

    mapping = None
    vtype_enum = VoucherType.SALES if voucher_type == "sales" else VoucherType.PURCHASE

    # DB 템플릿 조회 (template_id가 지정된 경우)
    if template_id:
        try:
            result = await db.execute(
                select(UploadTemplate.column_mapping).where(
                    UploadTemplate.id == uuid.UUID(template_id)
                ).limit(1)
            )
            row = result.scalar_one_or_none()
            if row:
                mapping = row if isinstance(row, dict) else json.loads(row)
        except (ValueError, Exception):
            pass  # 잘못된 template_id는 무시

    # 기본 템플릿 조회 (ORM 사용 → enum 타입 안전)
    if not mapping:
        result = await db.execute(
            select(UploadTemplate.column_mapping).where(
                UploadTemplate.voucher_type == vtype_enum,
                UploadTemplate.is_default == True,
            ).limit(1)
        )
        row = result.scalar_one_or_none()
        if row:
            mapping = row if isinstance(row, dict) else json.loads(row)

    # 하드코딩 기본 매핑
    if not mapping:
        mapping = _DEFAULT_SALES_MAPPING if voucher_type == "sales" else _DEFAULT_PURCHASE_MAPPING

    logger.info(f"[Preview] 엑셀 헤더(정제 후): {[str(c) for c in df.columns]}")
    logger.info(f"[Preview] 사용 매핑: {mapping}")

    column_map = _build_column_map(df, mapping)
    logger.info(f"[Preview] 매핑 결과: {column_map}")

    # 필수 컬럼 확인
    required_fields = {
        "trade_date": "거래일(판매일/매입일)",
        "counterparty_name": "거래처(판매처/매입처)",
        "voucher_number": "전표번호(번호/No)",
    }
    missing = [f for f in required_fields if f not in column_map]
    if missing:
        missing_labels = [required_fields[f] for f in missing]
        detail_msg = (
            f"필수 컬럼을 찾을 수 없습니다: {', '.join(missing_labels)}. "
            f"현재 엑셀 헤더: {[str(c) for c in df.columns if not str(c).startswith('col_')]}. "
            f"엑셀 파일의 첫 행(또는 헤더 행)에 '판매일', '판매처', '번호' 등의 컬럼명이 있어야 합니다."
        )
        logger.warning(f"[Preview] {detail_msg}")
        raise HTTPException(status_code=400, detail=detail_msg)

    # 행별 파싱 → PreviewRow 생성 (프론트엔드 PreviewRow 인터페이스에 맞춤)
    import re as _re

    rows = []
    excluded_count = 0
    for idx, row_data in df.iterrows():
        trade_date_val = _safe_date(row_data.get(column_map.get("trade_date")))
        cp_name = _safe_str(row_data.get(column_map.get("counterparty_name")))
        v_number = _safe_str(row_data.get(column_map.get("voucher_number")))

        # 수량
        quantity = _safe_int(row_data.get(column_map.get("quantity"))) if "quantity" in column_map else 0

        # 비고 (memo)
        memo = _safe_str(row_data.get(column_map.get("memo"))) if "memo" in column_map else None

        # 금액 (판매: actual_sale_price, 매입: actual_purchase_price)
        amount = Decimal("0")
        if voucher_type == "sales" and "actual_sale_price" in column_map:
            val = _safe_decimal(row_data.get(column_map["actual_sale_price"]))
            amount = val if val else Decimal("0")
        elif voucher_type == "purchase" and "actual_purchase_price" in column_map:
            val = _safe_decimal(row_data.get(column_map["actual_purchase_price"]))
            amount = val if val else Decimal("0")
        elif "purchase_cost" in column_map:
            val = _safe_decimal(row_data.get(column_map["purchase_cost"]))
            amount = val if val else Decimal("0")

        # ── 합계/소계 행 자동 감지 → excluded 처리 ──
        # 패턴: 거래일 없음 + (전표번호에 '건' 포함 또는 거래처에 '합계/소계/총계' 포함)
        is_summary = False
        if not trade_date_val:
            # 전표번호에 "건" 이 포함된 경우 (예: "360건")
            if v_number and _re.search(r'\d+건', v_number):
                is_summary = True
            # 거래처명에 합계 키워드
            if cp_name and _re.search(r'합계|소계|총계|TOTAL|SUM', cp_name, _re.IGNORECASE):
                is_summary = True
            # 거래일도 없고 거래처도 없지만 금액이 매우 크면 (마지막 행이 합산)
            if not trade_date_val and not cp_name and not v_number and amount > Decimal("0"):
                # 모든 필수값이 비어있는데 금액만 있으면 합계행일 가능성 높음
                is_summary = True

        # 상태/메시지 결정
        status = "ok"
        message = None

        if is_summary:
            status = "excluded"
            message = "합계/소계 행 (자동 제외)"
            excluded_count += 1
        elif not trade_date_val:
            status = "error"
            message = "거래일자가 누락되었습니다"
        elif not cp_name:
            status = "error"
            message = "거래처명이 누락되었습니다"
        elif not v_number:
            status = "error"
            message = "전표번호가 누락되었습니다"
        elif amount == Decimal("0"):
            status = "warning"
            message = "금액이 0원입니다"

        rows.append({
            "row_number": int(idx) + 1,
            "trade_date": trade_date_val.isoformat() if trade_date_val else "",
            "counterparty_name": cp_name or "",
            "voucher_number": v_number or "",
            "quantity": quantity,
            "amount": float(amount),
            "memo": memo or "",
            "status": status,
            "message": message,
        })

    logger.info(f"[Preview] 총 {len(rows)}행, 제외={excluded_count}행")
    return {"rows": rows, "excluded_count": excluded_count}


# =============================================================================
# 업로드 엔드포인트 (Job 생성 → Worker 비동기 처리)
# =============================================================================

@router.post("/sales-excel", response_model=UploadJobResponse, status_code=201)
async def upload_sales_excel(
    file: UploadFile = File(..., description="UPM 판매 전표 엑셀"),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    """UPM 판매 전표 엑셀 업로드"""
    return await _handle_voucher_upload(
        file=file,
        job_type=JobType.VOUCHER_SALES_EXCEL,
        db=db,
        redis=redis,
        user=current_user,
    )


@router.post("/purchase-excel", response_model=UploadJobResponse, status_code=201)
async def upload_purchase_excel(
    file: UploadFile = File(..., description="UPM 매입 전표 엑셀"),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    """UPM 매입 전표 엑셀 업로드"""
    return await _handle_voucher_upload(
        file=file,
        job_type=JobType.VOUCHER_PURCHASE_EXCEL,
        db=db,
        redis=redis,
        user=current_user,
    )


async def _handle_voucher_upload(
    file: UploadFile,
    job_type: JobType,
    db: AsyncSession,
    redis: aioredis.Redis,
    user: User,
) -> UploadJobResponse:
    """공통 업로드 처리"""
    # 파일 크기 체크
    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="파일 크기가 50MB를 초과합니다")

    # 파일 해시
    file_hash = hashlib.sha256(contents).hexdigest()

    # 중복 업로드 체크 (같은 해시 + 최근 5분 이내 QUEUED/RUNNING만 거부)
    # 오래된 QUEUED 작업은 자동으로 FAILED 처리하여 재업로드 허용
    from datetime import timedelta
    recent_cutoff = datetime.utcnow() - timedelta(minutes=5)
    dup_result = await db.execute(
        select(UploadJob).where(
            UploadJob.file_hash == file_hash,
            UploadJob.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
        )
    )
    dup_jobs = dup_result.scalars().all()
    for dup_job in dup_jobs:
        if dup_job.created_at > recent_cutoff:
            # 최근 5분 이내 작업이면 중복 거부
            raise HTTPException(status_code=400, detail="동일 파일이 이미 처리 중입니다. 잠시 후 다시 시도해주세요.")
        else:
            # 5분 이상 된 QUEUED/RUNNING 작업은 타임아웃 처리
            dup_job.status = JobStatus.FAILED
            dup_job.error_message = "작업 타임아웃 (자동 정리)"
            logger.info(f"[Upload] 오래된 작업 자동 정리: {dup_job.id}")

    # 파일 저장
    upload_dir = Path(settings.UPLOAD_DIR) / "settlement"
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_id = str(uuid.uuid4())
    ext = Path(file.filename or "upload.xlsx").suffix
    file_path = upload_dir / f"{file_id}{ext}"
    file_path.write_bytes(contents)

    # Job 생성
    job = UploadJob(
        job_type=job_type,
        status=JobStatus.QUEUED,
        file_path=str(file_path),
        original_filename=file.filename or "unknown",
        file_hash=file_hash,
        created_by=user.id,
    )
    db.add(job)

    # 감사로그
    db.add(AuditLog(
        user_id=user.id,
        action=AuditAction.UPLOAD_START,
        target_type="upload_job",
        target_id=job.id,
        after_data={
            "job_type": job_type.value,
            "filename": file.filename,
            "file_hash": file_hash,
        },
    ))

    await db.flush()
    await db.commit()

    # RQ를 이용한 정상적인 Job enqueue (Worker가 올바르게 소비 가능)
    from rq import Queue
    import redis as sync_redis_lib

    try:
        sync_redis_conn = sync_redis_lib.Redis.from_url(settings.REDIS_URL)
        q = Queue("default", connection=sync_redis_conn)
        q.enqueue(
            "tasks.voucher_parser.parse_voucher_excel",
            str(job.id),
            job_timeout="10m",
        )
        logger.info(f"[Upload] Job {job.id} → RQ 큐 enqueue 완료")
    except Exception as enq_err:
        logger.error(f"[Upload] RQ enqueue 실패: {enq_err}")
        # enqueue 실패 시 job 상태를 FAILED로 변경
        job.status = JobStatus.FAILED
        job.error_message = f"작업 큐 등록 실패: {str(enq_err)}"
        await db.commit()

    return UploadJobResponse.model_validate(job)


@router.get("/jobs", response_model=dict)
async def list_upload_jobs(
    job_type: Optional[str] = Query(None, description="작업 타입 필터"),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """업로드 작업 내역 조회"""
    query = select(UploadJob).where(
        UploadJob.job_type.in_([
            JobType.VOUCHER_SALES_EXCEL,
            JobType.VOUCHER_PURCHASE_EXCEL,
        ])
    )

    if job_type:
        query = query.where(UploadJob.job_type == job_type)
    if status_filter:
        query = query.where(UploadJob.status == status_filter)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(UploadJob.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    jobs = result.scalars().all()

    return {
        "jobs": [UploadJobResponse.model_validate(j) for j in jobs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/jobs/{job_id}", response_model=UploadJobDetailResponse)
async def get_upload_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    """업로드 작업 상세 조회 (미리보기 포함)"""
    job = await db.get(UploadJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    base = UploadJobResponse.model_validate(job)

    # Redis에서 미리보기 데이터 가져오기
    preview_key = f"settlement:upload:preview:{job_id}"
    preview_data = await redis.get(preview_key)
    preview_rows = json.loads(preview_data) if preview_data else []

    unmatched_key = f"settlement:upload:unmatched:{job_id}"
    unmatched_data = await redis.get(unmatched_key)
    unmatched = json.loads(unmatched_data) if unmatched_data else []

    return UploadJobDetailResponse(
        **base.model_dump(),
        preview_rows=preview_rows,
        unmatched_counterparties=unmatched,
    )


@router.delete("/jobs/{job_id}", response_model=dict)
async def delete_upload_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    """업로드 작업 삭제 (QUEUED/FAILED 상태만 가능, RUNNING은 거부)"""
    job = await db.get(UploadJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    # RUNNING 상태의 작업은 삭제 불가
    if job.status == JobStatus.RUNNING:
        raise HTTPException(status_code=400, detail="실행 중인 작업은 삭제할 수 없습니다. 완료 후 다시 시도해주세요.")

    # Redis 미리보기/unmatched 데이터 삭제
    preview_key = f"settlement:upload:preview:{job_id}"
    unmatched_key = f"settlement:upload:unmatched:{job_id}"
    await redis.delete(preview_key, unmatched_key)

    # 파일 삭제
    if job.file_path:
        try:
            file_p = Path(job.file_path)
            if file_p.exists():
                file_p.unlink()
        except Exception as e:
            logger.warning(f"[Upload] 파일 삭제 실패: {e}")

    # 감사로그
    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.UPLOAD_DELETE,
        target_type="upload_job",
        target_id=job.id,
        before_data={"status": job.status.value if hasattr(job.status, 'value') else str(job.status)},
    ))

    await db.delete(job)
    await db.commit()

    logger.info(f"[Upload] Job {job_id} 삭제 완료 by user={current_user.id}")
    return {"detail": "작업이 삭제되었습니다", "id": str(job_id)}


@router.post("/jobs/{job_id}/confirm", response_model=dict)
async def confirm_upload_job(
    job_id: uuid.UUID,
    exclude_conflicts: bool = Query(True, description="변경 충돌 건은 변경요청으로 보낼지"),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    """업로드 확정 → UPSERT 실행"""
    from app.models.voucher import Voucher
    from app.models.counterparty import CounterpartyAlias
    from app.models.voucher_change import VoucherChangeRequest
    from app.models.enums import VoucherType, ChangeRequestStatus
    from decimal import Decimal
    from datetime import datetime

    job = await db.get(UploadJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status != JobStatus.SUCCEEDED:
        raise HTTPException(status_code=400, detail="파싱이 완료된 작업만 확정할 수 있습니다")
    if job.is_confirmed:
        raise HTTPException(status_code=400, detail="이미 확정된 작업입니다")

    # 미리보기 데이터 가져오기
    preview_key = f"settlement:upload:preview:{job_id}"
    preview_data = await redis.get(preview_key)
    if not preview_data:
        raise HTTPException(status_code=400, detail="미리보기 데이터가 없습니다")

    rows = json.loads(preview_data)
    created = 0
    updated = 0
    change_requests = 0
    skipped = 0

    vtype = VoucherType.SALES if job.job_type == JobType.VOUCHER_SALES_EXCEL else VoucherType.PURCHASE

    for row in rows:
        # unmatched는 스킵
        if row.get("status") == "unmatched" or not row.get("counterparty_id"):
            skipped += 1
            continue

        # locked는 스킵
        if row.get("status") == "locked":
            skipped += 1
            continue

        data = row.get("data", {})
        counterparty_id = row["counterparty_id"]
        trade_date = row["trade_date"]
        voucher_number = row["voucher_number"]

        # 기존 전표 조회
        existing = await db.execute(
            select(Voucher).where(
                Voucher.counterparty_id == counterparty_id,
                Voucher.trade_date == trade_date,
                Voucher.voucher_number == voucher_number,
            )
        )
        existing_v = existing.scalar_one_or_none()

        if existing_v:
            # 마감된 전표 → 스킵
            from app.models.enums import SettlementStatus, PaymentStatus
            if existing_v.settlement_status == SettlementStatus.LOCKED or existing_v.payment_status == PaymentStatus.LOCKED:
                skipped += 1
                continue

            # 변경 감지: conflict인 경우 → 변경 요청 생성
            if row.get("status") == "conflict" and exclude_conflicts:
                cr = VoucherChangeRequest(
                    voucher_id=existing_v.id,
                    upload_job_id=job.id,
                    before_data=row.get("diff", {}).get("before"),
                    after_data=row.get("diff", {}).get("after"),
                    diff_summary=row.get("diff", {}).get("changes"),
                    status=ChangeRequestStatus.PENDING,
                )
                db.add(cr)
                change_requests += 1
                continue

            # UPSERT: 기존 전표 업데이트
            for field in [
                "quantity", "purchase_cost", "deduction_amount",
                "actual_purchase_price", "avg_unit_price",
                "purchase_deduction", "as_cost", "sale_amount",
                "sale_deduction", "actual_sale_price", "profit",
                "profit_rate", "avg_margin", "upm_settlement_status",
                "payment_info",
            ]:
                if field in data and data[field] is not None:
                    val = data[field]
                    if isinstance(val, (int, float)):
                        val = Decimal(str(val))
                    setattr(existing_v, field, val)

            # total_amount 재계산
            if vtype == VoucherType.SALES:
                existing_v.total_amount = Decimal(str(data.get("actual_sale_price") or data.get("sale_amount") or 0))
            else:
                existing_v.total_amount = Decimal(str(data.get("actual_purchase_price") or data.get("purchase_cost") or 0))

            updated += 1
        else:
            # 신규 전표 생성
            v = Voucher(
                trade_date=trade_date,
                counterparty_id=counterparty_id,
                voucher_number=voucher_number,
                voucher_type=vtype,
                quantity=data.get("quantity", 0),
                purchase_cost=Decimal(str(data.get("purchase_cost", 0) or 0)),
                deduction_amount=Decimal(str(data.get("deduction_amount", 0) or 0)) if data.get("deduction_amount") else None,
                actual_purchase_price=Decimal(str(data.get("actual_purchase_price", 0) or 0)) if data.get("actual_purchase_price") else None,
                avg_unit_price=Decimal(str(data.get("avg_unit_price", 0) or 0)) if data.get("avg_unit_price") else None,
                purchase_deduction=Decimal(str(data.get("purchase_deduction", 0) or 0)) if data.get("purchase_deduction") else None,
                as_cost=Decimal(str(data.get("as_cost", 0) or 0)) if data.get("as_cost") else None,
                sale_amount=Decimal(str(data.get("sale_amount", 0) or 0)) if data.get("sale_amount") else None,
                sale_deduction=Decimal(str(data.get("sale_deduction", 0) or 0)) if data.get("sale_deduction") else None,
                actual_sale_price=Decimal(str(data.get("actual_sale_price", 0) or 0)) if data.get("actual_sale_price") else None,
                profit=Decimal(str(data.get("profit", 0) or 0)) if data.get("profit") else None,
                profit_rate=Decimal(str(data.get("profit_rate", 0) or 0)) if data.get("profit_rate") else None,
                avg_margin=Decimal(str(data.get("avg_margin", 0) or 0)) if data.get("avg_margin") else None,
                upm_settlement_status=data.get("upm_settlement_status"),
                payment_info=data.get("payment_info"),
                upload_job_id=job.id,
                created_by=current_user.id,
            )
            if vtype == VoucherType.SALES:
                v.total_amount = Decimal(str(data.get("actual_sale_price") or data.get("sale_amount") or 0))
            else:
                v.total_amount = Decimal(str(data.get("actual_purchase_price") or data.get("purchase_cost") or 0))

            db.add(v)
            created += 1

    # 작업 상태 업데이트
    job.is_confirmed = True
    job.confirmed_at = datetime.utcnow()
    job.result_summary = {
        **(job.result_summary or {}),
        "confirmed": {"created": created, "updated": updated, "change_requests": change_requests, "skipped": skipped},
    }

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.UPLOAD_CONFIRM,
        target_type="upload_job",
        target_id=job.id,
        after_data={"created": created, "updated": updated, "change_requests": change_requests},
    ))

    await db.flush()

    return {
        "message": "업로드 확정 완료",
        "created": created,
        "updated": updated,
        "change_requests": change_requests,
        "skipped": skipped,
    }
