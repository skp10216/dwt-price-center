"""
단가표 통합 관리 시스템 - 지사 API
지사 CRUD + 소프트 삭제/복구 + 낙관적 락 (관리자 전용)
"""

from uuid import UUID
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, get_settlement_user
from app.models.user import User
from app.models.branch import Branch
from app.models.counterparty import Counterparty
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction
from app.schemas.branch import (
    BranchCreate,
    BranchUpdate,
    BranchResponse,
    BranchListResponse,
    BranchDeleteRequest,
    BranchImpactResponse,
)
from app.schemas.common import SuccessResponse

router = APIRouter()


def _check_version(entity, version: Optional[str], entity_name: str = "리소스"):
    """낙관적 락: updated_at과 version 비교"""
    if version is not None:
        current_version = entity.updated_at.isoformat() if entity.updated_at else None
        if current_version != version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "VERSION_CONFLICT",
                    "message": f"다른 사용자가 이 {entity_name}을(를) 수정했습니다. 새로고침 후 다시 시도하세요.",
                    "details": {"current_version": current_version},
                },
            )


async def _branch_to_response(branch: Branch, db: AsyncSession) -> BranchResponse:
    """Branch → BranchResponse 변환 (counterparty_count 포함)"""
    cp_count_q = select(func.count(Counterparty.id)).where(
        Counterparty.branch_id == branch.id,
    )
    cp_result = await db.execute(cp_count_q)
    counterparty_count = cp_result.scalar() or 0

    resp = BranchResponse.model_validate(branch)
    resp.partner_count = 0
    resp.counterparty_count = counterparty_count
    return resp


@router.get("", response_model=SuccessResponse[BranchListResponse])
async def list_branches(
    include_deleted: bool = Query(False),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """지사 목록 조회"""
    query = select(Branch)
    count_query = select(func.count(Branch.id))

    if not include_deleted:
        query = query.where(Branch.deleted_at.is_(None))
        count_query = count_query.where(Branch.deleted_at.is_(None))

    if search:
        search_filter = Branch.name.ilike(f"%{search}%") | Branch.region.ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    query = query.order_by(Branch.name)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    result = await db.execute(query)
    branches = result.scalars().all()

    responses = []
    for b in branches:
        responses.append(await _branch_to_response(b, db))

    return SuccessResponse(
        data=BranchListResponse(branches=responses, total=total)
    )


@router.post("", response_model=SuccessResponse[BranchResponse], status_code=status.HTTP_201_CREATED)
async def create_branch(
    branch_data: BranchCreate,
    current_user: User = Depends(get_settlement_user),
    db: AsyncSession = Depends(get_db),
):
    """지사 생성 (관리자 전용)"""
    # 중복 확인 (삭제된 지사는 제외)
    result = await db.execute(
        select(Branch).where(Branch.name == branch_data.name, Branch.deleted_at.is_(None))
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BRANCH_EXISTS", "message": "이미 존재하는 지사명입니다"},
        )

    # 삭제된 동명 지사가 있으면 이름 변경 (unique 제약 충돌 방지)
    deleted_result = await db.execute(
        select(Branch).where(Branch.name == branch_data.name, Branch.deleted_at.isnot(None))
    )
    deleted_branch = deleted_result.scalar_one_or_none()
    if deleted_branch:
        suffix = deleted_branch.deleted_at.strftime("%Y%m%d%H%M%S")
        deleted_branch.name = f"{deleted_branch.name}_deleted_{suffix}"

    new_branch = Branch(**branch_data.model_dump())
    db.add(new_branch)
    await db.flush()

    # 감사로그
    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.BRANCH_CREATE,
        target_type="branch",
        target_id=new_branch.id,
        after_data=branch_data.model_dump(),
    ))

    await db.commit()
    await db.refresh(new_branch)

    return SuccessResponse(data=await _branch_to_response(new_branch, db))


@router.get("/{branch_id}", response_model=SuccessResponse[BranchResponse])
async def get_branch(
    branch_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """지사 상세 조회"""
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()

    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BRANCH_NOT_FOUND", "message": "지사를 찾을 수 없습니다"},
        )

    return SuccessResponse(data=await _branch_to_response(branch, db))


@router.get("/{branch_id}/impact", response_model=SuccessResponse[BranchImpactResponse])
async def get_branch_impact(
    branch_id: UUID,
    current_user: User = Depends(get_settlement_user),
    db: AsyncSession = Depends(get_db),
):
    """지사 삭제 시 영향 요약"""
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BRANCH_NOT_FOUND", "message": "지사를 찾을 수 없습니다"},
        )

    counterparties_q = select(Counterparty).where(
        Counterparty.branch_id == branch_id,
    )
    cp_result = await db.execute(counterparties_q)
    counterparties = cp_result.scalars().all()

    return SuccessResponse(data=BranchImpactResponse(
        partner_count=0,
        affected_partners=[],
        counterparty_count=len(counterparties),
        affected_counterparties=[{"id": str(c.id), "name": c.name} for c in counterparties],
    ))


@router.patch("/{branch_id}", response_model=SuccessResponse[BranchResponse])
async def update_branch(
    branch_id: UUID,
    branch_data: BranchUpdate,
    current_user: User = Depends(get_settlement_user),
    db: AsyncSession = Depends(get_db),
):
    """지사 수정 (관리자 전용, 낙관적 락)"""
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()

    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BRANCH_NOT_FOUND", "message": "지사를 찾을 수 없습니다"},
        )

    if branch.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BRANCH_DELETED", "message": "삭제된 지사는 수정할 수 없습니다"},
        )

    _check_version(branch, branch_data.version, "지사")

    # 이름 중복 확인 (삭제된 지사는 제외)
    if branch_data.name and branch_data.name != branch.name:
        dup = await db.execute(
            select(Branch).where(Branch.name == branch_data.name, Branch.deleted_at.is_(None))
        )
        if dup.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "BRANCH_EXISTS", "message": "이미 존재하는 지사명입니다"},
            )

    before_data = {
        "name": branch.name, "region": branch.region,
        "contact_info": branch.contact_info, "memo": branch.memo,
        "is_active": branch.is_active,
    }

    update_fields = branch_data.model_dump(exclude_unset=True, exclude={"version"})
    for field, value in update_fields.items():
        setattr(branch, field, value)

    after_data = {
        "name": branch.name, "region": branch.region,
        "contact_info": branch.contact_info, "memo": branch.memo,
        "is_active": branch.is_active,
    }

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.BRANCH_UPDATE,
        target_type="branch",
        target_id=branch.id,
        before_data=before_data,
        after_data=after_data,
    ))

    await db.commit()
    await db.refresh(branch)

    return SuccessResponse(data=await _branch_to_response(branch, db))


@router.delete("/{branch_id}", response_model=SuccessResponse[BranchResponse])
async def delete_branch(
    branch_id: UUID,
    delete_data: BranchDeleteRequest,
    current_user: User = Depends(get_settlement_user),
    db: AsyncSession = Depends(get_db),
):
    """지사 소프트 삭제 (관리자 전용)"""
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()

    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BRANCH_NOT_FOUND", "message": "지사를 찾을 수 없습니다"},
        )

    if branch.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BRANCH_ALREADY_DELETED", "message": "이미 삭제된 지사입니다"},
        )

    _check_version(branch, delete_data.version, "지사")

    branch.deleted_at = datetime.utcnow()
    branch.deleted_by = current_user.id
    branch.delete_reason = delete_data.reason

    # 소속 거래처들의 branch_id를 NULL로 해제
    await db.execute(
        update(Counterparty)
        .where(Counterparty.branch_id == branch_id)
        .values(branch_id=None)
    )

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.BRANCH_DELETE,
        target_type="branch",
        target_id=branch.id,
        before_data={"name": branch.name},
        after_data={"reason": delete_data.reason},
    ))

    await db.commit()
    await db.refresh(branch)

    return SuccessResponse(data=await _branch_to_response(branch, db))


@router.post("/{branch_id}/restore", response_model=SuccessResponse[BranchResponse])
async def restore_branch(
    branch_id: UUID,
    current_user: User = Depends(get_settlement_user),
    db: AsyncSession = Depends(get_db),
):
    """지사 복구 (관리자 전용)"""
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()

    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BRANCH_NOT_FOUND", "message": "지사를 찾을 수 없습니다"},
        )

    if branch.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BRANCH_NOT_DELETED", "message": "삭제되지 않은 지사입니다"},
        )

    branch.deleted_at = None
    branch.deleted_by = None
    branch.delete_reason = None

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.BRANCH_RESTORE,
        target_type="branch",
        target_id=branch.id,
        after_data={"name": branch.name},
    ))

    await db.commit()
    await db.refresh(branch)

    return SuccessResponse(data=await _branch_to_response(branch, db))
