"""
정산 도메인 - 거래처 CRUD + 별칭 관리 + 일괄 등록/삭제
"""

from typing import Optional, List
from uuid import UUID

from decimal import Decimal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func, or_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_settlement_user
from app.models.user import User
from app.models.counterparty import Counterparty, CounterpartyAlias, UserCounterpartyFavorite
from app.models.branch import Branch
from app.models.voucher import Voucher
from app.models.receipt import Receipt
from app.models.payment import Payment
from app.models.enums import VoucherType, AuditAction, TransactionType, TransactionStatus
from app.models.transaction_allocation import TransactionAllocation
from app.models.counterparty_transaction import CounterpartyTransaction
from app.models.audit_log import AuditLog
from app.schemas.settlement import (
    CounterpartyCreate, CounterpartyUpdate,
    CounterpartyAliasCreate, CounterpartyAliasResponse,
    CounterpartyResponse, CounterpartySummary,
)


class BatchCreateCounterpartyItem(BaseModel):
    """일괄 등록 항목"""
    name: str
    counterparty_type: str = "both"


class BatchCreateCounterpartiesRequest(BaseModel):
    """일괄 거래처 등록 요청"""
    items: List[BatchCreateCounterpartyItem]


class BatchAssignBranchRequest(BaseModel):
    """거래처 일괄 지사 배정 요청"""
    branch_id: UUID
    add_ids: List[UUID] = []
    remove_ids: List[UUID] = []

router = APIRouter()


@router.get("", response_model=dict)
async def list_counterparties(
    search: Optional[str] = Query(None, description="검색어 (이름/코드/별칭)"),
    counterparty_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    favorites_only: Optional[bool] = Query(None),
    branch_id: Optional[str] = Query(None, description="지사 필터 (UUID 또는 'unassigned')"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
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

    # 지사 필터
    if branch_id:
        if branch_id == "unassigned":
            query = query.where(Counterparty.branch_id.is_(None))
        else:
            try:
                bid = UUID(branch_id)
                query = query.where(Counterparty.branch_id == bid)
            except ValueError:
                pass

    # 즐겨찾기 필터
    if favorites_only:
        fav_join = (
            UserCounterpartyFavorite.counterparty_id == Counterparty.id
        ) & (
            UserCounterpartyFavorite.user_id == current_user.id
        )
        query = query.join(UserCounterpartyFavorite, fav_join)

    # 카운트
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # 페이징
    query = query.order_by(Counterparty.name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.unique().scalars().all()

    # N+1 방지: 즐겨찾기 집합 한 번에 로드
    counterparty_ids = [c.id for c in items]
    favorite_ids: set = set()
    if counterparty_ids:
        fav_result = await db.execute(
            select(UserCounterpartyFavorite.counterparty_id).where(
                UserCounterpartyFavorite.user_id == current_user.id,
                UserCounterpartyFavorite.counterparty_id.in_(counterparty_ids)
            )
        )
        favorite_ids = {row[0] for row in fav_result.all()}

    # N+1 방지: branch_id → branch_name 맵 일괄 로드
    branch_ids = {c.branch_id for c in items if c.branch_id}
    branch_name_map: dict = {}
    if branch_ids:
        br_result = await db.execute(
            select(Branch.id, Branch.name).where(Branch.id.in_(branch_ids))
        )
        branch_name_map = {row[0]: row[1] for row in br_result.all()}

    # N+1 방지: 거래처별 미수/미지급 배치 계산
    financial_map: dict = {}  # counterparty_id → {total_sales, total_purchases, outstanding_receivable, outstanding_payable}
    if counterparty_ids:
        # 1) 거래처별 판매/매입 전표 합계 (단일 쿼리)
        voucher_result = await db.execute(
            select(
                Voucher.counterparty_id,
                func.coalesce(func.sum(case(
                    (Voucher.voucher_type == VoucherType.SALES, Voucher.total_amount),
                    else_=0,
                )), 0).label("total_sales"),
                func.coalesce(func.sum(case(
                    (Voucher.voucher_type == VoucherType.PURCHASE, Voucher.total_amount),
                    else_=0,
                )), 0).label("total_purchases"),
            )
            .where(Voucher.counterparty_id.in_(counterparty_ids))
            .group_by(Voucher.counterparty_id)
        )
        voucher_map = {row[0]: (row[1], row[2]) for row in voucher_result.all()}

        # 2) 레거시 입금 (Receipt → SALES 전표)
        receipt_result = await db.execute(
            select(
                Voucher.counterparty_id,
                func.coalesce(func.sum(Receipt.amount), 0),
            )
            .join(Voucher, Receipt.voucher_id == Voucher.id)
            .where(Voucher.counterparty_id.in_(counterparty_ids))
            .group_by(Voucher.counterparty_id)
        )
        receipt_map = {row[0]: row[1] for row in receipt_result.all()}

        # 3) 레거시 송금 (Payment → PURCHASE 전표)
        payment_result = await db.execute(
            select(
                Voucher.counterparty_id,
                func.coalesce(func.sum(Payment.amount), 0),
            )
            .join(Voucher, Payment.voucher_id == Voucher.id)
            .where(Voucher.counterparty_id.in_(counterparty_ids))
            .group_by(Voucher.counterparty_id)
        )
        payment_map = {row[0]: row[1] for row in payment_result.all()}

        # 4) 신규 배분 입금 (TransactionAllocation ← DEPOSIT)
        alloc_deposit_result = await db.execute(
            select(
                Voucher.counterparty_id,
                func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0),
            )
            .join(Voucher, TransactionAllocation.voucher_id == Voucher.id)
            .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
            .where(
                Voucher.counterparty_id.in_(counterparty_ids),
                CounterpartyTransaction.transaction_type == TransactionType.DEPOSIT,
            )
            .group_by(Voucher.counterparty_id)
        )
        alloc_deposit_map = {row[0]: row[1] for row in alloc_deposit_result.all()}

        # 5) 신규 배분 출금 (TransactionAllocation ← WITHDRAWAL)
        alloc_withdrawal_result = await db.execute(
            select(
                Voucher.counterparty_id,
                func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0),
            )
            .join(Voucher, TransactionAllocation.voucher_id == Voucher.id)
            .join(CounterpartyTransaction, TransactionAllocation.transaction_id == CounterpartyTransaction.id)
            .where(
                Voucher.counterparty_id.in_(counterparty_ids),
                CounterpartyTransaction.transaction_type == TransactionType.WITHDRAWAL,
            )
            .group_by(Voucher.counterparty_id)
        )
        alloc_withdrawal_map = {row[0]: row[1] for row in alloc_withdrawal_result.all()}

        # 합산하여 financial_map 구성
        for cid in counterparty_ids:
            total_sales, total_purchases = voucher_map.get(cid, (Decimal("0"), Decimal("0")))
            legacy_received = receipt_map.get(cid, Decimal("0"))
            alloc_received = alloc_deposit_map.get(cid, Decimal("0"))
            legacy_paid = payment_map.get(cid, Decimal("0"))
            alloc_paid = alloc_withdrawal_map.get(cid, Decimal("0"))

            financial_map[cid] = {
                "total_sales": total_sales,
                "total_purchases": total_purchases,
                "outstanding_receivable": total_sales - legacy_received - alloc_received,
                "outstanding_payable": total_purchases - legacy_paid - alloc_paid,
            }

    def to_response(c: Counterparty) -> CounterpartyResponse:
        resp = CounterpartyResponse.model_validate(c)
        resp.is_favorite = c.id in favorite_ids
        resp.branch_name = branch_name_map.get(c.branch_id) if c.branch_id else None
        fin = financial_map.get(c.id, {})
        resp.total_sales = fin.get("total_sales", Decimal("0"))
        resp.total_purchases = fin.get("total_purchases", Decimal("0"))
        resp.outstanding_receivable = fin.get("outstanding_receivable", Decimal("0"))
        resp.outstanding_payable = fin.get("outstanding_payable", Decimal("0"))
        return resp

    return {
        "counterparties": [to_response(c) for c in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/{counterparty_id}/favorite", response_model=dict)
async def toggle_counterparty_favorite(
    counterparty_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """거래처 즐겨찾기 토글 (추가/제거)"""
    result = await db.execute(select(Counterparty).where(Counterparty.id == counterparty_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

    fav_result = await db.execute(
        select(UserCounterpartyFavorite).where(
            UserCounterpartyFavorite.user_id == current_user.id,
            UserCounterpartyFavorite.counterparty_id == counterparty_id
        )
    )
    existing = fav_result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"is_favorite": False}
    else:
        db.add(UserCounterpartyFavorite(user_id=current_user.id, counterparty_id=counterparty_id))
        await db.commit()
        return {"is_favorite": True}


@router.post("", response_model=CounterpartyResponse, status_code=201)
async def create_counterparty(
    data: CounterpartyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
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
        branch_id=data.branch_id,
    )
    db.add(cp)
    await db.flush()  # cp.id 확정

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
    current_user: User = Depends(get_settlement_user),
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
    current_user: User = Depends(get_settlement_user),
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
# 거래처 삭제 / 일괄 삭제 / 일괄 등록
# ============================================================================

@router.delete("/{counterparty_id}", status_code=200)
async def delete_counterparty(
    counterparty_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """거래처 삭제 (연결 전표가 있으면 차단)"""
    result = await db.execute(
        select(Counterparty)
        .options(selectinload(Counterparty.aliases))
        .where(Counterparty.id == counterparty_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

    # 연결 전표 건수 확인
    voucher_count = (await db.execute(
        select(func.count(Voucher.id)).where(Voucher.counterparty_id == counterparty_id)
    )).scalar() or 0

    if voucher_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"해당 거래처에 연결된 전표가 {voucher_count}건 있어 삭제할 수 없습니다. 먼저 전표를 다른 거래처로 이전하거나 삭제해주세요."
        )

    # 연결 입출금 건수 확인 (취소/숨김 제외)
    from app.models.enums import TransactionStatus
    active_statuses = [TransactionStatus.PENDING, TransactionStatus.PARTIAL, TransactionStatus.ALLOCATED, TransactionStatus.ON_HOLD]
    txn_count = (await db.execute(
        select(func.count(CounterpartyTransaction.id)).where(
            CounterpartyTransaction.counterparty_id == counterparty_id,
            CounterpartyTransaction.status.in_(active_statuses),
        )
    )).scalar() or 0

    if txn_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"해당 거래처에 연결된 입출금이 {txn_count}건 있어 삭제할 수 없습니다. 먼저 입출금을 삭제해주세요."
        )

    # 취소/숨김 상태 입출금 및 연결 배분 삭제
    inactive_statuses = [TransactionStatus.CANCELLED, TransactionStatus.HIDDEN]
    inactive_txns = (await db.execute(
        select(CounterpartyTransaction).where(
            CounterpartyTransaction.counterparty_id == counterparty_id,
            CounterpartyTransaction.status.in_(inactive_statuses),
        )
    )).scalars().all()
    for txn in inactive_txns:
        # 배분 레코드 삭제
        allocs = (await db.execute(
            select(TransactionAllocation).where(TransactionAllocation.transaction_id == txn.id)
        )).scalars().all()
        for alloc in allocs:
            await db.delete(alloc)
        await db.delete(txn)

    # 별칭 삭제
    aliases_result = await db.execute(
        select(CounterpartyAlias).where(CounterpartyAlias.counterparty_id == counterparty_id)
    )
    for alias in aliases_result.scalars().all():
        await db.delete(alias)

    # 즐겨찾기 삭제
    fav_result = await db.execute(
        select(UserCounterpartyFavorite).where(UserCounterpartyFavorite.counterparty_id == counterparty_id)
    )
    for fav in fav_result.scalars().all():
        await db.delete(fav)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.COUNTERPARTY_DELETE,
        target_type="counterparty",
        target_id=cp.id,
        before_data={"name": cp.name},
    ))

    await db.delete(cp)
    await db.flush()
    return {"deleted": True, "name": cp.name}


@router.post("/batch-assign-branch", response_model=dict)
async def batch_assign_branch(
    data: BatchAssignBranchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """거래처 일괄 지사 배정/해제"""
    # 지사 존재 확인
    branch = await db.get(Branch, data.branch_id)
    if not branch:
        raise HTTPException(status_code=404, detail="지사를 찾을 수 없습니다")

    added_count = 0
    removed_count = 0

    # 배정: branch_id 설정
    if data.add_ids:
        result = await db.execute(
            select(Counterparty).where(Counterparty.id.in_(data.add_ids))
        )
        for cp in result.scalars().all():
            if cp.branch_id != data.branch_id:
                cp.branch_id = data.branch_id
                added_count += 1

    # 해제: branch_id를 null로 설정 (현재 지사 소속인 경우만)
    if data.remove_ids:
        result = await db.execute(
            select(Counterparty).where(
                Counterparty.id.in_(data.remove_ids),
                Counterparty.branch_id == data.branch_id,
            )
        )
        for cp in result.scalars().all():
            cp.branch_id = None
            removed_count += 1

    if added_count > 0 or removed_count > 0:
        db.add(AuditLog(
            user_id=current_user.id,
            action=AuditAction.COUNTERPARTY_UPDATE,
            target_type="counterparty",
            after_data={
                "action": "batch_assign_branch",
                "branch_id": str(data.branch_id),
                "branch_name": branch.name,
                "added_count": added_count,
                "removed_count": removed_count,
            },
        ))
        await db.flush()

    return {"added_count": added_count, "removed_count": removed_count}


@router.post("/batch-delete", response_model=dict)
async def batch_delete_counterparties(
    counterparty_ids: list[str] = Body(..., description="삭제할 거래처 ID 목록"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """거래처 일괄 삭제 (전표 연결이 없는 건만 삭제)"""
    deleted = []
    skipped = []

    for cid_str in counterparty_ids:
        try:
            cid = UUID(cid_str)
        except ValueError:
            skipped.append({"id": cid_str, "reason": "잘못된 ID 형식"})
            continue

        result = await db.execute(
            select(Counterparty)
            .options(selectinload(Counterparty.aliases))
            .where(Counterparty.id == cid)
        )
        cp = result.scalar_one_or_none()
        if not cp:
            skipped.append({"id": cid_str, "reason": "거래처 없음"})
            continue

        voucher_count = (await db.execute(
            select(func.count(Voucher.id)).where(Voucher.counterparty_id == cid)
        )).scalar() or 0

        if voucher_count > 0:
            skipped.append({"id": cid_str, "name": cp.name, "reason": f"전표 {voucher_count}건 연결"})
            continue

        from app.models.enums import TransactionStatus
        active_statuses = [TransactionStatus.PENDING, TransactionStatus.PARTIAL, TransactionStatus.ALLOCATED, TransactionStatus.ON_HOLD]
        txn_count = (await db.execute(
            select(func.count(CounterpartyTransaction.id)).where(
                CounterpartyTransaction.counterparty_id == cid,
                CounterpartyTransaction.status.in_(active_statuses),
            )
        )).scalar() or 0

        if txn_count > 0:
            skipped.append({"id": cid_str, "name": cp.name, "reason": f"입출금 {txn_count}건 연결"})
            continue

        # 취소/숨김 상태 입출금 및 연결 배분 삭제
        inactive_statuses = [TransactionStatus.CANCELLED, TransactionStatus.HIDDEN]
        inactive_txns = (await db.execute(
            select(CounterpartyTransaction).where(
                CounterpartyTransaction.counterparty_id == cid,
                CounterpartyTransaction.status.in_(inactive_statuses),
            )
        )).scalars().all()
        for txn in inactive_txns:
            allocs = (await db.execute(
                select(TransactionAllocation).where(TransactionAllocation.transaction_id == txn.id)
            )).scalars().all()
            for alloc in allocs:
                await db.delete(alloc)
            await db.delete(txn)

        # 별칭 삭제
        aliases_result = await db.execute(
            select(CounterpartyAlias).where(CounterpartyAlias.counterparty_id == cid)
        )
        for alias in aliases_result.scalars().all():
            await db.delete(alias)

        # 즐겨찾기 삭제
        fav_result = await db.execute(
            select(UserCounterpartyFavorite).where(UserCounterpartyFavorite.counterparty_id == cid)
        )
        for fav in fav_result.scalars().all():
            await db.delete(fav)

        db.add(AuditLog(
            user_id=current_user.id,
            action=AuditAction.COUNTERPARTY_BATCH_DELETE,
            target_type="counterparty",
            target_id=cp.id,
            before_data={"name": cp.name},
        ))
        deleted.append({"id": str(cp.id), "name": cp.name})
        await db.delete(cp)

    await db.flush()
    return {"deleted_count": len(deleted), "skipped_count": len(skipped), "deleted": deleted, "skipped": skipped}


@router.post("/batch-create", response_model=dict, status_code=201)
async def batch_create_counterparties(
    data: BatchCreateCounterpartiesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """거래처 일괄 등록 (미매칭 거래처 → 신규 등록 + 별칭 자동 추가)"""
    created = []
    skipped = []

    for item in data.items:
        name = item.name.strip()
        if not name:
            skipped.append({"name": name, "reason": "빈 이름"})
            continue

        # 중복 체크 (이름)
        existing = await db.execute(
            select(Counterparty).where(Counterparty.name == name)
        )
        if existing.scalar_one_or_none():
            # 이미 존재하면 별칭만 등록 (없는 경우)
            existing_cp = (await db.execute(
                select(Counterparty).where(Counterparty.name == name)
            )).scalar_one()
            alias_check = await db.execute(
                select(CounterpartyAlias).where(CounterpartyAlias.alias_name == name)
            )
            if not alias_check.scalar_one_or_none():
                db.add(CounterpartyAlias(
                    counterparty_id=existing_cp.id,
                    alias_name=name,
                    created_by=current_user.id,
                ))
            skipped.append({"name": name, "reason": "이미 존재 (별칭 보완)"})
            continue

        # 별칭 중복 체크
        alias_exists = await db.execute(
            select(CounterpartyAlias).where(CounterpartyAlias.alias_name == name)
        )
        if alias_exists.scalar_one_or_none():
            skipped.append({"name": name, "reason": "동일 별칭이 다른 거래처에 이미 등록됨"})
            continue

        # 신규 거래처 생성
        cp = Counterparty(
            name=name,
            counterparty_type=item.counterparty_type,
        )
        db.add(cp)
        await db.flush()  # ID 확보

        # 거래처명 자체를 별칭으로 등록
        db.add(CounterpartyAlias(
            counterparty_id=cp.id,
            alias_name=name,
            created_by=current_user.id,
        ))

        created.append({"id": str(cp.id), "name": name})

    if created:
        db.add(AuditLog(
            user_id=current_user.id,
            action=AuditAction.COUNTERPARTY_BATCH_CREATE,
            target_type="counterparty",
            after_data={"count": len(created), "names": [c["name"] for c in created[:20]]},
        ))

    await db.flush()
    return {
        "created_count": len(created),
        "skipped_count": len(skipped),
        "created": created,
        "skipped": skipped,
    }


# ============================================================================
# 거래처 요약 (미수/미지급)
# ============================================================================

@router.get("/{counterparty_id}/summary", response_model=CounterpartySummary)
async def get_counterparty_summary(
    counterparty_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """거래처 요약 (미수/미지급/매출/매입 합계) — 원자적 단일 스냅샷 조회"""
    result = await db.execute(
        select(Counterparty).where(Counterparty.id == counterparty_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

    # 단일 쿼리로 전표 합계 + 레거시 입금/송금 + 트랜잭션 입출금 원자적 조회
    from sqlalchemy import text
    summary_result = await db.execute(text("""
        WITH voucher_summary AS (
            SELECT
                COALESCE(SUM(CASE WHEN voucher_type = 'sales' THEN total_amount ELSE 0 END), 0) AS total_sales,
                COALESCE(SUM(CASE WHEN voucher_type = 'purchase' THEN total_amount ELSE 0 END), 0) AS total_purchases,
                COUNT(*) AS voucher_count
            FROM vouchers
            WHERE counterparty_id = :cp_id
        ),
        legacy_receipts AS (
            SELECT COALESCE(SUM(r.amount), 0) AS total
            FROM receipts r
            JOIN vouchers v ON r.voucher_id = v.id
            WHERE v.counterparty_id = :cp_id
        ),
        legacy_payments AS (
            SELECT COALESCE(SUM(p.amount), 0) AS total
            FROM payments p
            JOIN vouchers v ON p.voucher_id = v.id
            WHERE v.counterparty_id = :cp_id
        ),
        txn_summary AS (
            SELECT
                COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) AS total_deposits,
                COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END), 0) AS total_withdrawals
            FROM counterparty_transactions
            WHERE counterparty_id = :cp_id
              AND status NOT IN ('cancelled', 'hidden')
        )
        SELECT
            vs.total_sales,
            vs.total_purchases,
            vs.voucher_count,
            vs.total_sales - lr.total - ts.total_deposits AS total_receivable,
            vs.total_purchases - lp.total - ts.total_withdrawals AS total_payable
        FROM voucher_summary vs, legacy_receipts lr, legacy_payments lp, txn_summary ts
    """), {"cp_id": str(counterparty_id)})

    row = summary_result.one()

    return CounterpartySummary(
        id=cp.id,
        name=cp.name,
        code=cp.code,
        counterparty_type=cp.counterparty_type.value if hasattr(cp.counterparty_type, 'value') else cp.counterparty_type,
        total_sales_amount=row[0],
        total_purchase_amount=row[1],
        total_receivable=row[3],
        total_payable=row[4],
        voucher_count=row[2],
    )


# ============================================================================
# 별칭 관리
# ============================================================================

@router.get("/{counterparty_id}/aliases", response_model=list[CounterpartyAliasResponse])
async def list_aliases(
    counterparty_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
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
    current_user: User = Depends(get_settlement_user),
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
    current_user: User = Depends(get_settlement_user),
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
