"""
정산 관리자 - 데이터 정합성 점검 API
기존 helpers.py의 정합성 검증 함수를 활용하여 관리자 전용 뷰 제공
+ Phase 3: 정합성 수정 기능 (배분 재계산, 전표 재계산, 잔액 조정)
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User
from app.models.counterparty_transaction import CounterpartyTransaction
from app.models.transaction_allocation import TransactionAllocation
from app.models.voucher import Voucher
from app.models.audit_log import AuditLog
from app.models.enums import (
    AuditAction, TransactionStatus,
)
from app.api.v1.settlement.helpers import (
    verify_transaction_allocation_integrity,
    verify_voucher_balance_integrity,
    verify_netting_balance_integrity,
    run_full_integrity_check,
)
from app.api.v1.settlement.transactions import _update_voucher_status

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


# ─── 정합성 수정 API ──────────────────────────────────────────────


class RecalcAllocationsRequest(BaseModel):
    transaction_ids: Optional[list[str]] = None
    all_mismatched: bool = False


@router.post("/recalculate-allocations")
async def recalculate_allocations(
    body: RecalcAllocationsRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """배분 합계 재계산 — allocated_amount를 실제 allocation 합계로 갱신"""

    if body.all_mismatched:
        # 불일치 건만 조회
        rows = (await db.execute(text("""
            SELECT ct.id
            FROM counterparty_transactions ct
            LEFT JOIN (
                SELECT transaction_id, SUM(allocated_amount) AS total
                FROM transaction_allocations
                GROUP BY transaction_id
            ) ta ON ta.transaction_id = ct.id
            WHERE ct.status != 'CANCELLED'
              AND ct.allocated_amount != COALESCE(ta.total, 0)
        """))).all()
        target_ids = [row[0] for row in rows]
    elif body.transaction_ids:
        target_ids = [UUID(tid) for tid in body.transaction_ids]
    else:
        raise HTTPException(status_code=400, detail="transaction_ids 또는 all_mismatched=true를 지정하세요")

    if not target_ids:
        return {"fixed_count": 0, "message": "수정 대상 없음"}

    fixed = 0
    for tid in target_ids:
        txn = await db.get(CounterpartyTransaction, tid)
        if not txn:
            continue

        actual_sum = (await db.execute(
            select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
            .where(TransactionAllocation.transaction_id == tid)
        )).scalar()

        if txn.allocated_amount != actual_sum:
            txn.allocated_amount = actual_sum
            # 상태도 함께 갱신
            if actual_sum >= txn.amount:
                txn.status = TransactionStatus.ALLOCATED
            elif actual_sum > 0:
                txn.status = TransactionStatus.PARTIAL
            else:
                txn.status = TransactionStatus.PENDING
            fixed += 1

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.INTEGRITY_FIX,
        target_type="counterparty_transaction",
        description=f"배분 합계 재계산: {fixed}건 수정",
        after_data={"fixed_count": fixed, "total_target": len(target_ids)},
    ))
    await db.flush()

    return {"fixed_count": fixed, "total_target": len(target_ids)}


class RecalcVoucherBalancesRequest(BaseModel):
    voucher_ids: Optional[list[str]] = None
    all_over_allocated: bool = False


@router.post("/recalculate-voucher-balances")
async def recalculate_voucher_balances(
    body: RecalcVoucherBalancesRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """전표 상태 재계산 — 배분 합계 기반으로 settlement/payment 상태 갱신"""

    if body.all_over_allocated:
        rows = (await db.execute(text("""
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
            SELECT id FROM voucher_allocated
            WHERE total_amount - alloc_total - legacy_total < 0
        """))).all()
        target_ids = [row[0] for row in rows]
    elif body.voucher_ids:
        target_ids = [UUID(vid) for vid in body.voucher_ids]
    else:
        raise HTTPException(status_code=400, detail="voucher_ids 또는 all_over_allocated=true를 지정하세요")

    if not target_ids:
        return {"fixed_count": 0, "message": "수정 대상 없음"}

    fixed = 0
    for vid in target_ids:
        v = await db.get(Voucher, vid)
        if not v:
            continue
        await _update_voucher_status(vid, db)
        fixed += 1

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.INTEGRITY_FIX,
        target_type="voucher",
        description=f"전표 상태 재계산: {fixed}건 수정",
        after_data={"fixed_count": fixed, "total_target": len(target_ids)},
    ))
    await db.flush()

    return {"fixed_count": fixed, "total_target": len(target_ids)}


class AdjustBalanceRequest(BaseModel):
    counterparty_id: str
    adjustment_type: str  # "INCREASE" or "DECREASE"
    amount: float
    voucher_type: str  # "SALES" or "PURCHASE"
    description: str


@router.post("/adjust-counterparty-balance")
async def adjust_counterparty_balance(
    body: AdjustBalanceRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """거래처 잔액 조정 — 조정 입출금 내역 생성"""
    from decimal import Decimal
    from datetime import datetime
    from app.models.enums import TransactionType, TransactionSource

    counterparty_id = UUID(body.counterparty_id)

    # 거래처 존재 확인
    from app.models.counterparty import Counterparty
    cp = await db.get(Counterparty, counterparty_id)
    if not cp:
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

    amount = Decimal(str(body.amount))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="금액은 0보다 커야 합니다")

    # 조정 유형에 따라 입금/출금 결정
    if body.voucher_type == "SALES":
        txn_type = TransactionType.DEPOSIT if body.adjustment_type == "INCREASE" else TransactionType.WITHDRAWAL
    else:
        txn_type = TransactionType.WITHDRAWAL if body.adjustment_type == "INCREASE" else TransactionType.DEPOSIT

    now = datetime.utcnow()
    txn = CounterpartyTransaction(
        counterparty_id=counterparty_id,
        transaction_type=txn_type,
        source=TransactionSource.MANUAL,
        amount=amount,
        allocated_amount=Decimal("0"),
        status=TransactionStatus.PENDING,
        transaction_date=now.date(),
        description=f"[잔액조정] {body.description}",
        created_by=current_user.id,
    )
    db.add(txn)
    await db.flush()

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.BALANCE_ADJUSTMENT,
        target_type="counterparty_transaction",
        target_id=txn.id,
        description=f"거래처 잔액 조정: {cp.name} {body.adjustment_type} {amount}",
        after_data={
            "counterparty_id": str(counterparty_id),
            "counterparty_name": cp.name,
            "type": txn_type.value,
            "amount": str(amount),
            "description": body.description,
        },
    ))
    await db.flush()

    return {
        "message": "잔액 조정 완료",
        "transaction_id": str(txn.id),
        "counterparty_name": cp.name,
        "type": txn_type.value,
        "amount": str(amount),
    }
