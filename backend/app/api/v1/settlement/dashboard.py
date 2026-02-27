"""
정산 도메인 - 대시보드 + 미수/미지급 현황
"""

from typing import Optional
from uuid import UUID
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.voucher import Voucher
from app.models.counterparty import Counterparty
from app.models.receipt import Receipt
from app.models.payment import Payment
from app.models.voucher_change import VoucherChangeRequest
from app.models.enums import (
    VoucherType, SettlementStatus, PaymentStatus, ChangeRequestStatus,
    TransactionType,
)
from app.models.transaction_allocation import TransactionAllocation
from app.models.counterparty_transaction import CounterpartyTransaction
from app.schemas.settlement import (
    DashboardSummary, ReceivableItem, PayableItem, CounterpartySummary,
    TopCounterpartyItem,
)

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대시보드 정산 요약"""

    # 판매 전표 합계 (미수 관련)
    sales_total = (await db.execute(
        select(func.coalesce(func.sum(Voucher.total_amount), 0))
        .where(Voucher.voucher_type == VoucherType.SALES)
    )).scalar() or Decimal("0")

    legacy_received = (await db.execute(
        select(func.coalesce(func.sum(Receipt.amount), 0))
        .join(Voucher, Receipt.voucher_id == Voucher.id)
        .where(Voucher.voucher_type == VoucherType.SALES)
    )).scalar() or Decimal("0")

    alloc_received = (await db.execute(
        select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
        .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
        .join(Voucher, TransactionAllocation.voucher_id == Voucher.id)
        .where(
            Voucher.voucher_type == VoucherType.SALES,
            CounterpartyTransaction.transaction_type == TransactionType.DEPOSIT,
        )
    )).scalar() or Decimal("0")

    total_receivable = sales_total - legacy_received - alloc_received

    # 매입 전표 합계 (미지급 관련)
    purchase_total = (await db.execute(
        select(func.coalesce(func.sum(Voucher.total_amount), 0))
        .where(Voucher.voucher_type == VoucherType.PURCHASE)
    )).scalar() or Decimal("0")

    legacy_paid = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .join(Voucher, Payment.voucher_id == Voucher.id)
        .where(Voucher.voucher_type == VoucherType.PURCHASE)
    )).scalar() or Decimal("0")

    alloc_paid = (await db.execute(
        select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
        .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
        .join(Voucher, TransactionAllocation.voucher_id == Voucher.id)
        .where(
            Voucher.voucher_type == VoucherType.PURCHASE,
            CounterpartyTransaction.transaction_type == TransactionType.WITHDRAWAL,
        )
    )).scalar() or Decimal("0")

    total_payable = purchase_total - legacy_paid - alloc_paid

    # 상태별 건수
    settling_count = (await db.execute(
        select(func.count(Voucher.id))
        .where(Voucher.settlement_status == SettlementStatus.SETTLING)
    )).scalar() or 0

    locked_count = (await db.execute(
        select(func.count(Voucher.id))
        .where(
            (Voucher.settlement_status == SettlementStatus.LOCKED) |
            (Voucher.payment_status == PaymentStatus.LOCKED)
        )
    )).scalar() or 0

    open_sales = (await db.execute(
        select(func.count(Voucher.id))
        .where(
            Voucher.voucher_type == VoucherType.SALES,
            Voucher.settlement_status == SettlementStatus.OPEN,
        )
    )).scalar() or 0

    unpaid_purchase = (await db.execute(
        select(func.count(Voucher.id))
        .where(
            Voucher.voucher_type == VoucherType.PURCHASE,
            Voucher.payment_status == PaymentStatus.UNPAID,
        )
    )).scalar() or 0

    # 변경 요청 대기
    pending_changes = (await db.execute(
        select(func.count(VoucherChangeRequest.id))
        .where(VoucherChangeRequest.status == ChangeRequestStatus.PENDING)
    )).scalar() or 0

    return DashboardSummary(
        total_receivable=total_receivable,
        total_payable=total_payable,
        settling_count=settling_count,
        locked_count=locked_count,
        open_sales_count=open_sales,
        unpaid_purchase_count=unpaid_purchase,
        pending_changes_count=pending_changes,
    )


@router.get("/top-receivables", response_model=dict)
async def get_top_receivables(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """미수 상위 거래처 (Top N) - 단일 쿼리"""
    # 거래처별 판매전표 합계 서브쿼리
    voucher_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Voucher.total_amount), 0).label("total_amount"),
            func.count(Voucher.id).label("voucher_count"),
        )
        .where(Voucher.voucher_type == VoucherType.SALES)
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 누적 입금 서브쿼리 (레거시)
    receipt_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Receipt.amount), 0).label("received"),
        )
        .join(Voucher, Receipt.voucher_id == Voucher.id)
        .where(Voucher.voucher_type == VoucherType.SALES)
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 누적 입금 서브쿼리 (신규 배분)
    alloc_deposit_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0).label("alloc_received"),
        )
        .join(Voucher, TransactionAllocation.voucher_id == Voucher.id)
        .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
        .where(
            Voucher.voucher_type == VoucherType.SALES,
            CounterpartyTransaction.transaction_type == TransactionType.DEPOSIT,
        )
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 단일 쿼리로 합산
    query = (
        select(
            Counterparty.id.label("counterparty_id"),
            Counterparty.name.label("counterparty_name"),
            voucher_sub.c.total_amount,
            voucher_sub.c.voucher_count,
            func.coalesce(receipt_sub.c.received, 0).label("received"),
            func.coalesce(alloc_deposit_sub.c.alloc_received, 0).label("alloc_received"),
        )
        .join(voucher_sub, Counterparty.id == voucher_sub.c.counterparty_id)
        .outerjoin(receipt_sub, Counterparty.id == receipt_sub.c.counterparty_id)
        .outerjoin(alloc_deposit_sub, Counterparty.id == alloc_deposit_sub.c.counterparty_id)
    )

    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        balance = row.total_amount - row.received - row.alloc_received
        if balance > 0:
            items.append(TopCounterpartyItem(
                counterparty_id=row.counterparty_id,
                counterparty_name=row.counterparty_name,
                amount=balance,
                voucher_count=row.voucher_count,
            ))

    items.sort(key=lambda x: x.amount, reverse=True)

    return {"items": items[:limit], "total": len(items)}


@router.get("/top-payables", response_model=dict)
async def get_top_payables(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """미지급 상위 거래처 (Top N) - 단일 쿼리"""
    # 거래처별 매입전표 합계 서브쿼리
    voucher_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Voucher.total_amount), 0).label("total_amount"),
            func.count(Voucher.id).label("voucher_count"),
        )
        .where(Voucher.voucher_type == VoucherType.PURCHASE)
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 누적 지급 서브쿼리 (레거시)
    payment_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Payment.amount), 0).label("paid"),
        )
        .join(Voucher, Payment.voucher_id == Voucher.id)
        .where(Voucher.voucher_type == VoucherType.PURCHASE)
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 누적 지급 서브쿼리 (신규 배분)
    alloc_withdrawal_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0).label("alloc_paid"),
        )
        .join(Voucher, TransactionAllocation.voucher_id == Voucher.id)
        .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
        .where(
            Voucher.voucher_type == VoucherType.PURCHASE,
            CounterpartyTransaction.transaction_type == TransactionType.WITHDRAWAL,
        )
        .group_by(Voucher.counterparty_id)
    ).subquery()

    query = (
        select(
            Counterparty.id.label("counterparty_id"),
            Counterparty.name.label("counterparty_name"),
            voucher_sub.c.total_amount,
            voucher_sub.c.voucher_count,
            func.coalesce(payment_sub.c.paid, 0).label("paid"),
            func.coalesce(alloc_withdrawal_sub.c.alloc_paid, 0).label("alloc_paid"),
        )
        .join(voucher_sub, Counterparty.id == voucher_sub.c.counterparty_id)
        .outerjoin(payment_sub, Counterparty.id == payment_sub.c.counterparty_id)
        .outerjoin(alloc_withdrawal_sub, Counterparty.id == alloc_withdrawal_sub.c.counterparty_id)
    )

    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        balance = row.total_amount - row.paid - row.alloc_paid
        if balance > 0:
            items.append(TopCounterpartyItem(
                counterparty_id=row.counterparty_id,
                counterparty_name=row.counterparty_name,
                amount=balance,
                voucher_count=row.voucher_count,
            ))

    items.sort(key=lambda x: x.amount, reverse=True)

    return {"items": items[:limit], "total": len(items)}


@router.get("/receivables", response_model=dict)
async def list_receivables(
    search: Optional[str] = Query(None),
    include_zero_balance: bool = Query(False, description="잔액 0인 거래처도 포함"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """미수 현황 (거래처별) - 단일 쿼리"""
    # 거래처별 판매전표 합계 서브쿼리
    voucher_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Voucher.total_amount), 0).label("total_amount"),
            func.count(Voucher.id).label("voucher_count"),
        )
        .where(Voucher.voucher_type == VoucherType.SALES)
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 누적 입금 서브쿼리 (레거시)
    receipt_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Receipt.amount), 0).label("received"),
        )
        .join(Voucher, Receipt.voucher_id == Voucher.id)
        .where(Voucher.voucher_type == VoucherType.SALES)
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 누적 입금 서브쿼리 (신규 배분)
    alloc_deposit_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0).label("alloc_received"),
        )
        .join(Voucher, TransactionAllocation.voucher_id == Voucher.id)
        .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
        .where(
            Voucher.voucher_type == VoucherType.SALES,
            CounterpartyTransaction.transaction_type == TransactionType.DEPOSIT,
        )
        .group_by(Voucher.counterparty_id)
    ).subquery()

    query = (
        select(
            Counterparty.id.label("counterparty_id"),
            Counterparty.name.label("counterparty_name"),
            voucher_sub.c.total_amount,
            voucher_sub.c.voucher_count,
            func.coalesce(receipt_sub.c.received, 0).label("received"),
            func.coalesce(alloc_deposit_sub.c.alloc_received, 0).label("alloc_received"),
        )
        .join(voucher_sub, Counterparty.id == voucher_sub.c.counterparty_id)
        .outerjoin(receipt_sub, Counterparty.id == receipt_sub.c.counterparty_id)
        .outerjoin(alloc_deposit_sub, Counterparty.id == alloc_deposit_sub.c.counterparty_id)
    )

    if search:
        query = query.where(Counterparty.name.ilike(f"%{search}%"))

    result = await db.execute(query.order_by(Counterparty.name))
    rows = result.all()

    items = []
    for row in rows:
        total_received = row.received + row.alloc_received
        balance = row.total_amount - total_received
        if balance > 0 or include_zero_balance:
            items.append(ReceivableItem(
                counterparty_id=row.counterparty_id,
                counterparty_name=row.counterparty_name,
                total_amount=row.total_amount,
                total_received=total_received,
                balance=balance,
                voucher_count=row.voucher_count,
            ))

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "receivables": items[start:end],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/payables", response_model=dict)
async def list_payables(
    search: Optional[str] = Query(None),
    include_zero_balance: bool = Query(False, description="잔액 0인 거래처도 포함"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """미지급 현황 (거래처별) - 단일 쿼리"""
    # 거래처별 매입전표 합계 서브쿼리
    voucher_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Voucher.total_amount), 0).label("total_amount"),
            func.count(Voucher.id).label("voucher_count"),
        )
        .where(Voucher.voucher_type == VoucherType.PURCHASE)
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 누적 지급 서브쿼리 (레거시)
    payment_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Payment.amount), 0).label("paid"),
        )
        .join(Voucher, Payment.voucher_id == Voucher.id)
        .where(Voucher.voucher_type == VoucherType.PURCHASE)
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 누적 지급 서브쿼리 (신규 배분)
    alloc_withdrawal_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0).label("alloc_paid"),
        )
        .join(Voucher, TransactionAllocation.voucher_id == Voucher.id)
        .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
        .where(
            Voucher.voucher_type == VoucherType.PURCHASE,
            CounterpartyTransaction.transaction_type == TransactionType.WITHDRAWAL,
        )
        .group_by(Voucher.counterparty_id)
    ).subquery()

    query = (
        select(
            Counterparty.id.label("counterparty_id"),
            Counterparty.name.label("counterparty_name"),
            voucher_sub.c.total_amount,
            voucher_sub.c.voucher_count,
            func.coalesce(payment_sub.c.paid, 0).label("paid"),
            func.coalesce(alloc_withdrawal_sub.c.alloc_paid, 0).label("alloc_paid"),
        )
        .join(voucher_sub, Counterparty.id == voucher_sub.c.counterparty_id)
        .outerjoin(payment_sub, Counterparty.id == payment_sub.c.counterparty_id)
        .outerjoin(alloc_withdrawal_sub, Counterparty.id == alloc_withdrawal_sub.c.counterparty_id)
    )

    if search:
        query = query.where(Counterparty.name.ilike(f"%{search}%"))

    result = await db.execute(query.order_by(Counterparty.name))
    rows = result.all()

    items = []
    for row in rows:
        total_paid = row.paid + row.alloc_paid
        balance = row.total_amount - total_paid
        if balance > 0 or include_zero_balance:
            items.append(PayableItem(
                counterparty_id=row.counterparty_id,
                counterparty_name=row.counterparty_name,
                total_amount=row.total_amount,
                total_paid=total_paid,
                balance=balance,
                voucher_count=row.voucher_count,
            ))

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "payables": items[start:end],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
