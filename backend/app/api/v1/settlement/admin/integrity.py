"""
정산 관리자 - 데이터 정합성 점검 API
기존 helpers.py의 정합성 검증 함수를 활용하여 관리자 전용 뷰 제공
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User
from app.api.v1.settlement.helpers import (
    verify_transaction_allocation_integrity,
    verify_voucher_balance_integrity,
    verify_netting_balance_integrity,
    run_full_integrity_check,
)

router = APIRouter()


@router.get("/check")
async def check_integrity(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """전체 정합성 점검 실행 (3대 검증)"""
    from app.core.database import AsyncSessionLocal

    # 별도 세션으로 격리 (실패 시 트랜잭션 오염 방지)
    async with AsyncSessionLocal() as check_db:
        result = await run_full_integrity_check(check_db)
    return result


@router.get("/counterparty-balance")
async def check_counterparty_balance(
    search: str = Query("", description="거래처명 검색"),
    mismatch_only: bool = Query(False, description="불일치만 표시"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """거래처별 잔액 교차 검증"""

    offset = (page - 1) * page_size

    # 거래처별 전표/입출금/배분 합계 교차 대조
    query = text("""
        WITH cp_vouchers AS (
            SELECT
                counterparty_id,
                COALESCE(SUM(total_amount) FILTER (WHERE voucher_type = 'SALES'), 0) AS sales_total,
                COALESCE(SUM(total_amount) FILTER (WHERE voucher_type = 'PURCHASE'), 0) AS purchase_total
            FROM vouchers
            GROUP BY counterparty_id
        ),
        cp_transactions AS (
            SELECT
                counterparty_id,
                COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'DEPOSIT'), 0) AS deposit_total,
                COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'WITHDRAWAL'), 0) AS withdrawal_total,
                COALESCE(SUM(allocated_amount), 0) AS allocated_total
            FROM counterparty_transactions
            WHERE status NOT IN ('CANCELLED', 'HIDDEN')
            GROUP BY counterparty_id
        ),
        cp_legacy AS (
            SELECT
                v.counterparty_id,
                COALESCE(SUM(r.amount), 0) AS receipt_total,
                COALESCE(SUM(p.amount), 0) AS payment_total
            FROM vouchers v
            LEFT JOIN receipts r ON r.voucher_id = v.id
            LEFT JOIN payments p ON p.voucher_id = v.id
            GROUP BY v.counterparty_id
        )
        SELECT
            c.id,
            c.name,
            COALESCE(cv.sales_total, 0) AS sales_total,
            COALESCE(cv.purchase_total, 0) AS purchase_total,
            COALESCE(ct.deposit_total, 0) AS deposit_total,
            COALESCE(ct.withdrawal_total, 0) AS withdrawal_total,
            COALESCE(ct.allocated_total, 0) AS allocated_total,
            COALESCE(cl.receipt_total, 0) AS receipt_total,
            COALESCE(cl.payment_total, 0) AS payment_total,
            (COALESCE(cv.sales_total, 0)
             - COALESCE(ct.allocated_total, 0)
             - COALESCE(cl.receipt_total, 0)
            ) AS sales_balance,
            (COALESCE(cv.purchase_total, 0)
             - COALESCE(ct.allocated_total, 0)
             - COALESCE(cl.payment_total, 0)
            ) AS purchase_balance
        FROM counterparties c
        LEFT JOIN cp_vouchers cv ON cv.counterparty_id = c.id
        LEFT JOIN cp_transactions ct ON ct.counterparty_id = c.id
        LEFT JOIN cp_legacy cl ON cl.counterparty_id = c.id
        WHERE c.is_active = true
          AND (:search = '' OR c.name ILIKE '%' || :search || '%')
        ORDER BY c.name
    """)

    rows = (await db.execute(query, {"search": search})).mappings().all()

    # 불일치만 필터
    results = []
    for row in rows:
        item = {
            "id": str(row["id"]),
            "name": row["name"],
            "sales_total": str(row["sales_total"]),
            "purchase_total": str(row["purchase_total"]),
            "deposit_total": str(row["deposit_total"]),
            "withdrawal_total": str(row["withdrawal_total"]),
            "allocated_total": str(row["allocated_total"]),
            "receipt_total": str(row["receipt_total"]),
            "payment_total": str(row["payment_total"]),
            "sales_balance": str(row["sales_balance"]),
            "purchase_balance": str(row["purchase_balance"]),
        }
        if mismatch_only:
            if float(row["sales_balance"]) != 0 or float(row["purchase_balance"]) != 0:
                results.append(item)
        else:
            results.append(item)

    total = len(results)
    paginated = results[offset:offset + page_size]

    return {
        "items": paginated,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
