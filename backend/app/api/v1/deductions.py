"""
단가표 통합 관리 시스템 - 차감 API
차감 항목/레벨 CRUD (관리자 전용)
"""

from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_admin_user
from app.models.user import User
from app.models.deduction import DeductionItem, DeductionLevel
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction
from app.schemas.deduction import (
    DeductionItemCreate,
    DeductionItemUpdate,
    DeductionItemResponse,
    DeductionItemListResponse,
    DeductionLevelCreate,
    DeductionLevelUpdate,
    DeductionLevelResponse,
)
from app.schemas.common import SuccessResponse

router = APIRouter()


# === 차감 항목 API ===

@router.get("", response_model=SuccessResponse[DeductionItemListResponse])
async def list_deduction_items(
    is_active: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """차감 항목 목록 조회"""
    query = select(DeductionItem).options(selectinload(DeductionItem.levels))
    count_query = select(func.count(DeductionItem.id))
    
    # Viewer는 활성 항목만 조회
    if current_user.role.value == "viewer":
        query = query.where(DeductionItem.is_active == True)
        count_query = count_query.where(DeductionItem.is_active == True)
    elif is_active is not None:
        query = query.where(DeductionItem.is_active == is_active)
        count_query = count_query.where(DeductionItem.is_active == is_active)
    
    query = query.order_by(DeductionItem.sort_order)
    
    # 총 개수
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    return SuccessResponse(
        data=DeductionItemListResponse(
            items=[DeductionItemResponse.model_validate(item) for item in items],
            total=total
        )
    )


@router.post("", response_model=SuccessResponse[DeductionItemResponse], status_code=status.HTTP_201_CREATED)
async def create_deduction_item(
    item_data: DeductionItemCreate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """차감 항목 생성 (관리자 전용)"""
    # 항목명 중복 확인
    result = await db.execute(
        select(DeductionItem).where(DeductionItem.name == item_data.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "DEDUCTION_ITEM_EXISTS", "message": "이미 존재하는 차감 항목명입니다"}
        )
    
    # 항목 생성
    new_item = DeductionItem(
        name=item_data.name,
        description=item_data.description,
        sort_order=item_data.sort_order,
    )
    db.add(new_item)
    await db.flush()
    
    # 레벨 생성
    if item_data.levels:
        for level_data in item_data.levels:
            level = DeductionLevel(
                item_id=new_item.id,
                **level_data.model_dump()
            )
            db.add(level)
    
    # 감사로그
    audit_log = AuditLog(
        user_id=current_user.id,
        action=AuditAction.DEDUCTION_CREATE,
        target_type="deduction_item",
        target_id=new_item.id,
        after_data=item_data.model_dump(),
    )
    db.add(audit_log)
    
    await db.commit()
    
    # 새로 조회
    result = await db.execute(
        select(DeductionItem)
        .where(DeductionItem.id == new_item.id)
        .options(selectinload(DeductionItem.levels))
    )
    new_item = result.scalar_one()
    
    return SuccessResponse(data=DeductionItemResponse.model_validate(new_item))


@router.get("/{item_id}", response_model=SuccessResponse[DeductionItemResponse])
async def get_deduction_item(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """차감 항목 상세 조회"""
    result = await db.execute(
        select(DeductionItem)
        .where(DeductionItem.id == item_id)
        .options(selectinload(DeductionItem.levels))
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DEDUCTION_ITEM_NOT_FOUND", "message": "차감 항목을 찾을 수 없습니다"}
        )
    
    return SuccessResponse(data=DeductionItemResponse.model_validate(item))


@router.patch("/{item_id}", response_model=SuccessResponse[DeductionItemResponse])
async def update_deduction_item(
    item_id: UUID,
    item_data: DeductionItemUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """차감 항목 수정 (관리자 전용)"""
    result = await db.execute(
        select(DeductionItem)
        .where(DeductionItem.id == item_id)
        .options(selectinload(DeductionItem.levels))
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DEDUCTION_ITEM_NOT_FOUND", "message": "차감 항목을 찾을 수 없습니다"}
        )
    
    # 변경 전 데이터
    before_data = {
        "name": item.name,
        "description": item.description,
        "sort_order": item.sort_order,
        "is_active": item.is_active,
    }
    
    # 업데이트
    update_fields = item_data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(item, field, value)
    
    # 변경 후 데이터
    after_data = {
        "name": item.name,
        "description": item.description,
        "sort_order": item.sort_order,
        "is_active": item.is_active,
    }
    
    # 감사로그
    action = AuditAction.DEDUCTION_DEACTIVATE if "is_active" in update_fields and not item.is_active else AuditAction.DEDUCTION_UPDATE
    audit_log = AuditLog(
        user_id=current_user.id,
        action=action,
        target_type="deduction_item",
        target_id=item.id,
        before_data=before_data,
        after_data=after_data,
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(item)
    
    return SuccessResponse(data=DeductionItemResponse.model_validate(item))


# === 차감 레벨 API ===

@router.post("/{item_id}/levels", response_model=SuccessResponse[DeductionLevelResponse], status_code=status.HTTP_201_CREATED)
async def create_deduction_level(
    item_id: UUID,
    level_data: DeductionLevelCreate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """차감 레벨 생성 (관리자 전용)"""
    # 항목 확인
    result = await db.execute(select(DeductionItem).where(DeductionItem.id == item_id))
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DEDUCTION_ITEM_NOT_FOUND", "message": "차감 항목을 찾을 수 없습니다"}
        )
    
    # 레벨명 중복 확인
    result = await db.execute(
        select(DeductionLevel).where(
            DeductionLevel.item_id == item_id,
            DeductionLevel.name == level_data.name
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "DEDUCTION_LEVEL_EXISTS", "message": "이미 존재하는 레벨명입니다"}
        )
    
    # 레벨 생성
    new_level = DeductionLevel(
        item_id=item_id,
        **level_data.model_dump()
    )
    db.add(new_level)
    
    # 감사로그
    audit_log = AuditLog(
        user_id=current_user.id,
        action=AuditAction.DEDUCTION_CREATE,
        target_type="deduction_level",
        target_id=new_level.id,
        after_data={"item_id": str(item_id), **level_data.model_dump()},
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(new_level)
    
    return SuccessResponse(data=DeductionLevelResponse.model_validate(new_level))


@router.patch("/{item_id}/levels/{level_id}", response_model=SuccessResponse[DeductionLevelResponse])
async def update_deduction_level(
    item_id: UUID,
    level_id: UUID,
    level_data: DeductionLevelUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """차감 레벨 수정 (관리자 전용)"""
    result = await db.execute(
        select(DeductionLevel).where(
            DeductionLevel.id == level_id,
            DeductionLevel.item_id == item_id
        )
    )
    level = result.scalar_one_or_none()
    
    if not level:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DEDUCTION_LEVEL_NOT_FOUND", "message": "차감 레벨을 찾을 수 없습니다"}
        )
    
    # 변경 전 데이터
    before_data = {
        "name": level.name,
        "amount": level.amount,
        "sort_order": level.sort_order,
        "is_active": level.is_active,
    }
    
    # 업데이트
    update_fields = level_data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(level, field, value)
    
    # 변경 후 데이터
    after_data = {
        "name": level.name,
        "amount": level.amount,
        "sort_order": level.sort_order,
        "is_active": level.is_active,
    }
    
    # 감사로그
    audit_log = AuditLog(
        user_id=current_user.id,
        action=AuditAction.DEDUCTION_UPDATE,
        target_type="deduction_level",
        target_id=level.id,
        before_data=before_data,
        after_data=after_data,
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(level)
    
    return SuccessResponse(data=DeductionLevelResponse.model_validate(level))
