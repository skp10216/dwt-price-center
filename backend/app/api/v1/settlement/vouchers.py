"""
정산 도메인 - 전표 CRUD + SSOT 관리
UPSERT 기반: (counterparty_id, trade_date, voucher_number)
"""

from typing import Optional
from uuid import UUID
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.voucher import Voucher
from app.models.counterparty import Counterparty
from app.models.receipt import Receipt
from app.models.payment import Payment
from app.models.enums import (
    VoucherType, SettlementStatus, PaymentStatus,
    AuditAction,
)
from app.models.audit_log import AuditLog
from app.schemas.settlement import (
    VoucherCreate, VoucherUpdate, VoucherResponse,
    VoucherDetailResponse, VoucherListResponse,
    ReceiptResponse, PaymentResponse,
)

router = APIRouter()


def _compute_total_amount(voucher: Voucher) -> Decimal:
    """전표 타입에 따라 total_amount 계산"""
    if voucher.voucher_type == VoucherType.SALES:
        return voucher.actual_sale_price or voucher.sale_amount or Decimal("0")
    else:
        return voucher.actual_purchase_price or voucher.purchase_cost or Decimal("0")


async def _enrich_voucher(v: Voucher, db: AsyncSession) -> VoucherResponse:
    """전표에 거래처명, 누적 입금/송금 정보 추가"""
    # 거래처명
    cp_name = None
    if v.counterparty:
        cp_name = v.counterparty.name
    else:
        cp_result = await db.execute(
            select(Counterparty.name).where(Counterparty.id == v.counterparty_id)
        )
        cp_name = cp_result.scalar_one_or_none()

    # 누적 입금
    total_receipts = (await db.execute(
        select(func.coalesce(func.sum(Receipt.amount), 0)).where(Receipt.voucher_id == v.id)
    )).scalar() or Decimal("0")

    # 누적 송금
    total_payments = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.voucher_id == v.id)
    )).scalar() or Decimal("0")

    balance = v.total_amount - (total_receipts + total_payments)

    return VoucherResponse(
        id=v.id,
        trade_date=v.trade_date,
        counterparty_id=v.counterparty_id,
        counterparty_name=cp_name,
        voucher_number=v.voucher_number,
        voucher_type=v.voucher_type.value if hasattr(v.voucher_type, 'value') else v.voucher_type,
        quantity=v.quantity,
        total_amount=v.total_amount,
        purchase_cost=v.purchase_cost,
        deduction_amount=v.deduction_amount,
        actual_purchase_price=v.actual_purchase_price,
        avg_unit_price=v.avg_unit_price,
        purchase_deduction=v.purchase_deduction,
        as_cost=v.as_cost,
        sale_amount=v.sale_amount,
        sale_deduction=v.sale_deduction,
        actual_sale_price=v.actual_sale_price,
        profit=v.profit,
        profit_rate=v.profit_rate,
        avg_margin=v.avg_margin,
        upm_settlement_status=v.upm_settlement_status,
        payment_info=v.payment_info,
        settlement_status=v.settlement_status.value if hasattr(v.settlement_status, 'value') else v.settlement_status,
        payment_status=v.payment_status.value if hasattr(v.payment_status, 'value') else v.payment_status,
        memo=v.memo,
        total_receipts=total_receipts,
        total_payments=total_payments,
        balance=balance,
        created_at=v.created_at,
        updated_at=v.updated_at,
    )


@router.get("", response_model=VoucherListResponse)
async def list_vouchers(
    voucher_type: Optional[str] = Query(None, description="sales/purchase"),
    counterparty_id: Optional[UUID] = Query(None),
    settlement_status: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="전표번호/거래처명 검색"),
    date_from: Optional[str] = Query(None, description="조회 시작일 (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="조회 종료일 (YYYY-MM-DD)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표 목록 조회 (필터/검색/페이징)"""
    query = select(Voucher).join(Counterparty, Voucher.counterparty_id == Counterparty.id)

    if voucher_type:
        query = query.where(Voucher.voucher_type == voucher_type)
    if counterparty_id:
        query = query.where(Voucher.counterparty_id == counterparty_id)
    if settlement_status:
        query = query.where(Voucher.settlement_status == settlement_status)
    if payment_status:
        query = query.where(Voucher.payment_status == payment_status)
    if search:
        query = query.where(
            or_(
                Voucher.voucher_number.ilike(f"%{search}%"),
                Counterparty.name.ilike(f"%{search}%"),
            )
        )
    if date_from:
        query = query.where(Voucher.trade_date >= date_from)
    if date_to:
        query = query.where(Voucher.trade_date <= date_to)

    # 카운트
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # 페이징
    query = query.order_by(Voucher.trade_date.desc(), Voucher.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    vouchers = result.scalars().all()

    enriched = []
    for v in vouchers:
        enriched.append(await _enrich_voucher(v, db))

    return VoucherListResponse(
        vouchers=enriched,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=VoucherResponse, status_code=201)
async def create_voucher(
    data: VoucherCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표 생성 (수동)"""
    # 거래처 확인
    cp = await db.get(Counterparty, data.counterparty_id)
    if not cp:
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

    # Unique 키 중복 확인
    existing = await db.execute(
        select(Voucher).where(
            Voucher.counterparty_id == data.counterparty_id,
            Voucher.trade_date == data.trade_date,
            Voucher.voucher_number == data.voucher_number,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="동일 전표가 이미 존재합니다")

    v = Voucher(
        trade_date=data.trade_date,
        counterparty_id=data.counterparty_id,
        voucher_number=data.voucher_number,
        voucher_type=data.voucher_type,
        quantity=data.quantity,
        purchase_cost=data.purchase_cost,
        deduction_amount=data.deduction_amount,
        actual_purchase_price=data.actual_purchase_price,
        avg_unit_price=data.avg_unit_price,
        purchase_deduction=data.purchase_deduction,
        as_cost=data.as_cost,
        sale_amount=data.sale_amount,
        sale_deduction=data.sale_deduction,
        actual_sale_price=data.actual_sale_price,
        profit=data.profit,
        profit_rate=data.profit_rate,
        avg_margin=data.avg_margin,
        upm_settlement_status=data.upm_settlement_status,
        payment_info=data.payment_info,
        memo=data.memo,
        created_by=current_user.id,
    )
    v.total_amount = _compute_total_amount(v)
    db.add(v)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.VOUCHER_CREATE,
        target_type="voucher",
        target_id=v.id,
        after_data={
            "voucher_number": v.voucher_number,
            "type": data.voucher_type,
            "total_amount": str(v.total_amount),
        },
    ))

    await db.flush()
    return await _enrich_voucher(v, db)


@router.get("/{voucher_id}", response_model=VoucherDetailResponse)
async def get_voucher(
    voucher_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표 상세 (입금/송금 이력 포함)"""
    result = await db.execute(
        select(Voucher)
        .options(selectinload(Voucher.receipts), selectinload(Voucher.payments))
        .where(Voucher.id == voucher_id)
    )
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")

    base = await _enrich_voucher(v, db)
    return VoucherDetailResponse(
        **base.model_dump(),
        receipts=[ReceiptResponse.model_validate(r) for r in v.receipts],
        payments=[PaymentResponse.model_validate(p) for p in v.payments],
    )


@router.patch("/{voucher_id}", response_model=VoucherResponse)
async def update_voucher(
    voucher_id: UUID,
    data: VoucherUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표 수정 (마감된 전표 수정 불가)"""
    v = await db.get(Voucher, voucher_id)
    if not v:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")

    # 마감 체크
    if v.settlement_status == SettlementStatus.LOCKED or v.payment_status == PaymentStatus.LOCKED:
        raise HTTPException(status_code=400, detail="마감된 전표는 수정할 수 없습니다")

    before = {"total_amount": str(v.total_amount), "quantity": v.quantity}
    update_data = data.model_dump(exclude_unset=True)
    for k, val in update_data.items():
        setattr(v, k, val)

    v.total_amount = _compute_total_amount(v)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.VOUCHER_UPDATE,
        target_type="voucher",
        target_id=v.id,
        before_data=before,
        after_data=update_data,
    ))

    await db.flush()
    return await _enrich_voucher(v, db)
