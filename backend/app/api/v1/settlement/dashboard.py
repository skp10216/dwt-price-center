"""
정산 도메인 - 대시보드 + 미수/미지급 현황
"""

from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import date

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
    TransactionType, TransactionStatus,
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

    _active_txn_filter = CounterpartyTransaction.status.notin_([
        TransactionStatus.CANCELLED, TransactionStatus.HIDDEN,
    ])

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

    txn_received = (await db.execute(
        select(func.coalesce(func.sum(CounterpartyTransaction.amount), 0))
        .where(
            CounterpartyTransaction.transaction_type == TransactionType.DEPOSIT,
            _active_txn_filter,
        )
    )).scalar() or Decimal("0")

    total_receivable = sales_total - legacy_received - txn_received

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

    txn_paid = (await db.execute(
        select(func.coalesce(func.sum(CounterpartyTransaction.amount), 0))
        .where(
            CounterpartyTransaction.transaction_type == TransactionType.WITHDRAWAL,
            _active_txn_filter,
        )
    )).scalar() or Decimal("0")

    total_payable = purchase_total - legacy_paid - txn_paid

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
        total_deposit=legacy_received + txn_received,
        total_withdrawal=legacy_paid + txn_paid,
        total_sales=sales_total,
        total_purchase=purchase_total,
    )


@router.get("/top-receivables", response_model=dict)
async def get_top_receivables(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """미수 상위 거래처 (Top N) - 단일 쿼리"""
    _active_txn_filter = CounterpartyTransaction.status.notin_([
        TransactionStatus.CANCELLED, TransactionStatus.HIDDEN,
    ])

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

    # 거래처별 DEPOSIT 트랜잭션 직접 합산 (배분 여부 무관)
    deposit_txn_sub = (
        select(
            CounterpartyTransaction.counterparty_id,
            func.coalesce(func.sum(CounterpartyTransaction.amount), 0).label("txn_received"),
        )
        .where(
            CounterpartyTransaction.transaction_type == TransactionType.DEPOSIT,
            _active_txn_filter,
        )
        .group_by(CounterpartyTransaction.counterparty_id)
    ).subquery()

    query = (
        select(
            Counterparty.id.label("counterparty_id"),
            Counterparty.name.label("counterparty_name"),
            voucher_sub.c.total_amount,
            voucher_sub.c.voucher_count,
            func.coalesce(receipt_sub.c.received, 0).label("received"),
            func.coalesce(deposit_txn_sub.c.txn_received, 0).label("txn_received"),
        )
        .join(voucher_sub, Counterparty.id == voucher_sub.c.counterparty_id)
        .outerjoin(receipt_sub, Counterparty.id == receipt_sub.c.counterparty_id)
        .outerjoin(deposit_txn_sub, Counterparty.id == deposit_txn_sub.c.counterparty_id)
    )

    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        balance = row.total_amount - row.received - row.txn_received
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
    _active_txn_filter = CounterpartyTransaction.status.notin_([
        TransactionStatus.CANCELLED, TransactionStatus.HIDDEN,
    ])

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

    # 거래처별 WITHDRAWAL 트랜잭션 직접 합산 (배분 여부 무관)
    withdrawal_txn_sub = (
        select(
            CounterpartyTransaction.counterparty_id,
            func.coalesce(func.sum(CounterpartyTransaction.amount), 0).label("txn_paid"),
        )
        .where(
            CounterpartyTransaction.transaction_type == TransactionType.WITHDRAWAL,
            _active_txn_filter,
        )
        .group_by(CounterpartyTransaction.counterparty_id)
    ).subquery()

    query = (
        select(
            Counterparty.id.label("counterparty_id"),
            Counterparty.name.label("counterparty_name"),
            func.coalesce(voucher_sub.c.total_amount, 0).label("total_amount"),
            func.coalesce(voucher_sub.c.voucher_count, 0).label("voucher_count"),
            func.coalesce(payment_sub.c.paid, 0).label("paid"),
            func.coalesce(withdrawal_txn_sub.c.txn_paid, 0).label("txn_paid"),
        )
        .outerjoin(voucher_sub, Counterparty.id == voucher_sub.c.counterparty_id)
        .outerjoin(payment_sub, Counterparty.id == payment_sub.c.counterparty_id)
        .outerjoin(withdrawal_txn_sub, Counterparty.id == withdrawal_txn_sub.c.counterparty_id)
        .where(
            (voucher_sub.c.counterparty_id.isnot(None)) |
            (withdrawal_txn_sub.c.counterparty_id.isnot(None))
        )
    )

    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        balance = row.total_amount - row.paid - row.txn_paid
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
    date_from: Optional[date] = Query(None, description="전표 거래일 시작"),
    date_to: Optional[date] = Query(None, description="전표 거래일 종료"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """미수 현황 (거래처별) - 전표 거래일 기준 필터 + 입출금 트랜잭션 직접 합산"""
    _active_txn_filter = CounterpartyTransaction.status.notin_([
        TransactionStatus.CANCELLED, TransactionStatus.HIDDEN,
    ])

    # 전표 날짜 필터 조건
    voucher_date_filters = [Voucher.voucher_type == VoucherType.SALES]
    if date_from:
        voucher_date_filters.append(Voucher.trade_date >= date_from)
    if date_to:
        voucher_date_filters.append(Voucher.trade_date <= date_to)

    # 기간 내 전표 ID 목록 (레거시 입금 서브쿼리에서 재사용)
    voucher_id_filter = select(Voucher.id).where(*voucher_date_filters)

    # 거래처별 판매전표 합계 서브쿼리
    voucher_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Voucher.total_amount), 0).label("total_amount"),
            func.count(Voucher.id).label("voucher_count"),
        )
        .where(*voucher_date_filters)
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 누적 입금 서브쿼리 (레거시) — 기간 내 전표에 연결된 입금만
    receipt_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Receipt.amount), 0).label("received"),
        )
        .join(Voucher, Receipt.voucher_id == Voucher.id)
        .where(Receipt.voucher_id.in_(voucher_id_filter))
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 DEPOSIT 트랜잭션 직접 합산 (배분 여부 무관, 기간 필터 적용)
    deposit_txn_filters = [
        CounterpartyTransaction.transaction_type == TransactionType.DEPOSIT,
        _active_txn_filter,
    ]
    if date_from:
        deposit_txn_filters.append(CounterpartyTransaction.transaction_date >= date_from)
    if date_to:
        deposit_txn_filters.append(CounterpartyTransaction.transaction_date <= date_to)

    deposit_txn_sub = (
        select(
            CounterpartyTransaction.counterparty_id,
            func.coalesce(func.sum(CounterpartyTransaction.amount), 0).label("txn_received"),
        )
        .where(*deposit_txn_filters)
        .group_by(CounterpartyTransaction.counterparty_id)
    ).subquery()

    # balance를 SQL에서 계산
    total_received_expr = (
        func.coalesce(receipt_sub.c.received, 0) +
        func.coalesce(deposit_txn_sub.c.txn_received, 0)
    )
    balance_expr = func.coalesce(voucher_sub.c.total_amount, 0) - total_received_expr

    query = (
        select(
            Counterparty.id.label("counterparty_id"),
            Counterparty.name.label("counterparty_name"),
            func.coalesce(voucher_sub.c.total_amount, 0).label("total_amount"),
            func.coalesce(voucher_sub.c.voucher_count, 0).label("voucher_count"),
            total_received_expr.label("total_received"),
            balance_expr.label("balance"),
        )
        .outerjoin(voucher_sub, Counterparty.id == voucher_sub.c.counterparty_id)
        .outerjoin(receipt_sub, Counterparty.id == receipt_sub.c.counterparty_id)
        .outerjoin(deposit_txn_sub, Counterparty.id == deposit_txn_sub.c.counterparty_id)
        .where(
            (voucher_sub.c.counterparty_id.isnot(None)) |
            (deposit_txn_sub.c.counterparty_id.isnot(None))
        )
    )

    if search:
        query = query.where(Counterparty.name.ilike(f"%{search}%"))

    if not include_zero_balance:
        query = query.where(balance_expr > 0)

    # 전체 건수 (DB 레벨)
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # 페이징 (DB 레벨)
    offset = (page - 1) * page_size
    query = query.order_by(Counterparty.name).offset(offset).limit(page_size)
    result = await db.execute(query)
    rows = result.all()

    items = [
        ReceivableItem(
            counterparty_id=row.counterparty_id,
            counterparty_name=row.counterparty_name,
            total_amount=row.total_amount,
            total_received=row.total_received,
            balance=row.balance,
            voucher_count=row.voucher_count,
        )
        for row in rows
    ]

    return {
        "receivables": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/payables", response_model=dict)
async def list_payables(
    search: Optional[str] = Query(None),
    include_zero_balance: bool = Query(False, description="잔액 0인 거래처도 포함"),
    date_from: Optional[date] = Query(None, description="전표 거래일 시작"),
    date_to: Optional[date] = Query(None, description="전표 거래일 종료"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """미지급 현황 (거래처별) - 전표 거래일 기준 필터 + 입출금 트랜잭션 직접 합산"""
    _active_txn_filter = CounterpartyTransaction.status.notin_([
        TransactionStatus.CANCELLED, TransactionStatus.HIDDEN,
    ])

    # 전표 날짜 필터 조건
    voucher_date_filters = [Voucher.voucher_type == VoucherType.PURCHASE]
    if date_from:
        voucher_date_filters.append(Voucher.trade_date >= date_from)
    if date_to:
        voucher_date_filters.append(Voucher.trade_date <= date_to)

    # 기간 내 전표 ID 목록
    voucher_id_filter = select(Voucher.id).where(*voucher_date_filters)

    # 거래처별 매입전표 합계 서브쿼리
    voucher_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Voucher.total_amount), 0).label("total_amount"),
            func.count(Voucher.id).label("voucher_count"),
        )
        .where(*voucher_date_filters)
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 누적 지급 서브쿼리 (레거시) — 기간 내 전표에 연결된 지급만
    payment_sub = (
        select(
            Voucher.counterparty_id,
            func.coalesce(func.sum(Payment.amount), 0).label("paid"),
        )
        .join(Voucher, Payment.voucher_id == Voucher.id)
        .where(Payment.voucher_id.in_(voucher_id_filter))
        .group_by(Voucher.counterparty_id)
    ).subquery()

    # 거래처별 WITHDRAWAL 트랜잭션 직접 합산 (배분 여부 무관, 기간 필터 적용)
    withdrawal_txn_filters = [
        CounterpartyTransaction.transaction_type == TransactionType.WITHDRAWAL,
        _active_txn_filter,
    ]
    if date_from:
        withdrawal_txn_filters.append(CounterpartyTransaction.transaction_date >= date_from)
    if date_to:
        withdrawal_txn_filters.append(CounterpartyTransaction.transaction_date <= date_to)

    withdrawal_txn_sub = (
        select(
            CounterpartyTransaction.counterparty_id,
            func.coalesce(func.sum(CounterpartyTransaction.amount), 0).label("txn_paid"),
        )
        .where(*withdrawal_txn_filters)
        .group_by(CounterpartyTransaction.counterparty_id)
    ).subquery()

    # balance를 SQL에서 계산
    total_paid_expr = (
        func.coalesce(payment_sub.c.paid, 0) +
        func.coalesce(withdrawal_txn_sub.c.txn_paid, 0)
    )
    balance_expr = func.coalesce(voucher_sub.c.total_amount, 0) - total_paid_expr

    query = (
        select(
            Counterparty.id.label("counterparty_id"),
            Counterparty.name.label("counterparty_name"),
            func.coalesce(voucher_sub.c.total_amount, 0).label("total_amount"),
            func.coalesce(voucher_sub.c.voucher_count, 0).label("voucher_count"),
            total_paid_expr.label("total_paid"),
            balance_expr.label("balance"),
        )
        .outerjoin(voucher_sub, Counterparty.id == voucher_sub.c.counterparty_id)
        .outerjoin(payment_sub, Counterparty.id == payment_sub.c.counterparty_id)
        .outerjoin(withdrawal_txn_sub, Counterparty.id == withdrawal_txn_sub.c.counterparty_id)
        .where(
            (voucher_sub.c.counterparty_id.isnot(None)) |
            (withdrawal_txn_sub.c.counterparty_id.isnot(None))
        )
    )

    if search:
        query = query.where(Counterparty.name.ilike(f"%{search}%"))

    if not include_zero_balance:
        query = query.where(balance_expr > 0)

    # 전체 건수 (DB 레벨)
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # 페이징 (DB 레벨)
    offset = (page - 1) * page_size
    query = query.order_by(Counterparty.name).offset(offset).limit(page_size)
    result = await db.execute(query)
    rows = result.all()

    items = [
        PayableItem(
            counterparty_id=row.counterparty_id,
            counterparty_name=row.counterparty_name,
            total_amount=row.total_amount,
            total_paid=row.total_paid,
            balance=row.balance,
            voucher_count=row.voucher_count,
        )
        for row in rows
    ]

    return {
        "payables": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
