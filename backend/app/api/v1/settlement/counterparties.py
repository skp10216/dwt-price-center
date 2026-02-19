"""
정산 도메인 - 거래처 CRUD + 별칭 관리
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.counterparty import Counterparty, CounterpartyAlias
from app.models.voucher import Voucher
from app.models.receipt import Receipt
from app.models.payment import Payment
from app.models.enums import VoucherType, AuditAction
from app.models.audit_log import AuditLog
from app.schemas.settlement import (
    CounterpartyCreate, CounterpartyUpdate,
    CounterpartyAliasCreate, CounterpartyAliasResponse,
    CounterpartyResponse, CounterpartySummary,
)

router = APIRouter()


@router.get("", response_model=dict)
async def list_counterparties(
    search: Optional[str] = Query(None, description="검색어 (이름/코드/별칭)"),
    counterparty_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거래처 목록 조회"""
    query = select(Counterparty).options(selectinload(Counterparty.aliases))

    if search:
        # 거래처명, 코드, 별칭에서 검색
        alias_subq = select(CounterpartyAlias.counterparty_id).where(
            CounterpartyAlias.alias_name.ilike(f"%{search}%")
        )
        query = query.where(
            or_(
                Counterparty.name.ilike(f"%{search}%"),
                Counterparty.code.ilike(f"%{search}%"),
                Counterparty.id.in_(alias_subq),
            )
        )
    if counterparty_type:
        query = query.where(Counterparty.counterparty_type == counterparty_type)
    if is_active is not None:
        query = query.where(Counterparty.is_active == is_active)

    # 카운트
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # 페이징
    query = query.order_by(Counterparty.name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "counterparties": [CounterpartyResponse.model_validate(c) for c in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("", response_model=CounterpartyResponse, status_code=201)
async def create_counterparty(
    data: CounterpartyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거래처 생성"""
    # 중복 체크
    existing = await db.execute(
        select(Counterparty).where(Counterparty.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 존재하는 거래처명입니다")

    cp = Counterparty(
        name=data.name,
        code=data.code,
        counterparty_type=data.counterparty_type,
        contact_info=data.contact_info,
        memo=data.memo,
    )
    db.add(cp)

    # 거래처명 자체를 별칭으로 자동 등록 (업로드 매칭용)
    alias = CounterpartyAlias(
        counterparty_id=cp.id,
        alias_name=data.name,
        created_by=current_user.id,
    )
    db.add(alias)

    # 감사로그
    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.COUNTERPARTY_CREATE,
        target_type="counterparty",
        target_id=cp.id,
        after_data={"name": data.name, "type": data.counterparty_type},
    ))

    await db.flush()
    await db.refresh(cp, ["aliases"])
    return CounterpartyResponse.model_validate(cp)


@router.get("/{counterparty_id}", response_model=CounterpartyResponse)
async def get_counterparty(
    counterparty_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거래처 상세 조회"""
    result = await db.execute(
        select(Counterparty)
        .options(selectinload(Counterparty.aliases))
        .where(Counterparty.id == counterparty_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")
    return CounterpartyResponse.model_validate(cp)


@router.patch("/{counterparty_id}", response_model=CounterpartyResponse)
async def update_counterparty(
    counterparty_id: UUID,
    data: CounterpartyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거래처 수정"""
    result = await db.execute(
        select(Counterparty)
        .options(selectinload(Counterparty.aliases))
        .where(Counterparty.id == counterparty_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

    before = {"name": cp.name, "type": cp.counterparty_type.value if hasattr(cp.counterparty_type, 'value') else cp.counterparty_type}
    update_data = data.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(cp, k, v)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.COUNTERPARTY_UPDATE,
        target_type="counterparty",
        target_id=cp.id,
        before_data=before,
        after_data=update_data,
    ))

    await db.flush()
    await db.refresh(cp, ["aliases"])
    return CounterpartyResponse.model_validate(cp)


# ============================================================================
# 거래처 요약 (미수/미지급)
# ============================================================================

@router.get("/{counterparty_id}/summary", response_model=CounterpartySummary)
async def get_counterparty_summary(
    counterparty_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거래처 요약 (미수/미지급/매출/매입 합계)"""
    result = await db.execute(
        select(Counterparty).where(Counterparty.id == counterparty_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

    # 판매 전표 합계 (미수)
    sales_q = select(
        func.coalesce(func.sum(Voucher.total_amount), 0),
        func.count(Voucher.id),
    ).where(
        Voucher.counterparty_id == counterparty_id,
        Voucher.voucher_type == VoucherType.SALES,
    )
    sales_result = (await db.execute(sales_q)).one()
    total_sales = sales_result[0]
    sales_count = sales_result[1]

    # 누적 입금
    receipts_q = select(func.coalesce(func.sum(Receipt.amount), 0)).join(
        Voucher, Receipt.voucher_id == Voucher.id
    ).where(Voucher.counterparty_id == counterparty_id)
    total_received = (await db.execute(receipts_q)).scalar() or 0

    # 매입 전표 합계 (미지급)
    purchase_q = select(
        func.coalesce(func.sum(Voucher.total_amount), 0),
        func.count(Voucher.id),
    ).where(
        Voucher.counterparty_id == counterparty_id,
        Voucher.voucher_type == VoucherType.PURCHASE,
    )
    purchase_result = (await db.execute(purchase_q)).one()
    total_purchase = purchase_result[0]
    purchase_count = purchase_result[1]

    # 누적 송금
    payments_q = select(func.coalesce(func.sum(Payment.amount), 0)).join(
        Voucher, Payment.voucher_id == Voucher.id
    ).where(Voucher.counterparty_id == counterparty_id)
    total_paid = (await db.execute(payments_q)).scalar() or 0

    return CounterpartySummary(
        id=cp.id,
        name=cp.name,
        code=cp.code,
        counterparty_type=cp.counterparty_type.value if hasattr(cp.counterparty_type, 'value') else cp.counterparty_type,
        total_sales_amount=total_sales,
        total_purchase_amount=total_purchase,
        total_receivable=total_sales - total_received,
        total_payable=total_purchase - total_paid,
        voucher_count=sales_count + purchase_count,
    )


# ============================================================================
# 별칭 관리
# ============================================================================

@router.get("/{counterparty_id}/aliases", response_model=list[CounterpartyAliasResponse])
async def list_aliases(
    counterparty_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """거래처 별칭 목록"""
    result = await db.execute(
        select(CounterpartyAlias).where(CounterpartyAlias.counterparty_id == counterparty_id)
        .order_by(CounterpartyAlias.created_at)
    )
    return [CounterpartyAliasResponse.model_validate(a) for a in result.scalars().all()]


@router.post("/{counterparty_id}/aliases", response_model=CounterpartyAliasResponse, status_code=201)
async def create_alias(
    counterparty_id: UUID,
    data: CounterpartyAliasCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """별칭 추가"""
    # 거래처 존재 확인
    cp = await db.get(Counterparty, counterparty_id)
    if not cp:
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

    # 중복 확인
    existing = await db.execute(
        select(CounterpartyAlias).where(CounterpartyAlias.alias_name == data.alias_name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 등록된 별칭입니다")

    alias = CounterpartyAlias(
        counterparty_id=counterparty_id,
        alias_name=data.alias_name,
        created_by=current_user.id,
    )
    db.add(alias)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.COUNTERPARTY_ALIAS_CREATE,
        target_type="counterparty_alias",
        target_id=alias.id,
        after_data={"alias_name": data.alias_name, "counterparty_id": str(counterparty_id)},
    ))

    await db.flush()
    return CounterpartyAliasResponse.model_validate(alias)


@router.delete("/{counterparty_id}/aliases/{alias_id}", status_code=204)
async def delete_alias(
    counterparty_id: UUID,
    alias_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """별칭 삭제"""
    result = await db.execute(
        select(CounterpartyAlias).where(
            CounterpartyAlias.id == alias_id,
            CounterpartyAlias.counterparty_id == counterparty_id,
        )
    )
    alias = result.scalar_one_or_none()
    if not alias:
        raise HTTPException(status_code=404, detail="별칭을 찾을 수 없습니다")

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.COUNTERPARTY_ALIAS_DELETE,
        target_type="counterparty_alias",
        target_id=alias.id,
        before_data={"alias_name": alias.alias_name},
    ))

    await db.delete(alias)
