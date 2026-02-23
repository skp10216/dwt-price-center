"""
단가표 통합 관리 시스템 - 거래처 API
거래처 CRUD (관리자 전용)
"""

from uuid import UUID
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_admin_user
from app.models.user import User
from app.models.partner import Partner, UserPartnerFavorite
from app.models.branch import Branch
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction
from app.schemas.partner import (
    PartnerCreate,
    PartnerUpdate,
    PartnerResponse,
    PartnerListResponse,
)
from app.schemas.branch import (
    PartnerBranchMoveRequest,
    PartnerDeleteRequest,
    PartnerAssignBranchRequest,
)
from app.schemas.common import SuccessResponse

router = APIRouter()


@router.get("", response_model=SuccessResponse[PartnerListResponse])
async def list_partners(
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    favorites_only: Optional[bool] = Query(None),
    include_deleted: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """거래처 목록 조회"""
    query = select(Partner)
    count_query = select(func.count(Partner.id))

    # 소프트 삭제 필터
    if not include_deleted:
        query = query.where(Partner.deleted_at.is_(None))
        count_query = count_query.where(Partner.deleted_at.is_(None))

    # Viewer는 활성 거래처만 조회
    if current_user.role.value == "viewer":
        query = query.where(Partner.is_active == True)
        count_query = count_query.where(Partner.is_active == True)
    elif is_active is not None:
        query = query.where(Partner.is_active == is_active)
        count_query = count_query.where(Partner.is_active == is_active)

    if search:
        search_filter = Partner.name.ilike(f"%{search}%") | Partner.region.ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    # 즐겨찾기 필터
    if favorites_only:
        fav_join = (
            UserPartnerFavorite.partner_id == Partner.id
        ) & (
            UserPartnerFavorite.user_id == current_user.id
        )
        query = query.join(UserPartnerFavorite, fav_join)
        count_query = count_query.join(UserPartnerFavorite, fav_join)

    query = query.order_by(Partner.name)

    # 총 개수
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    result = await db.execute(query)
    partners = result.scalars().all()

    # N+1 방지: 즐겨찾기 집합 IN 쿼리 한 번으로 로드
    partner_ids = [p.id for p in partners]
    favorite_ids: set = set()
    if partner_ids:
        fav_result = await db.execute(
            select(UserPartnerFavorite.partner_id).where(
                UserPartnerFavorite.user_id == current_user.id,
                UserPartnerFavorite.partner_id.in_(partner_ids)
            )
        )
        favorite_ids = {row[0] for row in fav_result.all()}

    # Branch 이름 일괄 조회
    branch_ids = {p.branch_id for p in partners if p.branch_id}
    branch_name_map: dict = {}
    if branch_ids:
        from app.models.branch import Branch as BranchModel
        branch_result = await db.execute(
            select(BranchModel.id, BranchModel.name).where(BranchModel.id.in_(branch_ids))
        )
        branch_name_map = {row[0]: row[1] for row in branch_result.all()}

    def to_response(p: Partner) -> PartnerResponse:
        resp = PartnerResponse.model_validate(p)
        resp.is_favorite = p.id in favorite_ids
        resp.branch_name = branch_name_map.get(p.branch_id) if p.branch_id else None
        return resp

    return SuccessResponse(
        data=PartnerListResponse(
            partners=[to_response(p) for p in partners],
            total=total
        )
    )


@router.post("/{partner_id}/favorite", response_model=SuccessResponse[dict])
async def toggle_partner_favorite(
    partner_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """거래처 즐겨찾기 토글 (추가/제거)"""
    # 거래처 존재 확인
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PARTNER_NOT_FOUND", "message": "거래처를 찾을 수 없습니다"}
        )

    fav_result = await db.execute(
        select(UserPartnerFavorite).where(
            UserPartnerFavorite.user_id == current_user.id,
            UserPartnerFavorite.partner_id == partner_id
        )
    )
    existing = fav_result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return SuccessResponse(data={"is_favorite": False})
    else:
        db.add(UserPartnerFavorite(user_id=current_user.id, partner_id=partner_id))
        await db.commit()
        return SuccessResponse(data={"is_favorite": True})


@router.post("", response_model=SuccessResponse[PartnerResponse], status_code=status.HTTP_201_CREATED)
async def create_partner(
    partner_data: PartnerCreate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """거래처 생성 (관리자 전용)"""
    # 거래처명 중복 확인
    result = await db.execute(select(Partner).where(Partner.name == partner_data.name))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "PARTNER_EXISTS", "message": "이미 존재하는 거래처명입니다"}
        )
    
    # 거래처 생성
    new_partner = Partner(**partner_data.model_dump())
    db.add(new_partner)
    await db.flush()
    
    # 감사로그
    audit_log = AuditLog(
        user_id=current_user.id,
        action=AuditAction.PARTNER_CREATE,
        target_type="partner",
        target_id=new_partner.id,
        after_data=partner_data.model_dump(),
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(new_partner)
    
    return SuccessResponse(data=PartnerResponse.model_validate(new_partner))


@router.get("/{partner_id}", response_model=SuccessResponse[PartnerResponse])
async def get_partner(
    partner_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """거래처 상세 조회"""
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()
    
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PARTNER_NOT_FOUND", "message": "거래처를 찾을 수 없습니다"}
        )
    
    return SuccessResponse(data=PartnerResponse.model_validate(partner))


@router.patch("/{partner_id}", response_model=SuccessResponse[PartnerResponse])
async def update_partner(
    partner_id: UUID,
    partner_data: PartnerUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """거래처 수정 (관리자 전용)"""
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()
    
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PARTNER_NOT_FOUND", "message": "거래처를 찾을 수 없습니다"}
        )
    
    # 거래처명 중복 확인
    if partner_data.name and partner_data.name != partner.name:
        dup_result = await db.execute(select(Partner).where(Partner.name == partner_data.name))
        if dup_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "PARTNER_EXISTS", "message": "이미 존재하는 거래처명입니다"}
            )
    
    # 변경 전 데이터
    before_data = {
        "name": partner.name,
        "region": partner.region,
        "contact_info": partner.contact_info,
        "memo": partner.memo,
        "is_active": partner.is_active,
    }
    
    # 업데이트
    update_fields = partner_data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(partner, field, value)
    
    # 변경 후 데이터
    after_data = {
        "name": partner.name,
        "region": partner.region,
        "contact_info": partner.contact_info,
        "memo": partner.memo,
        "is_active": partner.is_active,
    }
    
    # 감사로그
    action = AuditAction.PARTNER_DEACTIVATE if "is_active" in update_fields and not partner.is_active else AuditAction.PARTNER_UPDATE
    audit_log = AuditLog(
        user_id=current_user.id,
        action=action,
        target_type="partner",
        target_id=partner.id,
        before_data=before_data,
        after_data=after_data,
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(partner)

    return SuccessResponse(data=PartnerResponse.model_validate(partner))


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


@router.delete("/{partner_id}", response_model=SuccessResponse[PartnerResponse])
async def delete_partner(
    partner_id: UUID,
    delete_data: PartnerDeleteRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """거래처 소프트 삭제 (관리자 전용)"""
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()

    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PARTNER_NOT_FOUND", "message": "거래처를 찾을 수 없습니다"},
        )

    if partner.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "PARTNER_ALREADY_DELETED", "message": "이미 삭제된 거래처입니다"},
        )

    _check_version(partner, delete_data.version, "거래처")

    partner.deleted_at = datetime.utcnow()
    partner.deleted_by = current_user.id
    partner.delete_reason = delete_data.reason

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.PARTNER_DELETE,
        target_type="partner",
        target_id=partner.id,
        before_data={"name": partner.name},
        after_data={"reason": delete_data.reason},
    ))

    await db.commit()
    await db.refresh(partner)
    return SuccessResponse(data=PartnerResponse.model_validate(partner))


@router.post("/{partner_id}/restore", response_model=SuccessResponse[PartnerResponse])
async def restore_partner(
    partner_id: UUID,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """거래처 복구 (관리자 전용)"""
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()

    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PARTNER_NOT_FOUND", "message": "거래처를 찾을 수 없습니다"},
        )

    if partner.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "PARTNER_NOT_DELETED", "message": "삭제되지 않은 거래처입니다"},
        )

    partner.deleted_at = None
    partner.deleted_by = None
    partner.delete_reason = None

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.PARTNER_RESTORE,
        target_type="partner",
        target_id=partner.id,
        after_data={"name": partner.name},
    ))

    await db.commit()
    await db.refresh(partner)
    return SuccessResponse(data=PartnerResponse.model_validate(partner))


@router.patch("/{partner_id}/branch", response_model=SuccessResponse[PartnerResponse])
async def move_partner_branch(
    partner_id: UUID,
    move_data: PartnerBranchMoveRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """거래처 지사 이동 (관리자 전용, 낙관적 락)"""
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()

    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PARTNER_NOT_FOUND", "message": "거래처를 찾을 수 없습니다"},
        )

    _check_version(partner, move_data.version, "거래처")

    # 이동할 지사 존재 확인
    if move_data.branch_id is not None:
        branch_result = await db.execute(select(Branch).where(
            Branch.id == move_data.branch_id,
            Branch.deleted_at.is_(None),
        ))
        if not branch_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "BRANCH_NOT_FOUND", "message": "이동할 지사를 찾을 수 없습니다"},
            )

    before_branch_id = partner.branch_id
    partner.branch_id = move_data.branch_id

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.PARTNER_MOVE,
        target_type="partner",
        target_id=partner.id,
        before_data={"branch_id": str(before_branch_id) if before_branch_id else None},
        after_data={
            "branch_id": str(move_data.branch_id) if move_data.branch_id else None,
            "reason": move_data.reason,
        },
    ))

    await db.commit()
    await db.refresh(partner)
    return SuccessResponse(data=PartnerResponse.model_validate(partner))


@router.post("/assign-branch", response_model=SuccessResponse[dict])
async def assign_branch_bulk(
    assign_data: PartnerAssignBranchRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """거래처 일괄 지사 배정 (관리자 전용)"""
    # 지사 존재 확인
    if assign_data.branch_id is not None:
        branch_result = await db.execute(select(Branch).where(
            Branch.id == assign_data.branch_id,
            Branch.deleted_at.is_(None),
        ))
        if not branch_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "BRANCH_NOT_FOUND", "message": "지사를 찾을 수 없습니다"},
            )

    result = await db.execute(
        select(Partner).where(
            Partner.id.in_(assign_data.partner_ids),
            Partner.deleted_at.is_(None),
        )
    )
    partners = result.scalars().all()

    updated_count = 0
    for p in partners:
        if p.branch_id != assign_data.branch_id:
            before_branch_id = p.branch_id
            p.branch_id = assign_data.branch_id
            updated_count += 1

            db.add(AuditLog(
                user_id=current_user.id,
                action=AuditAction.PARTNER_MOVE,
                target_type="partner",
                target_id=p.id,
                before_data={"branch_id": str(before_branch_id) if before_branch_id else None},
                after_data={"branch_id": str(assign_data.branch_id) if assign_data.branch_id else None},
            ))

    await db.commit()
    return SuccessResponse(data={"updated_count": updated_count})
