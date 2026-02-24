"""
정산 도메인 - 상계(Netting) 관리
같은 거래처의 매출(AR)/매입(AP) 전표를 선택하여 상계 처리
확정 시 DEPOSIT + WITHDRAWAL Transaction 자동 생성
"""

from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.counterparty import Counterparty
from app.models.voucher import Voucher
from app.models.counterparty_transaction import CounterpartyTransaction
from app.models.transaction_allocation import TransactionAllocation
from app.models.netting_record import NettingRecord, NettingVoucherLink
from app.models.receipt import Receipt
from app.models.payment import Payment
from app.models.audit_log import AuditLog
from app.models.enums import (
    NettingStatus, TransactionType, TransactionSource, TransactionStatus,
    VoucherType, SettlementStatus, PaymentStatus, AuditAction,
)
from app.schemas.settlement import (
    NettingCreateRequest, NettingResponse, NettingDetailResponse,
    NettingListResponse, NettingVoucherLinkResponse,
    NettingEligibleVoucher, NettingEligibleResponse,
)

router = APIRouter()


async def _get_voucher_allocated_total(voucher_id: UUID, db: AsyncSession) -> Decimal:
    """전표 배분 누적액 (TransactionAllocation + 레거시)"""
    alloc = (await db.execute(
        select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
        .where(TransactionAllocation.voucher_id == voucher_id)
    )).scalar() or Decimal("0")

    v = await db.get(Voucher, voucher_id)
    if not v:
        return alloc

    if v.voucher_type == VoucherType.SALES:
        legacy = (await db.execute(
            select(func.coalesce(func.sum(Receipt.amount), 0))
            .where(Receipt.voucher_id == voucher_id)
        )).scalar() or Decimal("0")
    else:
        legacy = (await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.voucher_id == voucher_id)
        )).scalar() or Decimal("0")

    return alloc + legacy


def _netting_to_response(nr: NettingRecord, cp_name: str = None) -> NettingResponse:
    return NettingResponse(
        id=nr.id,
        counterparty_id=nr.counterparty_id,
        counterparty_name=cp_name,
        netting_date=nr.netting_date,
        netting_amount=nr.netting_amount,
        status=nr.status.value if hasattr(nr.status, 'value') else nr.status,
        memo=nr.memo,
        created_by=nr.created_by,
        confirmed_by=nr.confirmed_by,
        confirmed_at=nr.confirmed_at,
        created_at=nr.created_at,
    )


@router.get("/", response_model=NettingListResponse)
async def list_nettings(
    counterparty_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """상계 목록 조회"""
    query = select(NettingRecord)
    count_query = select(func.count(NettingRecord.id))

    filters = []
    if counterparty_id:
        filters.append(NettingRecord.counterparty_id == counterparty_id)
    if status_filter:
        filters.append(NettingRecord.status == status_filter.upper())
    if date_from:
        filters.append(NettingRecord.netting_date >= date_from)
    if date_to:
        filters.append(NettingRecord.netting_date <= date_to)

    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(NettingRecord.netting_date.desc(), NettingRecord.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    records = result.scalars().all()

    cp_ids = {r.counterparty_id for r in records}
    cp_map = {}
    if cp_ids:
        cp_result = await db.execute(
            select(Counterparty.id, Counterparty.name).where(Counterparty.id.in_(cp_ids))
        )
        cp_map = {row.id: row.name for row in cp_result.all()}

    return NettingListResponse(
        records=[_netting_to_response(r, cp_map.get(r.counterparty_id)) for r in records],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/counterparty/{counterparty_id}/eligible", response_model=NettingEligibleResponse)
async def get_eligible_vouchers(
    counterparty_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """상계 가능 전표 조회"""
    cp = await db.get(Counterparty, counterparty_id)
    if not cp:
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

    # 미마감 전표 조회
    vouchers_result = await db.execute(
        select(Voucher).where(
            Voucher.counterparty_id == counterparty_id,
            Voucher.settlement_status != SettlementStatus.LOCKED,
            Voucher.payment_status != PaymentStatus.LOCKED,
        ).order_by(Voucher.trade_date.asc())
    )
    vouchers = vouchers_result.scalars().all()

    sales = []
    purchases = []
    for v in vouchers:
        allocated = await _get_voucher_allocated_total(v.id, db)
        available = v.total_amount - allocated
        if available <= 0:
            continue

        item = NettingEligibleVoucher(
            id=v.id,
            voucher_number=v.voucher_number,
            voucher_type=v.voucher_type.value if hasattr(v.voucher_type, 'value') else v.voucher_type,
            trade_date=v.trade_date,
            total_amount=v.total_amount,
            already_allocated=allocated,
            available_for_netting=available,
        )

        if v.voucher_type == VoucherType.SALES:
            sales.append(item)
        else:
            purchases.append(item)

    sales_total = sum(s.available_for_netting for s in sales)
    purchase_total = sum(p.available_for_netting for p in purchases)

    return NettingEligibleResponse(
        counterparty_id=counterparty_id,
        counterparty_name=cp.name,
        sales_vouchers=sales,
        purchase_vouchers=purchases,
        max_nettable_amount=min(sales_total, purchase_total),
    )


@router.post("/", response_model=NettingDetailResponse, status_code=201)
async def create_netting(
    data: NettingCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """상계 초안 생성"""
    cp = await db.get(Counterparty, data.counterparty_id)
    if not cp:
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

    sales_total = sum(v.amount for v in data.sales_vouchers)
    purchase_total = sum(v.amount for v in data.purchase_vouchers)
    if sales_total != purchase_total:
        raise HTTPException(
            status_code=400,
            detail=f"매출 합계({sales_total})와 매입 합계({purchase_total})가 일치해야 합니다"
        )

    nr = NettingRecord(
        counterparty_id=data.counterparty_id,
        netting_date=data.netting_date,
        netting_amount=sales_total,
        status=NettingStatus.DRAFT,
        memo=data.memo,
        created_by=current_user.id,
    )
    db.add(nr)
    await db.flush()

    links = []
    for item in data.sales_vouchers + data.purchase_vouchers:
        v = await db.get(Voucher, item.voucher_id)
        if not v:
            raise HTTPException(status_code=404, detail=f"전표 {item.voucher_id}를 찾을 수 없습니다")
        if v.counterparty_id != data.counterparty_id:
            raise HTTPException(status_code=400, detail=f"전표 {v.voucher_number}는 다른 거래처 소속입니다")

        allocated = await _get_voucher_allocated_total(v.id, db)
        available = v.total_amount - allocated
        if item.amount > available:
            raise HTTPException(
                status_code=400,
                detail=f"전표 {v.voucher_number}의 상계 가능액({available})보다 요청액({item.amount})이 큽니다"
            )

        link = NettingVoucherLink(
            netting_record_id=nr.id,
            voucher_id=item.voucher_id,
            netted_amount=item.amount,
        )
        db.add(link)
        links.append((link, v))

    await db.flush()

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.NETTING_CREATE,
        target_type="netting_record",
        target_id=nr.id,
        after_data={
            "counterparty_id": str(data.counterparty_id),
            "amount": str(nr.netting_amount),
            "sales_count": len(data.sales_vouchers),
            "purchase_count": len(data.purchase_vouchers),
        },
    ))

    resp = _netting_to_response(nr, cp.name)
    return NettingDetailResponse(
        **resp.model_dump(),
        voucher_links=[
            NettingVoucherLinkResponse(
                voucher_id=link.voucher_id,
                voucher_number=v.voucher_number,
                voucher_type=v.voucher_type.value if hasattr(v.voucher_type, 'value') else v.voucher_type,
                trade_date=v.trade_date,
                total_amount=v.total_amount,
                netted_amount=link.netted_amount,
            )
            for link, v in links
        ],
    )


@router.get("/{netting_id}", response_model=NettingDetailResponse)
async def get_netting(
    netting_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """상계 상세 조회"""
    result = await db.execute(
        select(NettingRecord)
        .options(selectinload(NettingRecord.voucher_links))
        .where(NettingRecord.id == netting_id)
    )
    nr = result.scalar_one_or_none()
    if not nr:
        raise HTTPException(status_code=404, detail="상계 기록을 찾을 수 없습니다")

    cp = await db.get(Counterparty, nr.counterparty_id)
    link_responses = []
    for link in nr.voucher_links:
        v = await db.get(Voucher, link.voucher_id)
        link_responses.append(NettingVoucherLinkResponse(
            voucher_id=link.voucher_id,
            voucher_number=v.voucher_number if v else None,
            voucher_type=(v.voucher_type.value if v and hasattr(v.voucher_type, 'value') else None),
            trade_date=v.trade_date if v else None,
            total_amount=v.total_amount if v else None,
            netted_amount=link.netted_amount,
        ))

    resp = _netting_to_response(nr, cp.name if cp else None)
    return NettingDetailResponse(**resp.model_dump(), voucher_links=link_responses)


@router.post("/{netting_id}/confirm", response_model=NettingDetailResponse)
async def confirm_netting(
    netting_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """상계 확정 → Transaction 2건 자동 생성 + 배분"""
    result = await db.execute(
        select(NettingRecord)
        .options(selectinload(NettingRecord.voucher_links))
        .where(NettingRecord.id == netting_id)
    )
    nr = result.scalar_one_or_none()
    if not nr:
        raise HTTPException(status_code=404, detail="상계 기록을 찾을 수 없습니다")
    if nr.status != NettingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="초안 상태에서만 확정할 수 있습니다")

    # 전표 잔액 재검증
    for link in nr.voucher_links:
        v = await db.get(Voucher, link.voucher_id)
        if not v:
            raise HTTPException(status_code=400, detail=f"전표 {link.voucher_id}가 삭제되었습니다")
        allocated = await _get_voucher_allocated_total(v.id, db)
        available = v.total_amount - allocated
        if link.netted_amount > available:
            raise HTTPException(
                status_code=400,
                detail=f"전표 {v.voucher_number}의 잔액이 부족합니다 (가능: {available}, 필요: {link.netted_amount})"
            )

    # DEPOSIT Transaction (매출 전표에 배분)
    deposit_txn = CounterpartyTransaction(
        counterparty_id=nr.counterparty_id,
        transaction_type=TransactionType.DEPOSIT,
        transaction_date=nr.netting_date,
        amount=nr.netting_amount,
        allocated_amount=nr.netting_amount,
        source=TransactionSource.NETTING,
        netting_record_id=nr.id,
        status=TransactionStatus.ALLOCATED,
        created_by=current_user.id,
        memo=f"상계 처리 (#{str(nr.id)[:8]})",
    )
    db.add(deposit_txn)

    # WITHDRAWAL Transaction (매입 전표에 배분)
    withdrawal_txn = CounterpartyTransaction(
        counterparty_id=nr.counterparty_id,
        transaction_type=TransactionType.WITHDRAWAL,
        transaction_date=nr.netting_date,
        amount=nr.netting_amount,
        allocated_amount=nr.netting_amount,
        source=TransactionSource.NETTING,
        netting_record_id=nr.id,
        status=TransactionStatus.ALLOCATED,
        created_by=current_user.id,
        memo=f"상계 처리 (#{str(nr.id)[:8]})",
    )
    db.add(withdrawal_txn)
    await db.flush()

    # 배분 생성
    order = 0
    affected_voucher_ids = []
    for link in nr.voucher_links:
        v = await db.get(Voucher, link.voucher_id)
        if v.voucher_type == VoucherType.SALES:
            txn = deposit_txn
        else:
            txn = withdrawal_txn

        order += 1
        db.add(TransactionAllocation(
            transaction_id=txn.id,
            voucher_id=link.voucher_id,
            allocated_amount=link.netted_amount,
            allocation_order=order,
            created_by=current_user.id,
            memo="상계 자동 배분",
        ))
        affected_voucher_ids.append(link.voucher_id)

    # 상계 확정
    nr.status = NettingStatus.CONFIRMED
    nr.confirmed_by = current_user.id
    nr.confirmed_at = datetime.utcnow()
    await db.flush()

    # 전표 상태 재계산
    from app.api.v1.settlement.transactions import _update_voucher_status
    for vid in affected_voucher_ids:
        await _update_voucher_status(vid, db)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.NETTING_CONFIRM,
        target_type="netting_record",
        target_id=nr.id,
        after_data={
            "amount": str(nr.netting_amount),
            "deposit_txn_id": str(deposit_txn.id),
            "withdrawal_txn_id": str(withdrawal_txn.id),
        },
    ))

    # 응답
    cp = await db.get(Counterparty, nr.counterparty_id)
    link_responses = []
    for link in nr.voucher_links:
        v = await db.get(Voucher, link.voucher_id)
        link_responses.append(NettingVoucherLinkResponse(
            voucher_id=link.voucher_id,
            voucher_number=v.voucher_number if v else None,
            voucher_type=(v.voucher_type.value if v and hasattr(v.voucher_type, 'value') else None),
            trade_date=v.trade_date if v else None,
            total_amount=v.total_amount if v else None,
            netted_amount=link.netted_amount,
        ))

    resp = _netting_to_response(nr, cp.name if cp else None)
    return NettingDetailResponse(**resp.model_dump(), voucher_links=link_responses)


@router.post("/{netting_id}/cancel", response_model=NettingResponse)
async def cancel_netting(
    netting_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """상계 취소"""
    nr = await db.get(NettingRecord, netting_id)
    if not nr:
        raise HTTPException(status_code=404, detail="상계 기록을 찾을 수 없습니다")
    if nr.status == NettingStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="이미 취소된 상계입니다")

    if nr.status == NettingStatus.CONFIRMED:
        # 확정된 상계 취소: 관련 Transaction도 취소
        txn_result = await db.execute(
            select(CounterpartyTransaction)
            .where(CounterpartyTransaction.netting_record_id == nr.id)
        )
        txns = txn_result.scalars().all()

        affected_voucher_ids = []
        for txn in txns:
            # 배분 삭제
            alloc_result = await db.execute(
                select(TransactionAllocation)
                .where(TransactionAllocation.transaction_id == txn.id)
            )
            for alloc in alloc_result.scalars().all():
                affected_voucher_ids.append(alloc.voucher_id)
                await db.delete(alloc)

            txn.status = TransactionStatus.CANCELLED
            txn.allocated_amount = Decimal("0")

        await db.flush()

        # 전표 상태 재계산
        from app.api.v1.settlement.transactions import _update_voucher_status
        for vid in set(affected_voucher_ids):
            await _update_voucher_status(vid, db)

    nr.status = NettingStatus.CANCELLED

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.NETTING_CANCEL,
        target_type="netting_record",
        target_id=nr.id,
        before_data={"status": "confirmed" if nr.confirmed_at else "draft"},
    ))

    cp = await db.get(Counterparty, nr.counterparty_id)
    return _netting_to_response(nr, cp.name if cp else None)
