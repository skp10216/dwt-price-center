"""
정산 도메인 - 송금(지급) 이력 관리
매입 전표의 송금 등록/삭제 + 자동 상태 전이

[DEPRECATED] 이 API는 전환기 호환을 위해 유지됩니다.
신규 송금은 /settlement/transactions API를 사용하세요.
"""

from uuid import UUID
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.voucher import Voucher
from app.models.payment import Payment
from app.models.transaction_allocation import TransactionAllocation
from app.models.counterparty_transaction import CounterpartyTransaction
from app.models.enums import PaymentStatus, SettlementStatus, AuditAction
from app.models.audit_log import AuditLog
from app.schemas.settlement import PaymentCreate, PaymentResponse

router = APIRouter()


async def _update_payment_status(voucher: Voucher, db: AsyncSession) -> None:
    """송금 후 지급 상태 자동 전이 — 레거시 Payment + 신규 TransactionAllocation 합산"""
    if voucher.payment_status == PaymentStatus.LOCKED:
        return

    # 레거시 Payment 합계
    legacy_total = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.voucher_id == voucher.id)
    )).scalar() or Decimal("0")

    # 신규 TransactionAllocation 합계 (WITHDRAWAL 타입)
    allocation_total = (await db.execute(
        select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
        .where(TransactionAllocation.voucher_id == voucher.id)
        .where(
            TransactionAllocation.transaction_id.in_(
                select(CounterpartyTransaction.id).where(
                    CounterpartyTransaction.transaction_type == "WITHDRAWAL"
                )
            )
        )
    )).scalar() or Decimal("0")

    total = legacy_total + allocation_total

    if total >= voucher.total_amount:
        voucher.payment_status = PaymentStatus.PAID
    elif total > 0:
        voucher.payment_status = PaymentStatus.PARTIAL
    else:
        voucher.payment_status = PaymentStatus.UNPAID


@router.post("/{voucher_id}/payments", response_model=PaymentResponse, status_code=201,
             deprecated=True)
async def create_payment(
    voucher_id: UUID,
    data: PaymentCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """송금 등록 [DEPRECATED — /settlement/transactions 사용 권장]"""
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = "2026-06-30"
    response.headers["Link"] = '</api/v1/settlement/transactions>; rel="successor-version"'

    v = await db.get(Voucher, voucher_id)
    if not v:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")
    if v.payment_status == PaymentStatus.LOCKED:
        raise HTTPException(status_code=400, detail="마감된 전표에는 송금을 등록할 수 없습니다")

    payment = Payment(
        voucher_id=voucher_id,
        payment_date=data.payment_date,
        amount=data.amount,
        memo=data.memo,
        created_by=current_user.id,
    )
    db.add(payment)

    await db.flush()
    await _update_payment_status(v, db)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.PAYMENT_CREATE,
        target_type="payment",
        target_id=payment.id,
        after_data={"voucher_id": str(voucher_id), "amount": str(data.amount)},
    ))

    return PaymentResponse.model_validate(payment)


@router.get("/{voucher_id}/payments", response_model=list[PaymentResponse],
            deprecated=True)
async def list_payments(
    voucher_id: UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표의 송금 이력 조회 [DEPRECATED]"""
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = '</api/v1/settlement/transactions>; rel="successor-version"'

    result = await db.execute(
        select(Payment).where(Payment.voucher_id == voucher_id)
        .order_by(Payment.payment_date.desc())
    )
    return [PaymentResponse.model_validate(p) for p in result.scalars().all()]


@router.delete("/{voucher_id}/payments/{payment_id}", status_code=204,
               deprecated=True)
async def delete_payment(
    voucher_id: UUID,
    payment_id: UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """송금 삭제 [DEPRECATED]"""
    response.headers["Deprecation"] = "true"

    result = await db.execute(
        select(Payment).where(Payment.id == payment_id, Payment.voucher_id == voucher_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="송금 내역을 찾을 수 없습니다")

    v = await db.get(Voucher, voucher_id)
    if v and v.payment_status == PaymentStatus.LOCKED:
        raise HTTPException(status_code=400, detail="마감된 전표의 송금은 삭제할 수 없습니다")

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.PAYMENT_DELETE,
        target_type="payment",
        target_id=payment_id,
        before_data={"amount": str(payment.amount), "date": str(payment.payment_date)},
    ))

    await db.delete(payment)
    await db.flush()

    if v:
        await _update_payment_status(v, db)
