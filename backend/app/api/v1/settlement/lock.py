"""
정산 도메인 - 마감(LOCK) 관리
PeriodLock 테이블 기반 월별 마감 + 전표 마감/해제 + 일괄 마감 + 마감 내역
"""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_, extract, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.voucher import Voucher
from app.models.period_lock import PeriodLock
from app.models.enums import (
    VoucherType, SettlementStatus, PaymentStatus, AuditAction,
    PeriodLockStatus,
)
from app.models.audit_log import AuditLog
from app.schemas.settlement import BatchLockRequest, BatchLockResponse, LockHistoryItem

router = APIRouter()


# ─── 월별 마감 관리 (PeriodLock 기반) ────────────────────────────────

@router.get("", response_model=dict)
async def list_monthly_locks(
    year: int = Query(..., ge=2020, le=2100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """연도별 월간 마감 현황 조회 — PeriodLock 테이블 우선, 없으면 전표 스캔"""
    locks = []
    for month in range(1, 13):
        year_month = f"{year}-{month:02d}"
        first_day = date(year, month, 1)
        if month == 12:
            last_day = date(year + 1, 1, 1)
        else:
            last_day = date(year, month + 1, 1)

        # 해당 월 전표 총 수
        total_q = select(func.count()).select_from(Voucher).where(
            Voucher.trade_date >= first_day,
            Voucher.trade_date < last_day,
        )
        total_vouchers = (await db.execute(total_q)).scalar() or 0

        # 마감된 전표 수 (settlement_status=LOCKED)
        locked_q = select(func.count()).select_from(Voucher).where(
            Voucher.trade_date >= first_day,
            Voucher.trade_date < last_day,
            Voucher.settlement_status == SettlementStatus.LOCKED,
        )
        locked_vouchers = (await db.execute(locked_q)).scalar() or 0

        # PeriodLock 테이블 확인
        period_lock = (await db.execute(
            select(PeriodLock).where(PeriodLock.year_month == year_month)
        )).scalar_one_or_none()

        if period_lock:
            status = period_lock.status.value if hasattr(period_lock.status, 'value') else period_lock.status
            locked_at = period_lock.locked_at.isoformat() if period_lock.locked_at else None

            locked_by_name = None
            if period_lock.locked_by:
                user = await db.get(User, period_lock.locked_by)
                locked_by_name = user.name if user else None

            locks.append({
                "year_month": year_month,
                "status": status,
                "locked_vouchers": locked_vouchers,
                "total_vouchers": total_vouchers,
                "locked_at": locked_at,
                "locked_by_name": locked_by_name,
                "description": period_lock.memo,
            })
        else:
            # PeriodLock 레코드 없음 → 전표 상태로 판정 (하위 호환)
            if total_vouchers > 0 and locked_vouchers == total_vouchers:
                status = "locked"
            else:
                status = "open"

            # 감사 로그에서 마감 정보 추출 (레거시 호환)
            last_lock_q = (
                select(AuditLog)
                .where(
                    AuditLog.action.in_([
                        AuditAction.VOUCHER_BATCH_LOCK,
                        AuditAction.VOUCHER_LOCK,
                    ]),
                    AuditLog.description.ilike(f"%{year_month}%"),
                )
                .order_by(AuditLog.created_at.desc())
                .limit(1)
            )
            last_lock_result = await db.execute(last_lock_q)
            last_lock_log = last_lock_result.scalar_one_or_none()

            locked_at = None
            locked_by_name = None
            description = None
            if last_lock_log and status == "locked":
                locked_at = last_lock_log.created_at.isoformat() if last_lock_log.created_at else None
                user = await db.get(User, last_lock_log.user_id)
                locked_by_name = user.name if user else None
                description = last_lock_log.description

            locks.append({
                "year_month": year_month,
                "status": status,
                "locked_vouchers": locked_vouchers,
                "total_vouchers": total_vouchers,
                "locked_at": locked_at,
                "locked_by_name": locked_by_name,
                "description": description,
            })

    return {"locks": locks}


@router.post("/{year_month}", response_model=dict)
async def create_monthly_lock(
    year_month: str,
    description: Optional[str] = Body(None, embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """월별 마감 — 해당 월의 모든 미마감 전표를 LOCKED로 변경 + PeriodLock 갱신"""
    try:
        year, month = year_month.split("-")
        first_day = date(int(year), int(month), 1)
        if int(month) == 12:
            last_day = date(int(year) + 1, 1, 1)
        else:
            last_day = date(int(year), int(month) + 1, 1)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="year_month 형식이 올바르지 않습니다 (YYYY-MM)")

    # 미마감 전표를 일괄 LOCKED 처리
    stmt = (
        update(Voucher)
        .where(
            Voucher.trade_date >= first_day,
            Voucher.trade_date < last_day,
            Voucher.settlement_status != SettlementStatus.LOCKED,
        )
        .values(
            settlement_status=SettlementStatus.LOCKED,
            payment_status=PaymentStatus.LOCKED,
        )
    )
    result = await db.execute(stmt)
    locked_count = result.rowcount

    # 전체 전표 수 조회
    total_q = select(func.count()).select_from(Voucher).where(
        Voucher.trade_date >= first_day,
        Voucher.trade_date < last_day,
    )
    total_vouchers = (await db.execute(total_q)).scalar() or 0

    # PeriodLock 레코드 생성/업데이트
    period_lock = (await db.execute(
        select(PeriodLock).where(PeriodLock.year_month == year_month)
    )).scalar_one_or_none()

    now = datetime.utcnow()
    if period_lock:
        period_lock.status = PeriodLockStatus.LOCKED
        period_lock.locked_voucher_count = total_vouchers
        period_lock.locked_at = now
        period_lock.locked_by = current_user.id
        period_lock.memo = description or f"{year_month} 월별 마감 ({locked_count}건)"
    else:
        period_lock = PeriodLock(
            year_month=year_month,
            status=PeriodLockStatus.LOCKED,
            locked_voucher_count=total_vouchers,
            locked_at=now,
            locked_by=current_user.id,
            memo=description or f"{year_month} 월별 마감 ({locked_count}건)",
        )
        db.add(period_lock)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.PERIOD_LOCK,
        target_type="period_lock",
        description=description or f"{year_month} 월별 마감 ({locked_count}건)",
        after_data={"year_month": year_month, "locked_count": locked_count},
    ))

    await db.flush()
    return {"message": f"{year_month} 마감 완료", "locked_count": locked_count}


@router.delete("/{year_month}", response_model=dict)
async def release_monthly_lock(
    year_month: str,
    description: Optional[str] = Body(None, embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """월별 마감 해제 — 해당 월의 LOCKED 전표를 OPEN으로 복원 + PeriodLock 갱신"""
    try:
        year, month = year_month.split("-")
        first_day = date(int(year), int(month), 1)
        if int(month) == 12:
            last_day = date(int(year) + 1, 1, 1)
        else:
            last_day = date(int(year), int(month) + 1, 1)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="year_month 형식이 올바르지 않습니다 (YYYY-MM)")

    stmt = (
        update(Voucher)
        .where(
            Voucher.trade_date >= first_day,
            Voucher.trade_date < last_day,
            Voucher.settlement_status == SettlementStatus.LOCKED,
        )
        .values(
            settlement_status=SettlementStatus.OPEN,
            payment_status=PaymentStatus.UNPAID,
        )
    )
    result = await db.execute(stmt)
    unlocked_count = result.rowcount

    # PeriodLock 레코드 업데이트
    period_lock = (await db.execute(
        select(PeriodLock).where(PeriodLock.year_month == year_month)
    )).scalar_one_or_none()

    now = datetime.utcnow()
    if period_lock:
        period_lock.status = PeriodLockStatus.OPEN
        period_lock.locked_voucher_count = 0
        period_lock.unlocked_at = now
        period_lock.unlocked_by = current_user.id
        period_lock.memo = description or f"{year_month} 월별 마감 해제 ({unlocked_count}건)"

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.PERIOD_UNLOCK,
        target_type="period_lock",
        description=description or f"{year_month} 월별 마감 해제 ({unlocked_count}건)",
        after_data={"year_month": year_month, "unlocked_count": unlocked_count},
    ))

    await db.flush()
    return {"message": f"{year_month} 마감 해제 완료", "unlocked_count": unlocked_count}


@router.get("/audit-logs", response_model=dict)
async def get_lock_audit_logs(
    year: int = Query(..., ge=2020, le=2100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """마감 관련 감사 로그 (연도 필터)"""
    lock_actions = [
        AuditAction.VOUCHER_LOCK,
        AuditAction.VOUCHER_UNLOCK,
        AuditAction.VOUCHER_BATCH_LOCK,
        AuditAction.VOUCHER_BATCH_UNLOCK,
        AuditAction.PERIOD_LOCK,
        AuditAction.PERIOD_UNLOCK,
        AuditAction.PERIOD_ADJUST,
    ]

    year_start = datetime(year, 1, 1)
    year_end = datetime(year + 1, 1, 1)

    query = (
        select(AuditLog)
        .where(
            AuditLog.action.in_(lock_actions),
            AuditLog.created_at >= year_start,
            AuditLog.created_at < year_end,
        )
        .order_by(AuditLog.created_at.desc())
        .limit(500)
    )
    result = await db.execute(query)
    logs = result.scalars().all()

    items = []
    # 사용자 캐시로 N+1 방지
    user_cache: dict[UUID, User | None] = {}
    for log in logs:
        if log.user_id not in user_cache:
            user_cache[log.user_id] = await db.get(User, log.user_id)
        user = user_cache[log.user_id]

        # year_month 추출: after_data에서 또는 description에서
        year_month = ""
        if log.after_data and isinstance(log.after_data, dict):
            year_month = log.after_data.get("year_month", "")
        if not year_month and log.description:
            # "2026-01 월별 마감" 패턴에서 추출
            import re
            m = re.search(r"(\d{4}-\d{2})", log.description)
            if m:
                year_month = m.group(1)

        action_str = "lock"
        if log.action in (
            AuditAction.VOUCHER_UNLOCK,
            AuditAction.VOUCHER_BATCH_UNLOCK,
            AuditAction.PERIOD_UNLOCK,
        ):
            action_str = "unlock"
        elif log.action == AuditAction.PERIOD_ADJUST:
            action_str = "adjust"

        items.append({
            "id": str(log.id),
            "action": action_str,
            "year_month": year_month,
            "user_name": user.name if user else "알 수 없음",
            "description": log.description,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })

    return {"logs": items}


# ─── 개별 전표 마감/해제 ────────────────────────────────────────────

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
        AuditAction.PERIOD_LOCK,
        AuditAction.PERIOD_UNLOCK,
        AuditAction.PERIOD_ADJUST,
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
