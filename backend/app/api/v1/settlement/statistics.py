"""
정산 도메인 - 통계 API
시계열 추이, 상태 분포, 거래처/지사 분석, 수익률 분석
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case, and_, extract, cast, String, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.voucher import Voucher
from app.models.counterparty import Counterparty
from app.models.branch import Branch
from app.models.receipt import Receipt
from app.models.payment import Payment
from app.models.transaction_allocation import TransactionAllocation
from app.models.counterparty_transaction import CounterpartyTransaction
from app.models.netting_record import NettingRecord
from app.models.enums import (
    VoucherType, SettlementStatus, PaymentStatus,
    TransactionType, TransactionSource, TransactionStatus, NettingStatus,
)

router = APIRouter()

# 통계 집계에서 제외할 상태 (취소/숨김은 통계에 포함하지 않음)
_ACTIVE_TXN_STATUSES = [
    TransactionStatus.PENDING,
    TransactionStatus.PARTIAL,
    TransactionStatus.ALLOCATED,
    TransactionStatus.ON_HOLD,
]


def _month_start(months: int) -> date:
    """months개월 전 1일"""
    today = date.today()
    m = today.month - months
    y = today.year + (m - 1) // 12
    m = (m - 1) % 12 + 1
    return date(y, m, 1)


def _month_label():
    """YYYY-MM 문자열 표현식"""
    return func.to_char(Voucher.trade_date, 'YYYY-MM')


# ─── 1. 월별 미수·미지급 추이 ──────────────────────────────────────

@router.get("/monthly-balance")
async def monthly_balance(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """월별 판매/매입 전표 발행액 및 수금/지급액 추이"""
    start = _month_start(months)

    # 쿼리1: 전표 월별 voucher_type별 합계 (2개 → 1개)
    month_expr = func.to_char(Voucher.trade_date, 'YYYY-MM')
    voucher_q = await db.execute(
        select(
            month_expr.label('month'),
            Voucher.voucher_type,
            func.coalesce(func.sum(Voucher.total_amount), 0),
        )
        .where(Voucher.trade_date >= start)
        .group_by(month_expr, Voucher.voucher_type)
        .order_by(month_expr)
    )
    sales_map: dict[str, float] = {}
    purchase_map: dict[str, float] = {}
    for row in voucher_q.all():
        if row[1] == VoucherType.SALES:
            sales_map[row[0]] = float(row[2])
        else:
            purchase_map[row[0]] = float(row[2])

    # 쿼리2~3: 레거시 입금/송금 월별
    receipt_month = func.to_char(Receipt.receipt_date, 'YYYY-MM')
    receipt_q = await db.execute(
        select(receipt_month.label('month'), func.coalesce(func.sum(Receipt.amount), 0))
        .where(Receipt.receipt_date >= start)
        .group_by(receipt_month)
    )
    receipt_map: dict[str, float] = {r[0]: float(r[1]) for r in receipt_q.all()}

    payment_month = func.to_char(Payment.payment_date, 'YYYY-MM')
    payment_q2 = await db.execute(
        select(payment_month.label('month'), func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.payment_date >= start)
        .group_by(payment_month)
    )
    payment_map2: dict[str, float] = {r[0]: float(r[1]) for r in payment_q2.all()}

    # 쿼리4: 배분 입금/출금 월별 (type별 한 번에)
    alloc_month = func.to_char(CounterpartyTransaction.transaction_date, 'YYYY-MM')
    alloc_q = await db.execute(
        select(
            alloc_month.label('month'),
            CounterpartyTransaction.transaction_type,
            func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0),
        )
        .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
        .where(CounterpartyTransaction.transaction_date >= start)
        .group_by(alloc_month, CounterpartyTransaction.transaction_type)
    )
    for row in alloc_q.all():
        m, ttype, total = row[0], row[1], float(row[2])
        if ttype == TransactionType.DEPOSIT:
            receipt_map[m] = receipt_map.get(m, 0) + total
        else:
            payment_map2[m] = payment_map2.get(m, 0) + total

    all_months = sorted(set(list(sales_map) + list(purchase_map) + list(receipt_map) + list(payment_map2)))
    result = []
    for m in all_months:
        s = sales_map.get(m, 0)
        p = purchase_map.get(m, 0)
        rcpt = receipt_map.get(m, 0)
        pymt = payment_map2.get(m, 0)
        result.append({
            "month": m, "sales_total": s, "purchase_total": p,
            "receipts": rcpt, "payments": pymt,
            "sales_balance": s - rcpt, "purchase_balance": p - pymt,
        })

    return {"data": result}


# ─── 2. 월별 입출금 흐름 ──────────────────────────────────────────

@router.get("/transaction-flow")
async def transaction_flow(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = _month_start(months)
    month_expr = func.to_char(CounterpartyTransaction.transaction_date, 'YYYY-MM')

    q = await db.execute(
        select(
            month_expr.label('month'),
            CounterpartyTransaction.transaction_type,
            func.coalesce(func.sum(CounterpartyTransaction.amount), 0),
            func.count(),
        )
        .where(
            CounterpartyTransaction.transaction_date >= start,
            CounterpartyTransaction.status.in_(_ACTIVE_TXN_STATUSES),
        )
        .group_by(month_expr, CounterpartyTransaction.transaction_type)
        .order_by(month_expr)
    )

    month_data: dict = {}
    for row in q.all():
        m = row[0]
        if m not in month_data:
            month_data[m] = {"month": m, "deposit_total": 0, "deposit_count": 0, "withdrawal_total": 0, "withdrawal_count": 0}
        if row[1] == TransactionType.DEPOSIT:
            month_data[m]["deposit_total"] = float(row[2])
            month_data[m]["deposit_count"] = row[3]
        else:
            month_data[m]["withdrawal_total"] = float(row[2])
            month_data[m]["withdrawal_count"] = row[3]

    return {"data": sorted(month_data.values(), key=lambda x: x["month"])}


# ─── 3. 전표 상태 분포 ────────────────────────────────────────────

@router.get("/voucher-status")
async def voucher_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 정산 상태
    settlement_q = await db.execute(
        select(Voucher.settlement_status, func.count(), func.coalesce(func.sum(Voucher.total_amount), 0))
        .group_by(Voucher.settlement_status)
    )
    settlement = [{"status": r[0].value, "count": r[1], "amount": float(r[2])} for r in settlement_q.all()]

    # 지급 상태
    payment_q = await db.execute(
        select(Voucher.payment_status, func.count(), func.coalesce(func.sum(Voucher.total_amount), 0))
        .group_by(Voucher.payment_status)
    )
    payment = [{"status": r[0].value, "count": r[1], "amount": float(r[2])} for r in payment_q.all()]

    return {"settlement": settlement, "payment": payment}


# ─── 4. 상계 월별 ─────────────────────────────────────────────────

@router.get("/netting-monthly")
async def netting_monthly(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = _month_start(months)
    month_expr = func.to_char(NettingRecord.netting_date, 'YYYY-MM')

    q = await db.execute(
        select(month_expr.label('month'), func.count(), func.coalesce(func.sum(NettingRecord.netting_amount), 0))
        .where(and_(NettingRecord.status == NettingStatus.CONFIRMED, NettingRecord.netting_date >= start))
        .group_by(month_expr).order_by(month_expr)
    )
    return {"data": [{"month": r[0], "count": r[1], "amount": float(r[2])} for r in q.all()]}


# ─── 5. 조정전표 유형별 ───────────────────────────────────────────

@router.get("/adjustment-summary")
async def adjustment_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = await db.execute(
        select(
            cast(Voucher.adjustment_type, String),
            func.count(),
            func.coalesce(func.sum(Voucher.total_amount), 0),
        )
        .where(Voucher.is_adjustment == True)
        .group_by(Voucher.adjustment_type)
    )
    return {"data": [{"type": r[0], "count": r[1], "amount": float(r[2])} for r in q.all()]}


# ─── 6. 지사별 매출·매입 ──────────────────────────────────────────

@router.get("/by-branch")
async def by_branch(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = await db.execute(
        select(
            func.coalesce(Branch.name, '미지정').label('branch_name'),
            Voucher.voucher_type,
            func.coalesce(func.sum(Voucher.total_amount), 0),
            func.count(),
        )
        .join(Counterparty, Voucher.counterparty_id == Counterparty.id)
        .outerjoin(Branch, Counterparty.branch_id == Branch.id)
        .group_by(Branch.name, Voucher.voucher_type)
        .order_by(Branch.name)
    )

    branch_data: dict = {}
    for row in q.all():
        name = row[0]
        if name not in branch_data:
            branch_data[name] = {"branch_name": name, "sales_amount": 0, "sales_count": 0, "purchase_amount": 0, "purchase_count": 0}
        if row[1] == VoucherType.SALES:
            branch_data[name]["sales_amount"] = float(row[2])
            branch_data[name]["sales_count"] = row[3]
        else:
            branch_data[name]["purchase_amount"] = float(row[2])
            branch_data[name]["purchase_count"] = row[3]

    return {"data": sorted(branch_data.values(), key=lambda x: x["sales_amount"] + x["purchase_amount"], reverse=True)}


# ─── 7. 거래처 Top N 미수/미지급 ──────────────────────────────────

@router.get("/top-balance")
async def top_balance(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거래처별 미수/미지급 잔액 Top N (양방향 바 차트용)"""
    # 쿼리1: 거래처별 voucher_type별 전표 합계 (2쿼리 → 1쿼리)
    voucher_q = await db.execute(
        select(
            Voucher.counterparty_id,
            Voucher.voucher_type,
            func.coalesce(func.sum(Voucher.total_amount), 0),
        )
        .group_by(Voucher.counterparty_id, Voucher.voucher_type)
    )
    sales_map: dict = {}
    purchase_map: dict = {}
    for r in voucher_q.all():
        if r[1] == VoucherType.SALES:
            sales_map[r[0]] = float(r[2])
        else:
            purchase_map[r[0]] = float(r[2])

    # 쿼리2: 정산액 집계 → 거래처별 미수/미지급 산출
    _active_txn_filter = CounterpartyTransaction.status.notin_([
        TransactionStatus.CANCELLED, TransactionStatus.HIDDEN,
    ])
    cp_receipts: dict = {}
    cp_payments: dict = {}

    # Receipt (레거시) by voucher → counterparty
    receipt_q = await db.execute(
        select(Voucher.counterparty_id, Voucher.voucher_type, func.coalesce(func.sum(Receipt.amount), 0))
        .join(Receipt, Receipt.voucher_id == Voucher.id)
        .group_by(Voucher.counterparty_id, Voucher.voucher_type)
    )
    for r in receipt_q.all():
        if r[1] == VoucherType.SALES:
            cp_receipts[r[0]] = cp_receipts.get(r[0], 0) + float(r[2])
        else:
            cp_payments[r[0]] = cp_payments.get(r[0], 0) + float(r[2])

    # Payment (레거시) by voucher → counterparty
    payment_q = await db.execute(
        select(Voucher.counterparty_id, Voucher.voucher_type, func.coalesce(func.sum(Payment.amount), 0))
        .join(Payment, Payment.voucher_id == Voucher.id)
        .group_by(Voucher.counterparty_id, Voucher.voucher_type)
    )
    for r in payment_q.all():
        if r[1] == VoucherType.SALES:
            cp_receipts[r[0]] = cp_receipts.get(r[0], 0) + float(r[2])
        else:
            cp_payments[r[0]] = cp_payments.get(r[0], 0) + float(r[2])

    # CounterpartyTransaction 직접 합산 (배분 여부 무관)
    txn_q = await db.execute(
        select(
            CounterpartyTransaction.counterparty_id,
            CounterpartyTransaction.transaction_type,
            func.coalesce(func.sum(CounterpartyTransaction.amount), 0),
        )
        .where(_active_txn_filter)
        .group_by(CounterpartyTransaction.counterparty_id, CounterpartyTransaction.transaction_type)
    )
    for r in txn_q.all():
        if r[1] == TransactionType.DEPOSIT:
            cp_receipts[r[0]] = cp_receipts.get(r[0], 0) + float(r[2])
        else:
            cp_payments[r[0]] = cp_payments.get(r[0], 0) + float(r[2])

    # 쿼리3: 거래처명
    all_cp_ids = set(list(sales_map) + list(purchase_map) + list(cp_receipts) + list(cp_payments))
    cp_names = {}
    if all_cp_ids:
        cp_q = await db.execute(
            select(Counterparty.id, Counterparty.name).where(Counterparty.id.in_(all_cp_ids))
        )
        cp_names = {r[0]: r[1] for r in cp_q.all()}

    items = []
    for cpid in all_cp_ids:
        receivable = sales_map.get(cpid, 0) - cp_receipts.get(cpid, 0)
        payable = purchase_map.get(cpid, 0) - cp_payments.get(cpid, 0)
        if abs(receivable) < 1 and abs(payable) < 1:
            continue
        items.append({
            "counterparty_name": cp_names.get(cpid, "Unknown"),
            "receivable": receivable,
            "payable": payable,
            "total": receivable + payable,
        })

    items.sort(key=lambda x: abs(x["receivable"]) + abs(x["payable"]), reverse=True)
    return {"data": items[:limit]}


# ─── 8. 거래처 유형별 분포 ─────────────────────────────────────────

@router.get("/counterparty-type")
async def counterparty_type_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = await db.execute(
        select(
            Counterparty.counterparty_type,
            func.count(func.distinct(Counterparty.id)),
            func.coalesce(func.sum(Voucher.total_amount), 0),
        )
        .outerjoin(Voucher, Voucher.counterparty_id == Counterparty.id)
        .where(Counterparty.is_active == True)
        .group_by(Counterparty.counterparty_type)
    )
    return {"data": [{"type": r[0].value if r[0] else "unknown", "count": r[1], "total_amount": float(r[2])} for r in q.all()]}


# ─── 9. 거래처별 정산 진행률 ───────────────────────────────────────

@router.get("/counterparty-progress")
async def counterparty_progress(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거래처별 총액/수금액/잔액/진행률"""
    q = await db.execute(
        select(
            Counterparty.id,
            Counterparty.name,
            func.coalesce(func.sum(Voucher.total_amount), 0),
            func.count(Voucher.id),
        )
        .join(Voucher, Voucher.counterparty_id == Counterparty.id)
        .where(Counterparty.is_active == True)
        .group_by(Counterparty.id, Counterparty.name)
        .order_by(func.sum(Voucher.total_amount).desc())
        .limit(limit)
    )
    rows = q.all()
    if not rows:
        return {"data": []}

    cp_ids = [r[0] for r in rows]

    # 레거시 입금 합계 (거래처별)
    receipt_q = await db.execute(
        select(Voucher.counterparty_id, func.coalesce(func.sum(Receipt.amount), 0))
        .join(Receipt, Receipt.voucher_id == Voucher.id)
        .where(Voucher.counterparty_id.in_(cp_ids))
        .group_by(Voucher.counterparty_id)
    )
    receipt_map = {r[0]: float(r[1]) for r in receipt_q.all()}

    # 레거시 송금 합계
    payment_q = await db.execute(
        select(Voucher.counterparty_id, func.coalesce(func.sum(Payment.amount), 0))
        .join(Payment, Payment.voucher_id == Voucher.id)
        .where(Voucher.counterparty_id.in_(cp_ids))
        .group_by(Voucher.counterparty_id)
    )
    payment_map = {r[0]: float(r[1]) for r in payment_q.all()}

    # 배분 합계
    alloc_q = await db.execute(
        select(Voucher.counterparty_id, func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
        .join(TransactionAllocation, TransactionAllocation.voucher_id == Voucher.id)
        .where(Voucher.counterparty_id.in_(cp_ids))
        .group_by(Voucher.counterparty_id)
    )
    alloc_map = {r[0]: float(r[1]) for r in alloc_q.all()}

    settled_map: dict = {}
    for cpid in cp_ids:
        settled_map[cpid] = receipt_map.get(cpid, 0) + payment_map.get(cpid, 0) + alloc_map.get(cpid, 0)

    result = []
    for r in rows:
        total = float(r[2])
        settled = settled_map.get(r[0], 0)
        balance = total - settled
        progress = (settled / total * 100) if total > 0 else 0
        result.append({
            "counterparty_id": str(r[0]),
            "counterparty_name": r[1],
            "total_amount": total,
            "settled_amount": settled,
            "balance": balance,
            "progress": round(progress, 1),
            "voucher_count": r[3],
        })

    return {"data": result}


# ─── 10. 수익률 요약 KPI ──────────────────────────────────────────

@router.get("/profit-summary")
async def profit_summary(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = _month_start(months)
    q = await db.execute(
        select(
            func.coalesce(func.sum(Voucher.total_amount), 0),
            func.coalesce(func.sum(Voucher.profit), 0),
            func.avg(Voucher.profit_rate),
            func.avg(Voucher.avg_margin),
            func.count(),
        )
        .where(and_(Voucher.voucher_type == VoucherType.SALES, Voucher.trade_date >= start))
    )
    r = q.one()
    return {
        "total_sales": float(r[0]),
        "total_profit": float(r[1]),
        "avg_profit_rate": float(r[2]) if r[2] else 0,
        "avg_margin": float(r[3]) if r[3] else 0,
        "voucher_count": r[4],
    }


# ─── 11. 수익률 월별 추이 ─────────────────────────────────────────

@router.get("/profit-monthly")
async def profit_monthly(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = _month_start(months)
    month_expr = func.to_char(Voucher.trade_date, 'YYYY-MM')

    q = await db.execute(
        select(
            month_expr.label('month'),
            func.coalesce(func.sum(Voucher.total_amount), 0),
            func.coalesce(func.sum(Voucher.profit), 0),
            func.avg(Voucher.profit_rate),
            func.count(),
        )
        .where(and_(Voucher.voucher_type == VoucherType.SALES, Voucher.trade_date >= start))
        .group_by(month_expr).order_by(month_expr)
    )
    return {"data": [{
        "month": r[0],
        "sales_amount": float(r[1]),
        "profit": float(r[2]),
        "profit_rate": float(r[3]) if r[3] else 0,
        "count": r[4],
    } for r in q.all()]}


# ─── 12. 거래처별 수익률 ──────────────────────────────────────────

@router.get("/profit-by-counterparty")
async def profit_by_counterparty(
    limit: int = Query(15, ge=1, le=50),
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = _month_start(months)
    q = await db.execute(
        select(
            Counterparty.name,
            func.coalesce(func.sum(Voucher.total_amount), 0),
            func.coalesce(func.sum(Voucher.profit), 0),
            func.avg(Voucher.profit_rate),
            func.count(),
        )
        .join(Counterparty, Voucher.counterparty_id == Counterparty.id)
        .where(and_(Voucher.voucher_type == VoucherType.SALES, Voucher.trade_date >= start))
        .group_by(Counterparty.name)
        .order_by(func.sum(Voucher.total_amount).desc())
        .limit(limit)
    )
    return {"data": [{
        "counterparty_name": r[0],
        "sales_amount": float(r[1]),
        "profit": float(r[2]),
        "profit_rate": float(r[3]) if r[3] else 0,
        "count": r[4],
    } for r in q.all()]}


# ─── 13. 수익률 분포 (히스토그램) ──────────────────────────────────

@router.get("/profit-distribution")
async def profit_distribution(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = _month_start(months)
    pr = Voucher.profit_rate

    # 단일 쿼리로 8개 구간 COUNT 통합
    q = await db.execute(
        select(
            func.count().filter(pr < -10).label('r1'),
            func.count().filter(and_(pr >= -10, pr < 0)).label('r2'),
            func.count().filter(and_(pr >= 0, pr < 5)).label('r3'),
            func.count().filter(and_(pr >= 5, pr < 10)).label('r4'),
            func.count().filter(and_(pr >= 10, pr < 15)).label('r5'),
            func.count().filter(and_(pr >= 15, pr < 20)).label('r6'),
            func.count().filter(and_(pr >= 20, pr < 30)).label('r7'),
            func.count().filter(pr >= 30).label('r8'),
        )
        .where(and_(
            Voucher.voucher_type == VoucherType.SALES,
            Voucher.trade_date >= start,
            pr.isnot(None),
        ))
    )
    r = q.one()
    labels = ["<-10%", "-10~0%", "0~5%", "5~10%", "10~15%", "15~20%", "20~30%", "30%+"]
    return {"data": [{"range": labels[i], "count": r[i]} for i in range(8)]}


# ─── 14. 미정산 전표 에이징 분석 ──────────────────────────────────

@router.get("/settlement-aging")
async def settlement_aging(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """미정산 전표 경과일 분석 (0-30/31-60/61-90/90+일)"""
    days_expr = func.current_date() - Voucher.trade_date

    bucket_expr = case(
        (days_expr <= 30, '0-30'),
        (days_expr <= 60, '31-60'),
        (days_expr <= 90, '61-90'),
        else_='90+',
    )

    q = await db.execute(
        select(
            Voucher.voucher_type,
            bucket_expr.label('bucket'),
            func.count(),
            func.coalesce(func.sum(Voucher.total_amount), 0),
        )
        .where(Voucher.settlement_status.in_([SettlementStatus.OPEN, SettlementStatus.SETTLING]))
        .group_by(Voucher.voucher_type, bucket_expr)
    )

    buckets: dict = {}
    for r in q.all():
        b = r[1]
        if b not in buckets:
            buckets[b] = {"bucket": b, "sales_count": 0, "sales_amount": 0, "purchase_count": 0, "purchase_amount": 0}
        if r[0] == VoucherType.SALES:
            buckets[b]["sales_count"] = r[2]
            buckets[b]["sales_amount"] = float(r[3])
        else:
            buckets[b]["purchase_count"] = r[2]
            buckets[b]["purchase_amount"] = float(r[3])

    order = ['0-30', '31-60', '61-90', '90+']
    return {"data": [buckets.get(b, {"bucket": b, "sales_count": 0, "sales_amount": 0, "purchase_count": 0, "purchase_amount": 0}) for b in order]}


# ─── 15. 입출금 소스별 분포 ───────────────────────────────────────

@router.get("/transaction-source")
async def transaction_source(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """입출금 소스별 분포 (MANUAL/BANK_IMPORT/NETTING)"""
    q = await db.execute(
        select(
            CounterpartyTransaction.source,
            func.count(),
            func.coalesce(func.sum(CounterpartyTransaction.amount), 0),
        )
        .where(CounterpartyTransaction.status.in_(_ACTIVE_TXN_STATUSES))
        .group_by(CounterpartyTransaction.source)
    )
    return {"data": [{"source": r[0].value, "count": r[1], "amount": float(r[2])} for r in q.all()]}


# ─── 16. 월별 정산 완료율 추이 ────────────────────────────────────

@router.get("/completion-rate")
async def completion_rate(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """월별 정산 완료율 추이"""
    start = _month_start(months)
    month_expr = func.to_char(Voucher.trade_date, 'YYYY-MM')

    q = await db.execute(
        select(
            month_expr.label('month'),
            func.count().label('total_count'),
            func.count().filter(
                Voucher.settlement_status.in_([SettlementStatus.SETTLED, SettlementStatus.LOCKED])
            ).label('settled_count'),
            func.coalesce(func.sum(Voucher.total_amount), 0).label('total_amount'),
            func.coalesce(func.sum(Voucher.total_amount).filter(
                Voucher.settlement_status.in_([SettlementStatus.SETTLED, SettlementStatus.LOCKED])
            ), 0).label('settled_amount'),
        )
        .where(Voucher.trade_date >= start)
        .group_by(month_expr).order_by(month_expr)
    )
    return {"data": [{
        "month": r[0],
        "total_count": r[1],
        "settled_count": r[2],
        "completion_rate": round(r[2] / r[1] * 100, 1) if r[1] > 0 else 0,
        "total_amount": float(r[3]),
        "settled_amount": float(r[4]),
    } for r in q.all()]}


# ─── 17. 거래처별 평균 입금 지연일 ────────────────────────────────

@router.get("/cash-lag")
async def cash_lag(
    limit: int = Query(15, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거래처별 평균 입금 지연일 (transaction_date - voucher.trade_date)"""
    lag_expr = CounterpartyTransaction.transaction_date - Voucher.trade_date

    q = await db.execute(
        select(
            Counterparty.name.label('counterparty_name'),
            func.avg(lag_expr).label('avg_days'),
            func.count(TransactionAllocation.id).label('allocation_count'),
        )
        .join(TransactionAllocation, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
        .join(Voucher, TransactionAllocation.voucher_id == Voucher.id)
        .join(Counterparty, CounterpartyTransaction.counterparty_id == Counterparty.id)
        .group_by(Counterparty.name)
        .having(func.count(TransactionAllocation.id) >= 2)
        .order_by(func.avg(lag_expr).desc())
        .limit(limit)
    )
    return {"data": [{
        "counterparty_name": r[0],
        "avg_days": round(r[1].days if hasattr(r[1], 'days') else float(r[1]), 1) if r[1] else 0,
        "allocation_count": r[2],
    } for r in q.all()]}
