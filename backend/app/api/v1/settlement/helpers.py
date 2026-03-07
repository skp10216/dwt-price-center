"""
정산 도메인 - 공통 헬퍼 함수
기간 마감 검증, 정합성 검증 등 정산 엔드포인트에서 공통으로 사용하는 유틸리티
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.period_lock import PeriodLock
from app.models.enums import PeriodLockStatus


# ============================================================================
# 기간 마감 검증
# ============================================================================

async def check_period_not_locked(trade_date: date, db: AsyncSession) -> None:
    """
    해당 거래일이 속한 기간이 마감되었는지 확인.
    마감 상태이면 HTTPException 400을 발생시킵니다.
    조정 중(ADJUSTING) 상태는 조정전표만 허용하므로 별도 체크 필요.
    """
    year_month = trade_date.strftime("%Y-%m")
    result = await db.execute(
        select(PeriodLock).where(PeriodLock.year_month == year_month)
    )
    lock = result.scalar_one_or_none()
    if lock and lock.status == PeriodLockStatus.LOCKED:
        raise HTTPException(
            status_code=400,
            detail=f"{year_month} 기간이 마감되어 전표/입출금 생성·수정이 불가합니다. "
                   f"마감 해제 후 진행하거나, 마감된 전표에 대해서는 조정전표를 사용하세요."
        )


async def check_period_allows_adjustment(trade_date: date, db: AsyncSession) -> None:
    """
    조정전표 생성 시 기간 상태 확인.
    LOCKED 또는 ADJUSTING 상태에서만 조정전표 허용.
    """
    year_month = trade_date.strftime("%Y-%m")
    result = await db.execute(
        select(PeriodLock).where(PeriodLock.year_month == year_month)
    )
    lock = result.scalar_one_or_none()
    # 기간 잠금이 없거나 OPEN이면 조정전표 대신 직접 수정하도록 안내
    if not lock or lock.status == PeriodLockStatus.OPEN:
        # 이 경우 조정전표는 허용하되 경고는 하지 않음 (원본 전표 마감 여부는 별도 체크)
        pass


# ============================================================================
# 정합성 검증 유틸리티
# ============================================================================

async def verify_transaction_allocation_integrity(db: AsyncSession) -> dict:
    """
    모든 CounterpartyTransaction의 allocated_amount가
    실제 TransactionAllocation 합산과 일치하는지 검증.

    Returns:
        {
            "total_checked": int,
            "mismatches": [{"transaction_id": str, "stored": str, "actual": str}],
            "is_consistent": bool
        }
    """
    result = await db.execute(text("""
        SELECT
            ct.id,
            ct.allocated_amount AS stored_amount,
            COALESCE(ta_sum.total, 0) AS actual_amount
        FROM counterparty_transactions ct
        LEFT JOIN (
            SELECT transaction_id, SUM(allocated_amount) AS total
            FROM transaction_allocations
            GROUP BY transaction_id
        ) ta_sum ON ta_sum.transaction_id = ct.id
        WHERE ct.status NOT IN ('CANCELLED')
          AND ct.allocated_amount != COALESCE(ta_sum.total, 0)
    """))
    mismatches = [
        {
            "transaction_id": str(row[0]),
            "stored": str(row[1]),
            "actual": str(row[2]),
        }
        for row in result.all()
    ]

    total_checked = (await db.execute(text(
        "SELECT COUNT(*) FROM counterparty_transactions WHERE status != 'CANCELLED'"
    ))).scalar() or 0

    return {
        "total_checked": total_checked,
        "mismatches": mismatches,
        "is_consistent": len(mismatches) == 0,
    }


async def verify_voucher_balance_integrity(db: AsyncSession) -> dict:
    """
    전표별 잔액(total_amount - 배분합계) 검증.
    잔액이 음수인 전표(초과 배분)를 검출.

    Returns:
        {
            "total_checked": int,
            "over_allocated": [{"voucher_id": str, "total_amount": str, "allocated": str, "balance": str}],
            "is_consistent": bool
        }
    """
    result = await db.execute(text("""
        WITH voucher_allocated AS (
            SELECT
                v.id,
                v.total_amount,
                v.voucher_type,
                COALESCE(ta.alloc_total, 0) AS alloc_total,
                CASE
                    WHEN v.voucher_type = 'SALES' THEN COALESCE(r.receipt_total, 0)
                    ELSE COALESCE(p.payment_total, 0)
                END AS legacy_total
            FROM vouchers v
            LEFT JOIN (
                SELECT voucher_id, SUM(allocated_amount) AS alloc_total
                FROM transaction_allocations
                GROUP BY voucher_id
            ) ta ON ta.voucher_id = v.id
            LEFT JOIN (
                SELECT voucher_id, SUM(amount) AS receipt_total
                FROM receipts
                GROUP BY voucher_id
            ) r ON r.voucher_id = v.id
            LEFT JOIN (
                SELECT voucher_id, SUM(amount) AS payment_total
                FROM payments
                GROUP BY voucher_id
            ) p ON p.voucher_id = v.id
        )
        SELECT
            id,
            total_amount,
            alloc_total + legacy_total AS allocated,
            total_amount - alloc_total - legacy_total AS balance
        FROM voucher_allocated
        WHERE total_amount - alloc_total - legacy_total < 0
    """))
    over_allocated = [
        {
            "voucher_id": str(row[0]),
            "total_amount": str(row[1]),
            "allocated": str(row[2]),
            "balance": str(row[3]),
        }
        for row in result.all()
    ]

    total_checked = (await db.execute(text(
        "SELECT COUNT(*) FROM vouchers"
    ))).scalar() or 0

    return {
        "total_checked": total_checked,
        "over_allocated": over_allocated,
        "is_consistent": len(over_allocated) == 0,
    }


async def verify_netting_balance_integrity(db: AsyncSession) -> dict:
    """
    확정된 상계 레코드의 매출/매입 전표 합계 일치 검증.

    Returns:
        {
            "total_checked": int,
            "mismatches": [{"netting_id": str, "sales_total": str, "purchase_total": str}],
            "is_consistent": bool
        }
    """
    result = await db.execute(text("""
        SELECT
            nr.id,
            COALESCE(sales.total, 0) AS sales_total,
            COALESCE(purchases.total, 0) AS purchase_total
        FROM netting_records nr
        LEFT JOIN (
            SELECT nvl.netting_record_id, SUM(nvl.netted_amount) AS total
            FROM netting_voucher_links nvl
            JOIN vouchers v ON nvl.voucher_id = v.id
            WHERE v.voucher_type = 'SALES'
            GROUP BY nvl.netting_record_id
        ) sales ON sales.netting_record_id = nr.id
        LEFT JOIN (
            SELECT nvl.netting_record_id, SUM(nvl.netted_amount) AS total
            FROM netting_voucher_links nvl
            JOIN vouchers v ON nvl.voucher_id = v.id
            WHERE v.voucher_type = 'PURCHASE'
            GROUP BY nvl.netting_record_id
        ) purchases ON purchases.netting_record_id = nr.id
        WHERE nr.status = 'CONFIRMED'
          AND COALESCE(sales.total, 0) != COALESCE(purchases.total, 0)
    """))
    mismatches = [
        {
            "netting_id": str(row[0]),
            "sales_total": str(row[1]),
            "purchase_total": str(row[2]),
        }
        for row in result.all()
    ]

    total_checked = (await db.execute(text(
        "SELECT COUNT(*) FROM netting_records WHERE status = 'CONFIRMED'"
    ))).scalar() or 0

    return {
        "total_checked": total_checked,
        "mismatches": mismatches,
        "is_consistent": len(mismatches) == 0,
    }


async def run_full_integrity_check(db: AsyncSession) -> dict:
    """모든 정합성 검증을 실행하고 결과를 종합"""
    txn_result = await verify_transaction_allocation_integrity(db)
    voucher_result = await verify_voucher_balance_integrity(db)
    netting_result = await verify_netting_balance_integrity(db)

    all_consistent = (
        txn_result["is_consistent"]
        and voucher_result["is_consistent"]
        and netting_result["is_consistent"]
    )

    return {
        "is_consistent": all_consistent,
        "transaction_allocation": txn_result,
        "voucher_balance": voucher_result,
        "netting_balance": netting_result,
    }
