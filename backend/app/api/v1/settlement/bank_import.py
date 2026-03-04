"""
정산 도메인 - 은행 파일 임포트
거래내역조회 양식 전용 파서 + 법인 관리 + 거래처 자동 매칭 → 확정(Transaction 생성) 파이프라인
"""

import hashlib
import uuid as uuid_mod
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pathlib import Path

import pandas as pd
import io

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.api.deps import get_current_user
from app.models.user import User
from app.models.corporate_entity import CorporateEntity
from app.models.counterparty import Counterparty, CounterpartyAlias
from app.models.counterparty_transaction import CounterpartyTransaction
from app.models.bank_import import BankImportJob, BankImportLine
from app.models.audit_log import AuditLog
from app.models.enums import (
    BankImportJobStatus, BankImportLineStatus,
    TransactionType, TransactionSource, TransactionStatus, AuditAction,
)
from app.schemas.settlement import (
    BankImportJobResponse, BankImportJobDetailResponse,
    BankImportLineResponse, BankImportLineUpdate,
)

router = APIRouter()

# ── 거래내역조회 양식 정의 ──────────────────────────────────────────
REQUIRED_COLUMNS = {"거래일시", "적요", "입금", "출금", "거래후잔액"}
OPTIONAL_COLUMNS = {"No", "추가메모", "의뢰인/수취인", "구분", "거래점", "거래특이사항"}


def _generate_duplicate_key(txn_date: date, amount: Decimal, description: str, bank_ref: str = None) -> str:
    """중복 감지 키: hash(date + amount + description + bank_ref)"""
    raw = f"{txn_date}|{amount}|{description}|{bank_ref or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:64]


def _job_to_response(job: BankImportJob, created_by_name: str = None, ce_name: str = None) -> BankImportJobResponse:
    return BankImportJobResponse(
        id=job.id,
        original_filename=job.original_filename,
        file_hash=job.file_hash,
        corporate_entity_id=job.corporate_entity_id,
        corporate_entity_name=ce_name,
        bank_name=job.bank_name,
        account_number=job.account_number,
        import_date_from=job.import_date_from,
        import_date_to=job.import_date_to,
        status=job.status.value if hasattr(job.status, 'value') else job.status,
        total_lines=job.total_lines,
        matched_lines=job.matched_lines,
        confirmed_lines=job.confirmed_lines,
        error_message=job.error_message,
        created_by=job.created_by,
        created_by_name=created_by_name,
        created_at=job.created_at,
        completed_at=job.completed_at,
        confirmed_at=job.confirmed_at,
    )


def _line_to_response(line: BankImportLine, cp_name: str = None) -> BankImportLineResponse:
    return BankImportLineResponse(
        id=line.id,
        line_number=line.line_number,
        transaction_date=line.transaction_date,
        description=line.description,
        amount=line.amount,
        balance_after=line.balance_after,
        counterparty_name_raw=line.counterparty_name_raw,
        counterparty_id=line.counterparty_id,
        counterparty_name=cp_name,
        status=line.status.value if hasattr(line.status, 'value') else line.status,
        match_confidence=line.match_confidence,
        duplicate_key=line.duplicate_key,
        bank_reference=line.bank_reference,
        transaction_id=line.transaction_id,
        # 거래내역조회 추가 필드
        sender_receiver=line.sender_receiver,
        additional_memo=line.additional_memo,
        transaction_type_raw=line.transaction_type_raw,
        bank_branch=line.bank_branch,
        special_notes=line.special_notes,
    )


# ── 헬퍼: Excel 헤더 자동 탐색 ──────────────────────────────────────

def _find_header_row(df_raw: pd.DataFrame) -> Optional[int]:
    """거래일시 컬럼이 있는 행을 찾아 헤더 행 번호 반환"""
    for i in range(min(15, len(df_raw))):
        row_values = [str(v).strip() for v in df_raw.iloc[i].values if pd.notna(v)]
        if "거래일시" in row_values:
            return i
    return None


def _validate_columns(columns: list[str]) -> None:
    """필수 컬럼 존재 여부 검증"""
    col_set = {str(c).strip() for c in columns}
    missing = REQUIRED_COLUMNS - col_set
    if missing:
        raise ValueError(
            f"지원하지 않는 엑셀 형식입니다. '거래내역조회' 양식의 파일만 업로드 가능합니다.\n"
            f"누락된 필수 컬럼: {', '.join(sorted(missing))}"
        )


# ── 업로드 ──────────────────────────────────────────────────────────

@router.post("/upload", response_model=BankImportJobResponse, status_code=201)
async def upload_bank_file(
    file: UploadFile = File(...),
    corporate_entity_id: Optional[UUID] = Form(None),
    bank_name: Optional[str] = Form(None),
    account_number: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """은행 파일 업로드 (거래내역조회 Excel 전용)"""
    # 파일 확장자 검증 (CSV 제거 — Excel만 허용)
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in (".xlsx", ".xls"):
        raise HTTPException(
            status_code=400,
            detail="지원하지 않는 파일 형식입니다. Excel(.xlsx, .xls) 파일만 업로드 가능합니다.",
        )

    # 법인 검증
    ce_name = None
    if corporate_entity_id:
        ce = await db.get(CorporateEntity, corporate_entity_id)
        if not ce:
            raise HTTPException(status_code=404, detail="법인을 찾을 수 없습니다")
        if not ce.is_active:
            raise HTTPException(status_code=400, detail="비활성화된 법인입니다")
        ce_name = ce.name

    # 파일 저장
    upload_dir = Path(settings.UPLOAD_DIR) / "bank_imports"
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_content = await file.read()
    file_hash = hashlib.sha256(file_content).hexdigest()

    file_path = upload_dir / f"{uuid_mod.uuid4()}{file_ext}"
    with open(file_path, "wb") as f:
        f.write(file_content)

    job = BankImportJob(
        file_path=str(file_path),
        original_filename=file.filename,
        file_hash=file_hash,
        corporate_entity_id=corporate_entity_id,
        bank_name=bank_name,
        account_number=account_number,
        status=BankImportJobStatus.UPLOADED,
        created_by=current_user.id,
    )
    db.add(job)
    await db.flush()

    # 동기 파싱
    try:
        await _parse_bank_file(job, file_content, file_ext, db)
        job.status = BankImportJobStatus.PARSED
        job.completed_at = datetime.utcnow()
    except Exception as e:
        job.status = BankImportJobStatus.FAILED
        job.error_message = str(e)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.BANK_IMPORT_UPLOAD,
        target_type="bank_import_job",
        target_id=job.id,
        after_data={
            "filename": file.filename,
            "corporate_entity_id": str(corporate_entity_id) if corporate_entity_id else None,
            "total_lines": job.total_lines,
            "status": job.status.value if hasattr(job.status, 'value') else job.status,
        },
    ))

    return _job_to_response(job, current_user.name, ce_name)


# ── 거래내역조회 전용 파서 ──────────────────────────────────────────

async def _parse_bank_file(
    job: BankImportJob,
    file_content: bytes,
    file_ext: str,
    db: AsyncSession,
) -> None:
    """거래내역조회 양식 Excel 파싱 → BankImportLine 생성"""
    # 1. 헤더 없이 먼저 로드하여 실제 헤더 행 탐색
    df_raw = pd.read_excel(io.BytesIO(file_content), header=None)

    if df_raw.empty:
        raise ValueError("파일에 데이터가 없습니다")

    header_row = _find_header_row(df_raw)
    if header_row is None:
        raise ValueError(
            "지원하지 않는 엑셀 형식입니다. '거래내역조회' 양식의 파일만 업로드 가능합니다.\n"
            "'거래일시' 컬럼을 포함한 헤더 행을 찾을 수 없습니다."
        )

    # 2. 헤더 행 기준으로 다시 로드
    df = pd.read_excel(io.BytesIO(file_content), header=header_row)
    # 컬럼명 정리 (공백 제거)
    df.columns = [str(c).strip() for c in df.columns]

    # 3. 양식 검증
    _validate_columns(df.columns.tolist())

    # 4. 컬럼 매핑 (정확한 이름 기반)
    def get_col(name: str):
        """컬럼 존재 시 이름 반환, 없으면 None"""
        return name if name in df.columns else None

    col_date = "거래일시"
    col_desc = "적요"
    col_memo = get_col("추가메모")
    col_sender = get_col("의뢰인/수취인")
    col_deposit = "입금"
    col_withdrawal = "출금"
    col_balance = "거래후잔액"
    col_type = get_col("구분")
    col_branch = get_col("거래점")
    col_notes = get_col("거래특이사항")

    lines = []
    min_date = None
    max_date = None

    for idx, row in df.iterrows():
        try:
            # 날짜 파싱
            raw_date = row[col_date]
            if pd.isna(raw_date):
                continue
            txn_date = pd.to_datetime(raw_date).date()

            # 금액 (입금/출금 분리)
            amount = Decimal("0")
            dep = row.get(col_deposit)
            wd = row.get(col_withdrawal)
            if pd.notna(dep) and dep != "" and float(dep) != 0:
                amount = Decimal(str(float(dep)))
            elif pd.notna(wd) and wd != "" and float(wd) != 0:
                amount = -Decimal(str(abs(float(wd))))

            if amount == 0:
                continue

            # 적요
            desc_val = row.get(col_desc)
            description = str(desc_val).strip() if pd.notna(desc_val) else ""

            # 잔액
            balance_after = None
            bal_val = row.get(col_balance)
            if pd.notna(bal_val) and bal_val != "":
                try:
                    balance_after = Decimal(str(float(bal_val)))
                except (ValueError, TypeError):
                    pass

            # 의뢰인/수취인 → counterparty_name_raw
            cp_raw = None
            if col_sender:
                sender_val = row.get(col_sender)
                if pd.notna(sender_val) and str(sender_val).strip():
                    cp_raw = str(sender_val).strip()

            # 추가메모
            additional_memo = None
            if col_memo:
                memo_val = row.get(col_memo)
                if pd.notna(memo_val) and str(memo_val).strip():
                    additional_memo = str(memo_val).strip()

            # 구분
            type_raw = None
            if col_type:
                type_val = row.get(col_type)
                if pd.notna(type_val) and str(type_val).strip():
                    type_raw = str(type_val).strip()

            # 거래점
            bank_branch = None
            if col_branch:
                branch_val = row.get(col_branch)
                if pd.notna(branch_val) and str(branch_val).strip():
                    bank_branch = str(branch_val).strip()

            # 거래특이사항
            special_notes = None
            if col_notes:
                notes_val = row.get(col_notes)
                if pd.notna(notes_val) and str(notes_val).strip():
                    special_notes = str(notes_val).strip()

            # 중복 키 생성
            dup_key = _generate_duplicate_key(txn_date, amount, description)

            # raw_data 보관
            raw_data = {}
            for c in df.columns:
                val = row.get(c)
                if pd.notna(val):
                    raw_data[c] = str(val)

            line = BankImportLine(
                import_job_id=job.id,
                line_number=idx + 1,
                transaction_date=txn_date,
                description=description,
                amount=amount,
                balance_after=balance_after,
                counterparty_name_raw=cp_raw,
                sender_receiver=cp_raw,
                additional_memo=additional_memo,
                transaction_type_raw=type_raw,
                bank_branch=bank_branch,
                special_notes=special_notes,
                status=BankImportLineStatus.UNMATCHED,
                duplicate_key=dup_key,
                raw_data=raw_data,
            )
            db.add(line)
            lines.append(line)

            if min_date is None or txn_date < min_date:
                min_date = txn_date
            if max_date is None or txn_date > max_date:
                max_date = txn_date

        except Exception:
            continue

    job.total_lines = len(lines)
    job.import_date_from = min_date
    job.import_date_to = max_date
    await db.flush()

    # 중복 감지
    for line in lines:
        if not line.duplicate_key:
            continue
        existing = await db.execute(
            select(func.count(BankImportLine.id))
            .where(
                BankImportLine.duplicate_key == line.duplicate_key,
                BankImportLine.id != line.id,
                BankImportLine.status != BankImportLineStatus.EXCLUDED,
            )
        )
        if (existing.scalar() or 0) > 0:
            line.status = BankImportLineStatus.DUPLICATE


# ── 작업 목록 ──────────────────────────────────────────────────────

@router.get("/jobs")
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="파일명/은행명 검색"),
    status: Optional[str] = Query(None, description="상태 필터"),
    corporate_entity_id: Optional[UUID] = Query(None, description="법인 필터"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """임포트 작업 목록"""
    filters = []
    if search:
        search_like = f"%{search}%"
        filters.append(
            BankImportJob.original_filename.ilike(search_like)
            | BankImportJob.bank_name.ilike(search_like)
        )
    if status:
        filters.append(BankImportJob.status == status)
    if corporate_entity_id:
        filters.append(BankImportJob.corporate_entity_id == corporate_entity_id)

    # 전체 건수
    count_q = select(func.count(BankImportJob.id))
    if filters:
        for f in filters:
            count_q = count_q.where(f)
    total = (await db.execute(count_q)).scalar() or 0

    # 목록 조회
    q = select(BankImportJob).order_by(BankImportJob.created_at.desc())
    if filters:
        for f in filters:
            q = q.where(f)
    q = q.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(q)
    jobs = result.scalars().all()

    # 사용자명 매핑
    user_ids = {j.created_by for j in jobs}
    user_map = {}
    if user_ids:
        u_result = await db.execute(
            select(User.id, User.name).where(User.id.in_(user_ids))
        )
        user_map = {row.id: row.name for row in u_result.all()}

    # 법인명 매핑
    ce_ids = {j.corporate_entity_id for j in jobs if j.corporate_entity_id}
    ce_map = {}
    if ce_ids:
        ce_result = await db.execute(
            select(CorporateEntity.id, CorporateEntity.name).where(CorporateEntity.id.in_(ce_ids))
        )
        ce_map = {row.id: row.name for row in ce_result.all()}

    return {
        "jobs": [
            _job_to_response(j, user_map.get(j.created_by), ce_map.get(j.corporate_entity_id))
            for j in jobs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── 작업 상세 ──────────────────────────────────────────────────────

@router.get("/jobs/{job_id}", response_model=BankImportJobDetailResponse)
async def get_job_detail(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """작업 상세 + 라인 목록"""
    job = await db.get(BankImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="임포트 작업을 찾을 수 없습니다")

    lines_result = await db.execute(
        select(BankImportLine)
        .where(BankImportLine.import_job_id == job_id)
        .order_by(BankImportLine.line_number)
    )
    lines = lines_result.scalars().all()

    # 거래처명 조회
    cp_ids = {l.counterparty_id for l in lines if l.counterparty_id}
    cp_map = {}
    if cp_ids:
        cp_result = await db.execute(
            select(Counterparty.id, Counterparty.name).where(Counterparty.id.in_(cp_ids))
        )
        cp_map = {row.id: row.name for row in cp_result.all()}

    # 법인명
    ce_name = None
    if job.corporate_entity_id:
        ce = await db.get(CorporateEntity, job.corporate_entity_id)
        ce_name = ce.name if ce else None

    user = await db.get(User, job.created_by)
    resp = _job_to_response(job, user.name if user else None, ce_name)
    return BankImportJobDetailResponse(
        **resp.model_dump(),
        lines=[_line_to_response(l, cp_map.get(l.counterparty_id)) for l in lines],
    )


# ── 자동 매칭 ──────────────────────────────────────────────────────

@router.post("/jobs/{job_id}/auto-match")
async def auto_match(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거래처 자동 매칭 (CounterpartyAlias 기반)"""
    job = await db.get(BankImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="임포트 작업을 찾을 수 없습니다")
    if job.status not in (BankImportJobStatus.PARSED, BankImportJobStatus.REVIEWING):
        raise HTTPException(status_code=400, detail="파싱 완료 또는 검토 중 상태에서만 매칭 가능합니다")

    # 전체 별칭 로드
    alias_result = await db.execute(
        select(CounterpartyAlias.alias_name, CounterpartyAlias.counterparty_id)
    )
    alias_map = {row.alias_name.strip().lower(): row.counterparty_id for row in alias_result.all()}

    # 전체 거래처명 로드
    cp_result = await db.execute(
        select(Counterparty.name, Counterparty.id).where(Counterparty.is_active == True)
    )
    cp_name_map = {row.name.strip().lower(): row.id for row in cp_result.all()}

    lines_result = await db.execute(
        select(BankImportLine)
        .where(
            BankImportLine.import_job_id == job_id,
            BankImportLine.status == BankImportLineStatus.UNMATCHED,
        )
    )
    lines = lines_result.scalars().all()

    matched_count = 0
    for line in lines:
        if not line.counterparty_name_raw:
            continue

        raw_lower = line.counterparty_name_raw.strip().lower()

        # 1. 정확 매칭 (별칭)
        if raw_lower in alias_map:
            line.counterparty_id = alias_map[raw_lower]
            line.status = BankImportLineStatus.MATCHED
            line.match_confidence = Decimal("100.00")
            matched_count += 1
            continue

        # 2. 정확 매칭 (거래처명)
        if raw_lower in cp_name_map:
            line.counterparty_id = cp_name_map[raw_lower]
            line.status = BankImportLineStatus.MATCHED
            line.match_confidence = Decimal("100.00")
            matched_count += 1
            continue

        # 3. 부분 매칭 (거래처명 포함)
        for cp_name, cp_id in cp_name_map.items():
            if cp_name in raw_lower or raw_lower in cp_name:
                line.counterparty_id = cp_id
                line.status = BankImportLineStatus.MATCHED
                line.match_confidence = Decimal("70.00")
                matched_count += 1
                break

    job.matched_lines = matched_count
    job.status = BankImportJobStatus.REVIEWING

    return {"matched_count": matched_count, "total_unmatched": len(lines) - matched_count}


# ── 라인 수동 매칭 ──────────────────────────────────────────────────

@router.patch("/jobs/{job_id}/lines/{line_id}", response_model=BankImportLineResponse)
async def update_line(
    job_id: UUID,
    line_id: UUID,
    data: BankImportLineUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """라인 수동 매칭/수정"""
    line = await db.execute(
        select(BankImportLine)
        .where(BankImportLine.id == line_id, BankImportLine.import_job_id == job_id)
    )
    line = line.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="라인을 찾을 수 없습니다")

    if data.counterparty_id is not None:
        cp = await db.get(Counterparty, data.counterparty_id)
        if not cp:
            raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")
        line.counterparty_id = data.counterparty_id
        line.status = BankImportLineStatus.MATCHED
        line.match_confidence = Decimal("100.00")

    if data.status is not None:
        line.status = data.status

    cp_name = None
    if line.counterparty_id:
        cp = await db.get(Counterparty, line.counterparty_id)
        cp_name = cp.name if cp else None

    return _line_to_response(line, cp_name)


# ── 확정 ──────────────────────────────────────────────────────────

@router.post("/jobs/{job_id}/confirm")
async def confirm_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """매칭 완료 라인 확정 → CounterpartyTransaction 일괄 생성"""
    job = await db.get(BankImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="임포트 작업을 찾을 수 없습니다")
    if job.status == BankImportJobStatus.CONFIRMED:
        raise HTTPException(status_code=400, detail="이미 확정된 작업입니다")

    # 매칭된 라인만 대상
    lines_result = await db.execute(
        select(BankImportLine)
        .where(
            BankImportLine.import_job_id == job_id,
            BankImportLine.status == BankImportLineStatus.MATCHED,
            BankImportLine.counterparty_id.isnot(None),
        )
    )
    lines = lines_result.scalars().all()

    if not lines:
        raise HTTPException(status_code=400, detail="확정할 매칭 라인이 없습니다")

    created_count = 0
    for line in lines:
        txn_type = TransactionType.DEPOSIT if line.amount > 0 else TransactionType.WITHDRAWAL
        txn_amount = abs(line.amount)

        txn = CounterpartyTransaction(
            counterparty_id=line.counterparty_id,
            corporate_entity_id=job.corporate_entity_id,  # 법인 전파
            transaction_type=txn_type,
            transaction_date=line.transaction_date,
            amount=txn_amount,
            source=TransactionSource.BANK_IMPORT,
            bank_reference=line.bank_reference,
            bank_import_line_id=line.id,
            status=TransactionStatus.PENDING,
            memo=line.description[:200] if line.description else None,
            created_by=current_user.id,
        )
        db.add(txn)
        await db.flush()

        line.transaction_id = txn.id
        line.status = BankImportLineStatus.CONFIRMED
        created_count += 1

    job.confirmed_lines = created_count
    job.status = BankImportJobStatus.CONFIRMED
    job.confirmed_at = datetime.utcnow()

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.BANK_IMPORT_CONFIRM,
        target_type="bank_import_job",
        target_id=job.id,
        after_data={
            "confirmed_lines": created_count,
            "total_lines": job.total_lines,
            "corporate_entity_id": str(job.corporate_entity_id) if job.corporate_entity_id else None,
        },
    ))

    return {"confirmed_count": created_count, "total_matched": len(lines)}


# ── 삭제 ──────────────────────────────────────────────────────────

@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """임포트 작업 삭제"""
    job = await db.get(BankImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="임포트 작업을 찾을 수 없습니다")
    if job.status == BankImportJobStatus.CONFIRMED:
        raise HTTPException(status_code=400, detail="확정된 작업은 삭제할 수 없습니다")

    await db.delete(job)
