"""
정산 관리자 - 기간 마감 일괄 관리 API
마감 현황 조회 + 마감/해제/수정 모드 조작 + 마감 이력
"""

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, update, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User
from app.models.voucher import Voucher
from app.models.return_item import ReturnItem
from app.models.intake_item import IntakeItem
from app.models.period_lock import PeriodLock
from app.models.enums import (
    SettlementStatus, PaymentStatus, AuditAction, PeriodLockStatus,
)
from app.models.audit_log import AuditLog
from app.api.v1.settlement.transactions import _update_voucher_status

router = APIRouter()


# ─── 요청 스키마 ────────────────────────────────────────────────────

class PeriodLockRequest(BaseModel):
    year_month: str  # "YYYY-MM"
    description: Optional[str] = None


# ─── 헬퍼 ──────────────────────────────────────────────────────────

def _parse_year_month(year_month: str) -> tuple[date, date]:
    """year_month를 파싱하여 (first_day, last_day) 반환"""
    try:
        year, month = year_month.split("-")
        first_day = date(int(year), int(month), 1)
        if int(month) == 12:
            last_day = date(int(year) + 1, 1, 1)
        else:
            last_day = date(int(year), int(month) + 1, 1)
        return first_day, last_day
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="year_month 형식이 올바르지 않습니다 (YYYY-MM)")


async def _get_period_lock(year_month: str, db: AsyncSession) -> PeriodLock | None:
    return (await db.execute(
        select(PeriodLock).where(PeriodLock.year_month == year_month)
    )).scalar_one_or_none()


@router.get("/status")
async def get_period_lock_status(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """전체 기간 마감 현황"""

    locks = (await db.execute(text("""
        SELECT
            pl.id,
            pl.year_month,
            pl.status::text AS status,
            pl.locked_at,
            pl.locked_by,
            u.name AS locked_by_name,
            u.email AS locked_by_email,
            pl.created_at,
            pl.updated_at
        FROM period_locks pl
        LEFT JOIN users u ON u.id = pl.locked_by
        ORDER BY pl.year_month DESC
        LIMIT 24
    """))).mappings().all()

    items = [
        {
            "id": str(row["id"]),
            "year_month": row["year_month"],
            "status": row["status"],
            "locked_at": row["locked_at"].isoformat() if row["locked_at"] else None,
            "locked_by_name": row["locked_by_name"],
            "locked_by_email": row["locked_by_email"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        for row in locks
    ]

    # 상태별 카운트
    status_counts = {}
    for item in items:
        s = item["status"]
        status_counts[s] = status_counts.get(s, 0) + 1

    # 마감 관련 감사 이력 (최근 20건)
    history = (await db.execute(text("""
        SELECT
            al.id,
            al.action::text AS action,
            al.description,
            al.created_at,
            u.name AS user_name,
            u.email AS user_email
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.action::text IN ('PERIOD_LOCK', 'PERIOD_UNLOCK', 'PERIOD_ADJUST')
        ORDER BY al.created_at DESC
        LIMIT 20
    """))).mappings().all()

    audit_history = [
        {
            "id": str(row["id"]),
            "action": row["action"],
            "description": row["description"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "user_name": row["user_name"],
            "user_email": row["user_email"],
        }
        for row in history
    ]

    return {
        "periods": items,
        "status_counts": status_counts,
        "history": audit_history,
    }


# ─── 마감 조작 API ─────────────────────────────────────────────────

@router.post("/lock")
async def admin_lock_period(
    body: PeriodLockRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """관리자 월별 마감 — 해당 월 미마감 전표를 LOCKED로 변경 + PeriodLock 갱신"""
    first_day, last_day = _parse_year_month(body.year_month)

    # 상태 검증
    period_lock = await _get_period_lock(body.year_month, db)
    if period_lock and period_lock.status == PeriodLockStatus.LOCKED:
        raise HTTPException(status_code=400, detail=f"{body.year_month}은 이미 마감 상태입니다")

    # 미마감 전표 일괄 LOCKED
    result = await db.execute(
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
    locked_count = result.rowcount

    # 반품/반입 내역 잠금
    await db.execute(
        update(ReturnItem).where(
            ReturnItem.return_date >= first_day,
            ReturnItem.return_date < last_day,
            ReturnItem.is_locked == False,
        ).values(is_locked=True)
    )
    await db.execute(
        update(IntakeItem).where(
            IntakeItem.intake_date >= first_day,
            IntakeItem.intake_date < last_day,
            IntakeItem.is_locked == False,
        ).values(is_locked=True)
    )

    # 전체 전표 수
    total_vouchers = (await db.execute(
        select(func.count()).select_from(Voucher).where(
            Voucher.trade_date >= first_day, Voucher.trade_date < last_day,
        )
    )).scalar() or 0

    # PeriodLock 갱신/생성
    now = datetime.utcnow()
    desc = body.description or f"{body.year_month} 관리자 마감 ({locked_count}건)"
    if period_lock:
        period_lock.status = PeriodLockStatus.LOCKED
        period_lock.locked_voucher_count = total_vouchers
        period_lock.locked_at = now
        period_lock.locked_by = current_user.id
        period_lock.memo = desc
    else:
        period_lock = PeriodLock(
            year_month=body.year_month,
            status=PeriodLockStatus.LOCKED,
            locked_voucher_count=total_vouchers,
            locked_at=now,
            locked_by=current_user.id,
            memo=desc,
        )
        db.add(period_lock)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.PERIOD_LOCK,
        target_type="period_lock",
        description=desc,
        after_data={"year_month": body.year_month, "locked_count": locked_count},
    ))
    await db.flush()
    return {"message": f"{body.year_month} 마감 완료", "locked_count": locked_count}


@router.post("/unlock")
async def admin_unlock_period(
    body: PeriodLockRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """관리자 월별 마감 해제 — LOCKED 전표를 배분 실적 기반으로 상태 복원"""
    first_day, last_day = _parse_year_month(body.year_month)

    period_lock = await _get_period_lock(body.year_month, db)
    if not period_lock or period_lock.status not in (PeriodLockStatus.LOCKED, PeriodLockStatus.ADJUSTING):
        raise HTTPException(
            status_code=400,
            detail=f"{body.year_month}은 마감 또는 수정 모드 상태가 아닙니다"
        )

    previous_status = period_lock.status.value

    # LOCKED 전표 조회 → 상태 복원
    locked_vouchers = (await db.execute(
        select(Voucher).where(
            Voucher.trade_date >= first_day,
            Voucher.trade_date < last_day,
            Voucher.settlement_status == SettlementStatus.LOCKED,
        )
    )).scalars().all()
    unlocked_count = len(locked_vouchers)

    for v in locked_vouchers:
        v.settlement_status = SettlementStatus.OPEN
        v.payment_status = PaymentStatus.UNPAID

    await db.flush()
    for v in locked_vouchers:
        await _update_voucher_status(v.id, db)

    # 반품/반입 잠금 해제
    await db.execute(
        update(ReturnItem).where(
            ReturnItem.return_date >= first_day,
            ReturnItem.return_date < last_day,
            ReturnItem.is_locked == True,
        ).values(is_locked=False)
    )
    await db.execute(
        update(IntakeItem).where(
            IntakeItem.intake_date >= first_day,
            IntakeItem.intake_date < last_day,
            IntakeItem.is_locked == True,
        ).values(is_locked=False)
    )

    # PeriodLock 갱신
    now = datetime.utcnow()
    desc = body.description or f"{body.year_month} 관리자 마감 해제 ({unlocked_count}건)"
    period_lock.status = PeriodLockStatus.OPEN
    period_lock.locked_voucher_count = 0
    period_lock.unlocked_at = now
    period_lock.unlocked_by = current_user.id
    period_lock.memo = desc

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.PERIOD_UNLOCK,
        target_type="period_lock",
        description=desc,
        after_data={
            "year_month": body.year_month,
            "unlocked_count": unlocked_count,
            "previous_status": previous_status,
        },
    ))
    await db.flush()
    return {"message": f"{body.year_month} 마감 해제 완료", "unlocked_count": unlocked_count}


@router.post("/adjust")
async def admin_adjust_period(
    body: PeriodLockRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """관리자 수정 모드 전환 — LOCKED→ADJUSTING (전표 잠금 유지, 조정전표만 허용)"""
    period_lock = await _get_period_lock(body.year_month, db)
    if not period_lock or period_lock.status != PeriodLockStatus.LOCKED:
        raise HTTPException(
            status_code=400,
            detail=f"{body.year_month}은 마감(LOCKED) 상태가 아닙니다. 마감 상태에서만 수정 모드 전환이 가능합니다."
        )

    now = datetime.utcnow()
    desc = body.description or f"{body.year_month} 수정 모드 진입"
    period_lock.status = PeriodLockStatus.ADJUSTING
    period_lock.memo = desc

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.PERIOD_ADJUST,
        target_type="period_lock",
        description=desc,
        after_data={"year_month": body.year_month, "new_status": "ADJUSTING"},
    ))
    await db.flush()
    return {"message": f"{body.year_month} 수정 모드 진입", "status": "ADJUSTING"}
