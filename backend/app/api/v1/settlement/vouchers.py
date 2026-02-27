"""
정산 도메인 - 전표 CRUD + SSOT 관리
UPSERT 기반: (counterparty_id, trade_date, voucher_number)
"""

from typing import Optional, List
from uuid import UUID
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
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
    AuditAction, AdjustmentType, TransactionType,
)
from app.models.audit_log import AuditLog
from app.models.transaction_allocation import TransactionAllocation
from app.models.counterparty_transaction import CounterpartyTransaction
from app.models.netting_record import NettingVoucherLink
from app.schemas.settlement import (
    VoucherCreate, VoucherUpdate, VoucherResponse,
    VoucherDetailResponse, VoucherListResponse,
    ReceiptResponse, PaymentResponse,
    AdjustmentVoucherCreate,
)

router = APIRouter()


def _compute_total_amount(voucher: Voucher) -> Decimal:
    """전표 타입에 따라 total_amount 계산"""
    if voucher.voucher_type == VoucherType.SALES:
        return voucher.actual_sale_price or voucher.sale_amount or Decimal("0")
    else:
        return voucher.actual_purchase_price or voucher.purchase_cost or Decimal("0")


async def _enrich_voucher(v: Voucher, db: AsyncSession) -> VoucherResponse:
    """전표에 거래처명, 누적 입금/송금 정보 추가 (단건 조회용)"""
    results = await _enrich_vouchers_batch([v], db)
    return results[0]


async def _enrich_vouchers_batch(vouchers: list[Voucher], db: AsyncSession) -> list[VoucherResponse]:
    """전표 목록에 거래처명, 누적 입금/송금 정보 일괄 추가 (N+1 → 배치 쿼리)"""
    if not vouchers:
        return []

    v_ids = [v.id for v in vouchers]
    cp_ids = list({v.counterparty_id for v in vouchers})

    # 1. 거래처명 일괄 조회 (1 쿼리)
    cp_result = await db.execute(
        select(Counterparty.id, Counterparty.name).where(Counterparty.id.in_(cp_ids))
    )
    cp_map = {row.id: row.name for row in cp_result.all()}

    # 2. 레거시 누적 입금 일괄 조회 (1 쿼리)
    receipt_result = await db.execute(
        select(Receipt.voucher_id, func.coalesce(func.sum(Receipt.amount), 0))
        .where(Receipt.voucher_id.in_(v_ids))
        .group_by(Receipt.voucher_id)
    )
    receipt_map = {row[0]: row[1] for row in receipt_result.all()}

    # 3. 레거시 누적 송금 일괄 조회 (1 쿼리)
    payment_result = await db.execute(
        select(Payment.voucher_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.voucher_id.in_(v_ids))
        .group_by(Payment.voucher_id)
    )
    payment_map = {row[0]: row[1] for row in payment_result.all()}

    # 4. 신규 배분: DEPOSIT(입금) 타입 합계 일괄 조회 (1 쿼리)
    alloc_deposit_result = await db.execute(
        select(
            TransactionAllocation.voucher_id,
            func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0),
        )
        .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
        .where(TransactionAllocation.voucher_id.in_(v_ids))
        .where(CounterpartyTransaction.transaction_type == TransactionType.DEPOSIT)
        .group_by(TransactionAllocation.voucher_id)
    )
    alloc_deposit_map = {row[0]: row[1] for row in alloc_deposit_result.all()}

    # 5. 신규 배분: WITHDRAWAL(송금) 타입 합계 일괄 조회 (1 쿼리)
    alloc_withdrawal_result = await db.execute(
        select(
            TransactionAllocation.voucher_id,
            func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0),
        )
        .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
        .where(TransactionAllocation.voucher_id.in_(v_ids))
        .where(CounterpartyTransaction.transaction_type == TransactionType.WITHDRAWAL)
        .group_by(TransactionAllocation.voucher_id)
    )
    alloc_withdrawal_map = {row[0]: row[1] for row in alloc_withdrawal_result.all()}

    # 6. 조합
    enriched = []
    for v in vouchers:
        legacy_receipts = receipt_map.get(v.id, Decimal("0"))
        legacy_payments = payment_map.get(v.id, Decimal("0"))
        alloc_deposits = alloc_deposit_map.get(v.id, Decimal("0"))
        alloc_withdrawals = alloc_withdrawal_map.get(v.id, Decimal("0"))

        total_receipts = legacy_receipts + alloc_deposits
        total_payments = legacy_payments + alloc_withdrawals
        balance = v.total_amount - (total_receipts + total_payments)

        enriched.append(VoucherResponse(
            id=v.id,
            trade_date=v.trade_date,
            counterparty_id=v.counterparty_id,
            counterparty_name=cp_map.get(v.counterparty_id),
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
        ))

    return enriched


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

    enriched = await _enrich_vouchers_batch(vouchers, db)

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


@router.delete("/{voucher_id}", status_code=200)
async def delete_voucher(
    voucher_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표 삭제 (마감된 전표 삭제 불가)"""
    v = await db.get(Voucher, voucher_id)
    if not v:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")

    # 마감 체크
    if v.settlement_status == SettlementStatus.LOCKED or v.payment_status == PaymentStatus.LOCKED:
        raise HTTPException(status_code=400, detail="마감된 전표는 삭제할 수 없습니다")

    # 연결된 입금/송금 내역 확인 (레거시)
    receipt_count = (await db.execute(
        select(func.count(Receipt.id)).where(Receipt.voucher_id == voucher_id)
    )).scalar() or 0
    payment_count = (await db.execute(
        select(func.count(Payment.id)).where(Payment.voucher_id == voucher_id)
    )).scalar() or 0

    # 신규 배분 내역 확인
    allocation_count = (await db.execute(
        select(func.count(TransactionAllocation.id))
        .where(TransactionAllocation.voucher_id == voucher_id)
    )).scalar() or 0

    # 상계 내역 확인
    netting_count = (await db.execute(
        select(func.count(NettingVoucherLink.id))
        .where(NettingVoucherLink.voucher_id == voucher_id)
    )).scalar() or 0

    linked_count = receipt_count + payment_count + allocation_count + netting_count
    if linked_count > 0:
        parts = []
        if receipt_count > 0:
            parts.append(f"입금 {receipt_count}건")
        if payment_count > 0:
            parts.append(f"송금 {payment_count}건")
        if allocation_count > 0:
            parts.append(f"배분 {allocation_count}건")
        if netting_count > 0:
            parts.append(f"상계 {netting_count}건")
        raise HTTPException(
            status_code=400,
            detail=f"연결된 {', '.join(parts)}이 있어 삭제할 수 없습니다. 먼저 관련 내역을 삭제해주세요."
        )

    # 감사로그
    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.VOUCHER_DELETE,
        target_type="voucher",
        target_id=v.id,
        before_data={
            "trade_date": str(v.trade_date),
            "voucher_number": v.voucher_number,
            "counterparty_id": str(v.counterparty_id),
            "total_amount": str(v.total_amount),
        },
    ))

    await db.delete(v)
    await db.commit()
    return {"message": "전표가 삭제되었습니다."}


@router.post("/batch-delete", status_code=200)
async def batch_delete_vouchers(
    voucher_ids: List[UUID] = Body(..., description="삭제할 전표 ID 목록"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표 일괄 삭제 (마감된 전표, 입금/송금 내역이 있는 전표 제외)"""
    deleted_count = 0
    skipped_count = 0
    errors = []

    for vid in voucher_ids:
        v = await db.get(Voucher, vid)
        if not v:
            skipped_count += 1
            errors.append(f"전표 ID {vid}를 찾을 수 없습니다.")
            continue

        # 마감 체크
        if v.settlement_status == SettlementStatus.LOCKED or v.payment_status == PaymentStatus.LOCKED:
            skipped_count += 1
            errors.append(f"전표 '{v.voucher_number}' (ID: {vid})는 마감 상태입니다.")
            continue

        # 연결된 입금/송금/배분 내역 확인
        receipt_count = (await db.execute(
            select(func.count(Receipt.id)).where(Receipt.voucher_id == vid)
        )).scalar() or 0
        payment_count = (await db.execute(
            select(func.count(Payment.id)).where(Payment.voucher_id == vid)
        )).scalar() or 0
        allocation_count = (await db.execute(
            select(func.count(TransactionAllocation.id))
            .where(TransactionAllocation.voucher_id == vid)
        )).scalar() or 0
        netting_count = (await db.execute(
            select(func.count(NettingVoucherLink.id))
            .where(NettingVoucherLink.voucher_id == vid)
        )).scalar() or 0

        linked_count = receipt_count + payment_count + allocation_count + netting_count
        if linked_count > 0:
            parts = []
            if receipt_count > 0:
                parts.append(f"입금 {receipt_count}건")
            if payment_count > 0:
                parts.append(f"송금 {payment_count}건")
            if allocation_count > 0:
                parts.append(f"배분 {allocation_count}건")
            if netting_count > 0:
                parts.append(f"상계 {netting_count}건")
            skipped_count += 1
            errors.append(f"전표 '{v.voucher_number}'에 {', '.join(parts)}이 연결되어 있습니다.")
            continue

        # 감사로그
        db.add(AuditLog(
            user_id=current_user.id,
            action=AuditAction.VOUCHER_DELETE,
            target_type="voucher",
            target_id=v.id,
            before_data={
                "trade_date": str(v.trade_date),
                "voucher_number": v.voucher_number,
                "counterparty_id": str(v.counterparty_id),
                "total_amount": str(v.total_amount),
            },
        ))

        await db.delete(v)
        deleted_count += 1

    await db.flush()
    return {
        "deleted_count": deleted_count,
        "skipped_count": skipped_count,
        "errors": errors,
    }


# ─── 조정 전표 ──────────────────────────────────────────────────────

@router.post("/{voucher_id}/adjustment", response_model=VoucherResponse, status_code=201)
async def create_adjustment_voucher(
    voucher_id: UUID,
    data: AdjustmentVoucherCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """마감된 전표에 대한 조정전표 생성

    마감(LOCKED) 상태 전표의 금액 수정이 필요할 때, 원본을 직접 수정하지 않고
    조정전표를 생성하여 차액만큼 반영합니다.
    """
    original = await db.get(Voucher, voucher_id)
    if not original:
        raise HTTPException(status_code=404, detail="원본 전표를 찾을 수 없습니다")

    # 조정전표는 마감된 전표에 대해서만 생성 가능
    if original.settlement_status != SettlementStatus.LOCKED:
        raise HTTPException(
            status_code=400,
            detail="마감되지 않은 전표는 직접 수정하세요. 조정전표는 마감된 전표에 대해서만 생성 가능합니다."
        )

    # adjustment_type 유효성 검사
    try:
        adj_type = AdjustmentType(data.adjustment_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"잘못된 조정 유형입니다. 가능한 값: {[t.value for t in AdjustmentType]}"
        )

    # 조정전표 번호: 원본_ADJ_순번
    existing_adj_count = (await db.execute(
        select(func.count(Voucher.id)).where(
            Voucher.original_voucher_id == voucher_id
        )
    )).scalar() or 0
    adj_number = f"{original.voucher_number}_ADJ_{existing_adj_count + 1}"

    adjustment = Voucher(
        trade_date=data.trade_date,
        counterparty_id=original.counterparty_id,
        voucher_number=adj_number,
        voucher_type=original.voucher_type,
        quantity=data.quantity,
        total_amount=data.total_amount,
        memo=data.memo,
        created_by=current_user.id,
        # 조정전표 전용 필드
        is_adjustment=True,
        adjustment_type=adj_type,
        original_voucher_id=voucher_id,
        adjustment_reason=data.adjustment_reason,
        # 조정전표는 OPEN 상태로 시작
        settlement_status=SettlementStatus.OPEN,
        payment_status=PaymentStatus.UNPAID,
    )
    db.add(adjustment)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.ADJUSTMENT_VOUCHER_CREATE,
        target_type="voucher",
        target_id=adjustment.id,
        after_data={
            "original_voucher_id": str(voucher_id),
            "adjustment_type": adj_type.value,
            "total_amount": str(data.total_amount),
            "reason": data.adjustment_reason,
        },
    ))

    await db.flush()
    return await _enrich_voucher(adjustment, db)


@router.get("/{voucher_id}/adjustments", response_model=list[VoucherResponse])
async def list_adjustment_vouchers(
    voucher_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표의 조정 이력 조회"""
    # 원본 전표 존재 확인
    original = await db.get(Voucher, voucher_id)
    if not original:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")

    result = await db.execute(
        select(Voucher)
        .where(Voucher.original_voucher_id == voucher_id)
        .order_by(Voucher.created_at.desc())
    )
    adjustments = result.scalars().all()

    return await _enrich_vouchers_batch(adjustments, db)
