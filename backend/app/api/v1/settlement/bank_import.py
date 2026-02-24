"""
정산 도메인 - 은행 파일 임포트
원본 보관 → 거래처 자동 매칭 → 검수 → 확정(Transaction 생성) 파이프라인
"""

import hashlib
import uuid as uuid_mod
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.api.deps import get_current_user
from app.models.user import User
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


def _generate_duplicate_key(txn_date: date, amount: Decimal, description: str, bank_ref: str = None) -> str:
    """중복 감지 키: hash(date + amount + description + bank_ref)"""
    raw = f"{txn_date}|{amount}|{description}|{bank_ref or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:64]


def _job_to_response(job: BankImportJob, created_by_name: str = None) -> BankImportJobResponse:
    return BankImportJobResponse(
        id=job.id,
        original_filename=job.original_filename,
        file_hash=job.file_hash,
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
    )


@router.post("/upload", response_model=BankImportJobResponse, status_code=201)
async def upload_bank_file(
    file: UploadFile = File(...),
    bank_name: Optional[str] = None,
    account_number: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """은행 파일 업로드 (Excel/CSV)"""
    # 파일 저장
    upload_dir = Path(settings.UPLOAD_DIR) / "bank_imports"
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_content = await file.read()
    file_hash = hashlib.sha256(file_content).hexdigest()

    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in (".xlsx", ".xls", ".csv"):
        raise HTTPException(status_code=400, detail="지원하지 않는 파일 형식입니다 (.xlsx, .xls, .csv만 가능)")

    file_path = upload_dir / f"{uuid_mod.uuid4()}{file_ext}"
    with open(file_path, "wb") as f:
        f.write(file_content)

    job = BankImportJob(
        file_path=str(file_path),
        original_filename=file.filename,
        file_hash=file_hash,
        bank_name=bank_name,
        account_number=account_number,
        status=BankImportJobStatus.UPLOADED,
        created_by=current_user.id,
    )
    db.add(job)
    await db.flush()

    # 동기 파싱 (간단한 파일의 경우)
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
            "total_lines": job.total_lines,
            "status": job.status.value if hasattr(job.status, 'value') else job.status,
        },
    ))

    return _job_to_response(job, current_user.name)


async def _parse_bank_file(
    job: BankImportJob,
    file_content: bytes,
    file_ext: str,
    db: AsyncSession,
) -> None:
    """은행 파일 파싱 → BankImportLine 생성"""
    import pandas as pd
    import io

    if file_ext == ".csv":
        df = pd.read_csv(io.BytesIO(file_content))
    else:
        df = pd.read_excel(io.BytesIO(file_content))

    if df.empty:
        raise ValueError("파일에 데이터가 없습니다")

    # 컬럼 자동 매핑 (일반적인 은행 원장 형식)
    col_map = {}
    for col in df.columns:
        col_lower = str(col).lower().strip()
        if "일" in col_lower or "date" in col_lower:
            col_map["date"] = col
        elif "입금" in col_lower or "deposit" in col_lower or "수입" in col_lower:
            col_map["deposit"] = col
        elif "출금" in col_lower or "withdrawal" in col_lower or "지출" in col_lower:
            col_map["withdrawal"] = col
        elif "금액" in col_lower or "amount" in col_lower:
            col_map["amount"] = col
        elif "적요" in col_lower or "내역" in col_lower or "설명" in col_lower or "desc" in col_lower:
            col_map["description"] = col
        elif "잔액" in col_lower or "balance" in col_lower:
            col_map["balance"] = col
        elif "거래처" in col_lower or "상대" in col_lower:
            col_map["counterparty"] = col
        elif "참조" in col_lower or "ref" in col_lower:
            col_map["reference"] = col

    lines = []
    min_date = None
    max_date = None

    for idx, row in df.iterrows():
        try:
            # 날짜
            txn_date = None
            if "date" in col_map:
                raw_date = row[col_map["date"]]
                if pd.notna(raw_date):
                    txn_date = pd.to_datetime(raw_date).date()

            if not txn_date:
                continue

            # 금액 (입금/출금 분리 또는 단일 컬럼)
            amount = Decimal("0")
            if "deposit" in col_map and "withdrawal" in col_map:
                dep = row.get(col_map["deposit"])
                wd = row.get(col_map["withdrawal"])
                if pd.notna(dep) and float(dep) != 0:
                    amount = Decimal(str(float(dep)))
                elif pd.notna(wd) and float(wd) != 0:
                    amount = -Decimal(str(abs(float(wd))))
            elif "amount" in col_map:
                raw_amount = row[col_map["amount"]]
                if pd.notna(raw_amount):
                    amount = Decimal(str(float(raw_amount)))

            if amount == 0:
                continue

            # 적요
            description = ""
            if "description" in col_map:
                desc = row.get(col_map["description"])
                description = str(desc) if pd.notna(desc) else ""

            # 잔액
            balance_after = None
            if "balance" in col_map:
                bal = row.get(col_map["balance"])
                if pd.notna(bal):
                    balance_after = Decimal(str(float(bal)))

            # 거래처
            cp_raw = None
            if "counterparty" in col_map:
                cp = row.get(col_map["counterparty"])
                if pd.notna(cp):
                    cp_raw = str(cp).strip()

            # 참조번호
            bank_ref = None
            if "reference" in col_map:
                ref = row.get(col_map["reference"])
                if pd.notna(ref):
                    bank_ref = str(ref).strip()

            dup_key = _generate_duplicate_key(txn_date, amount, description, bank_ref)

            line = BankImportLine(
                import_job_id=job.id,
                line_number=idx + 1,
                transaction_date=txn_date,
                description=description,
                amount=amount,
                balance_after=balance_after,
                counterparty_name_raw=cp_raw,
                status=BankImportLineStatus.UNMATCHED,
                duplicate_key=dup_key,
                bank_reference=bank_ref,
                raw_data=row.to_dict() if hasattr(row, 'to_dict') else {},
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


@router.get("/jobs", response_model=list[BankImportJobResponse])
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """임포트 작업 목록"""
    result = await db.execute(
        select(BankImportJob)
        .order_by(BankImportJob.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    jobs = result.scalars().all()

    user_ids = {j.created_by for j in jobs}
    user_map = {}
    if user_ids:
        u_result = await db.execute(
            select(User.id, User.name).where(User.id.in_(user_ids))
        )
        user_map = {row.id: row.name for row in u_result.all()}

    return [_job_to_response(j, user_map.get(j.created_by)) for j in jobs]


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

    user = await db.get(User, job.created_by)
    resp = _job_to_response(job, user.name if user else None)
    return BankImportJobDetailResponse(
        **resp.model_dump(),
        lines=[_line_to_response(l, cp_map.get(l.counterparty_id)) for l in lines],
    )


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
        line.status = data.status.upper()

    cp_name = None
    if line.counterparty_id:
        cp = await db.get(Counterparty, line.counterparty_id)
        cp_name = cp.name if cp else None

    return _line_to_response(line, cp_name)


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
        },
    ))

    return {"confirmed_count": created_count, "total_matched": len(lines)}


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
