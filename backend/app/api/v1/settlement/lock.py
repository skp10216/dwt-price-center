"""
정산 도메인 - 마감(LOCK) 관리
전표 마감/해제 + 일괄 마감 + 마감 내역
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.voucher import Voucher
from app.models.enums import (
    VoucherType, SettlementStatus, PaymentStatus, AuditAction,
)
from app.models.audit_log import AuditLog
from app.schemas.settlement import BatchLockRequest, BatchLockResponse, LockHistoryItem

router = APIRouter()


@router.post("/voucher/{voucher_id}", response_model=dict)
async def lock_voucher(
    voucher_id: UUID,
    memo: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표 마감"""
    v = await db.get(Voucher, voucher_id)
    if not v:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")

    if v.settlement_status == SettlementStatus.LOCKED and v.payment_status == PaymentStatus.LOCKED:
        raise HTTPException(status_code=400, detail="이미 마감된 전표입니다")

    v.settlement_status = SettlementStatus.LOCKED
    v.payment_status = PaymentStatus.LOCKED

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.VOUCHER_LOCK,
        target_type="voucher",
        target_id=v.id,
        description=memo or "전표 마감",
    ))

    await db.flush()
    return {"message": "마감 완료", "voucher_id": str(voucher_id)}


@router.post("/voucher/{voucher_id}/unlock", response_model=dict)
async def unlock_voucher(
    voucher_id: UUID,
    memo: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표 마감 해제"""
    v = await db.get(Voucher, voucher_id)
    if not v:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")

    # 원래 상태로 복원 (OPEN/UNPAID)
    v.settlement_status = SettlementStatus.OPEN
    v.payment_status = PaymentStatus.UNPAID

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.VOUCHER_UNLOCK,
        target_type="voucher",
        target_id=v.id,
        description=memo or "전표 마감 해제",
    ))

    await db.flush()
    return {"message": "마감 해제 완료", "voucher_id": str(voucher_id)}


@router.post("/batch", response_model=BatchLockResponse)
async def batch_lock(
    data: BatchLockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """일괄 마감"""
    locked = 0
    skipped = 0
    failed_ids = []

    for vid in data.voucher_ids:
        v = await db.get(Voucher, vid)
        if not v:
            failed_ids.append(vid)
            continue

        if v.settlement_status == SettlementStatus.LOCKED and v.payment_status == PaymentStatus.LOCKED:
            skipped += 1
            continue

        v.settlement_status = SettlementStatus.LOCKED
        v.payment_status = PaymentStatus.LOCKED
        locked += 1

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.VOUCHER_BATCH_LOCK,
        target_type="voucher",
        description=data.memo or f"일괄 마감 {locked}건",
        after_data={
            "locked_count": locked,
            "skipped_count": skipped,
            "voucher_ids": [str(v) for v in data.voucher_ids],
        },
    ))

    await db.flush()

    return BatchLockResponse(
        locked_count=locked,
        skipped_count=skipped,
        failed_ids=failed_ids,
    )


@router.post("/batch-unlock", response_model=BatchLockResponse)
async def batch_unlock(
    data: BatchLockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """일괄 마감 해제"""
    unlocked = 0
    skipped = 0
    failed_ids = []

    for vid in data.voucher_ids:
        v = await db.get(Voucher, vid)
        if not v:
            failed_ids.append(vid)
            continue

        if v.settlement_status != SettlementStatus.LOCKED and v.payment_status != PaymentStatus.LOCKED:
            skipped += 1
            continue

        v.settlement_status = SettlementStatus.OPEN
        v.payment_status = PaymentStatus.UNPAID
        unlocked += 1

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.VOUCHER_BATCH_UNLOCK,
        target_type="voucher",
        description=data.memo or f"일괄 마감 해제 {unlocked}건",
    ))

    await db.flush()

    return BatchLockResponse(
        locked_count=unlocked,
        skipped_count=skipped,
        failed_ids=failed_ids,
    )


@router.get("/history", response_model=dict)
async def lock_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """마감 내역 / 감사 로그"""
    lock_actions = [
        AuditAction.VOUCHER_LOCK,
        AuditAction.VOUCHER_UNLOCK,
        AuditAction.VOUCHER_BATCH_LOCK,
        AuditAction.VOUCHER_BATCH_UNLOCK,
    ]

    query = (
        select(AuditLog)
        .where(AuditLog.action.in_(lock_actions))
        .order_by(AuditLog.created_at.desc())
    )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()

    items = []
    for log in logs:
        # 사용자 정보 조회
        user = await db.get(User, log.user_id)
        items.append(LockHistoryItem(
            id=log.id,
            action=log.action.value if hasattr(log.action, 'value') else log.action,
            user_name=user.name if user else None,
            user_email=user.email if user else None,
            description=log.description,
            target_id=log.target_id,
            created_at=log.created_at,
        ))

    return {
        "history": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
