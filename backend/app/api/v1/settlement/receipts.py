"""
정산 도메인 - 입금(수금) 이력 관리
판매 전표의 입금 등록/삭제 + 자동 상태 전이

[DEPRECATED] 이 API는 전환기 호환을 위해 유지됩니다.
신규 입금은 /settlement/transactions API를 사용하세요.
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
from app.models.receipt import Receipt
from app.models.transaction_allocation import TransactionAllocation
from app.models.counterparty_transaction import CounterpartyTransaction
from app.models.enums import SettlementStatus, PaymentStatus, AuditAction
from app.models.audit_log import AuditLog
from app.schemas.settlement import ReceiptCreate, ReceiptResponse

router = APIRouter()

DEPRECATED_MSG = (
    "This endpoint is deprecated. Use /settlement/transactions for new deposits."
)


async def _update_settlement_status(voucher: Voucher, db: AsyncSession) -> None:
    """입금 후 정산 상태 자동 전이 — 레거시 Receipt + 신규 TransactionAllocation 합산"""
    if voucher.settlement_status == SettlementStatus.LOCKED:
        return  # 마감 상태는 변경 불가

    # 레거시 Receipt 합계
    legacy_total = (await db.execute(
        select(func.coalesce(func.sum(Receipt.amount), 0))
        .where(Receipt.voucher_id == voucher.id)
    )).scalar() or Decimal("0")

    # 신규 TransactionAllocation 합계
    allocation_total = (await db.execute(
        select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
        .where(TransactionAllocation.voucher_id == voucher.id)
        .where(
            TransactionAllocation.transaction_id.in_(
                select(CounterpartyTransaction.id).where(
                    CounterpartyTransaction.transaction_type == "DEPOSIT"
                )
            )
        )
    )).scalar() or Decimal("0")

    total = legacy_total + allocation_total

    if total >= voucher.total_amount:
        voucher.settlement_status = SettlementStatus.SETTLED
    elif total > 0:
        voucher.settlement_status = SettlementStatus.SETTLING
    else:
        voucher.settlement_status = SettlementStatus.OPEN


@router.post("/{voucher_id}/receipts", response_model=ReceiptResponse, status_code=201,
             deprecated=True)
async def create_receipt(
    voucher_id: UUID,
    data: ReceiptCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """입금 등록 [DEPRECATED — /settlement/transactions 사용 권장]"""
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = "2026-06-30"
    response.headers["Link"] = '</api/v1/settlement/transactions>; rel="successor-version"'

    v = await db.get(Voucher, voucher_id)
    if not v:
        raise HTTPException(status_code=404, detail="전표를 찾을 수 없습니다")
    if v.settlement_status == SettlementStatus.LOCKED:
        raise HTTPException(status_code=400, detail="마감된 전표에는 입금을 등록할 수 없습니다")

    receipt = Receipt(
        voucher_id=voucher_id,
        receipt_date=data.receipt_date,
        amount=data.amount,
        memo=data.memo,
        created_by=current_user.id,
    )
    db.add(receipt)

    # 자동 상태 전이
    await db.flush()
    await _update_settlement_status(v, db)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.RECEIPT_CREATE,
        target_type="receipt",
        target_id=receipt.id,
        after_data={"voucher_id": str(voucher_id), "amount": str(data.amount)},
    ))

    return ReceiptResponse.model_validate(receipt)


@router.get("/{voucher_id}/receipts", response_model=list[ReceiptResponse],
            deprecated=True)
async def list_receipts(
    voucher_id: UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전표의 입금 이력 조회 [DEPRECATED]"""
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = '</api/v1/settlement/transactions>; rel="successor-version"'

    result = await db.execute(
        select(Receipt).where(Receipt.voucher_id == voucher_id)
        .order_by(Receipt.receipt_date.desc())
    )
    return [ReceiptResponse.model_validate(r) for r in result.scalars().all()]


@router.delete("/{voucher_id}/receipts/{receipt_id}", status_code=204,
               deprecated=True)
async def delete_receipt(
    voucher_id: UUID,
    receipt_id: UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """입금 삭제 [DEPRECATED]"""
    response.headers["Deprecation"] = "true"

    result = await db.execute(
        select(Receipt).where(Receipt.id == receipt_id, Receipt.voucher_id == voucher_id)
    )
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="입금 내역을 찾을 수 없습니다")

    v = await db.get(Voucher, voucher_id)
    if v and v.settlement_status == SettlementStatus.LOCKED:
        raise HTTPException(status_code=400, detail="마감된 전표의 입금은 삭제할 수 없습니다")

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.RECEIPT_DELETE,
        target_type="receipt",
        target_id=receipt_id,
        before_data={"amount": str(receipt.amount), "date": str(receipt.receipt_date)},
    ))

    await db.delete(receipt)
    await db.flush()

    # 상태 재계산
    if v:
        await _update_settlement_status(v, db)
