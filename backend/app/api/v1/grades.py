"""
단가표 통합 관리 시스템 - 등급 API
등급 CRUD (관리자 전용)
"""

from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_admin_user
from app.models.user import User
from app.models.grade import Grade
from app.models.grade_price import GradePrice
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction
from app.schemas.grade import (
    GradeCreate,
    GradeUpdate,
    GradeResponse,
    GradeListResponse,
)
from app.schemas.common import SuccessResponse

router = APIRouter()


@router.get("", response_model=SuccessResponse[GradeListResponse])
async def list_grades(
    is_active: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """등급 목록 조회"""
    query = select(Grade)
    count_query = select(func.count(Grade.id))
    
    # Viewer는 활성 등급만 조회
    if current_user.role.value == "viewer":
        query = query.where(Grade.is_active == True)
        count_query = count_query.where(Grade.is_active == True)
    elif is_active is not None:
        query = query.where(Grade.is_active == is_active)
        count_query = count_query.where(Grade.is_active == is_active)
    
    query = query.order_by(Grade.sort_order)
    
    # 총 개수
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    result = await db.execute(query)
    grades = result.scalars().all()
    
    return SuccessResponse(
        data=GradeListResponse(
            grades=[GradeResponse.model_validate(g) for g in grades],
            total=total
        )
    )


@router.post("", response_model=SuccessResponse[GradeResponse], status_code=status.HTTP_201_CREATED)
async def create_grade(
    grade_data: GradeCreate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """등급 생성 (관리자 전용)"""
    # 등급명 중복 확인
    result = await db.execute(select(Grade).where(Grade.name == grade_data.name))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "GRADE_EXISTS", "message": "이미 존재하는 등급명입니다"}
        )
    
    # 기본 등급 설정 시 기존 기본 등급 해제
    if grade_data.is_default:
        await db.execute(
            select(Grade).where(Grade.is_default == True)
        )
        existing_default = await db.execute(
            select(Grade).where(Grade.is_default == True)
        )
        for grade in existing_default.scalars():
            grade.is_default = False
    
    # 등급 생성
    new_grade = Grade(**grade_data.model_dump())
    db.add(new_grade)
    await db.flush()
    
    # 감사로그
    audit_log = AuditLog(
        user_id=current_user.id,
        action=AuditAction.GRADE_CREATE,
        target_type="grade",
        target_id=new_grade.id,
        after_data=grade_data.model_dump(),
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(new_grade)
    
    return SuccessResponse(data=GradeResponse.model_validate(new_grade))


@router.get("/{grade_id}", response_model=SuccessResponse[GradeResponse])
async def get_grade(
    grade_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """등급 상세 조회"""
    result = await db.execute(select(Grade).where(Grade.id == grade_id))
    grade = result.scalar_one_or_none()
    
    if not grade:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "GRADE_NOT_FOUND", "message": "등급을 찾을 수 없습니다"}
        )
    
    return SuccessResponse(data=GradeResponse.model_validate(grade))


@router.patch("/{grade_id}", response_model=SuccessResponse[GradeResponse])
async def update_grade(
    grade_id: UUID,
    grade_data: GradeUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """등급 수정 (관리자 전용)"""
    result = await db.execute(select(Grade).where(Grade.id == grade_id))
    grade = result.scalar_one_or_none()
    
    if not grade:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "GRADE_NOT_FOUND", "message": "등급을 찾을 수 없습니다"}
        )
    
    # 등급명 중복 확인
    if grade_data.name and grade_data.name != grade.name:
        dup_result = await db.execute(select(Grade).where(Grade.name == grade_data.name))
        if dup_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "GRADE_EXISTS", "message": "이미 존재하는 등급명입니다"}
            )
    
    # 사용 중인 등급 비활성화 경고 (삭제 금지 정책)
    if grade_data.is_active is False:
        # 사용 중인지 확인
        usage_result = await db.execute(
            select(func.count(GradePrice.id)).where(GradePrice.grade_id == grade_id)
        )
        usage_count = usage_result.scalar()
        if usage_count > 0:
            # 비활성화는 허용하되 경고
            pass  # 정책: 삭제 금지, 비활성화는 허용
    
    # 변경 전 데이터
    before_data = {
        "name": grade.name,
        "description": grade.description,
        "sort_order": grade.sort_order,
        "is_default": grade.is_default,
        "is_active": grade.is_active,
    }
    
    # 기본 등급 설정 시 기존 기본 등급 해제
    if grade_data.is_default:
        existing_default = await db.execute(
            select(Grade).where(Grade.is_default == True, Grade.id != grade_id)
        )
        for g in existing_default.scalars():
            g.is_default = False
    
    # 업데이트
    update_fields = grade_data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(grade, field, value)
    
    # 변경 후 데이터
    after_data = {
        "name": grade.name,
        "description": grade.description,
        "sort_order": grade.sort_order,
        "is_default": grade.is_default,
        "is_active": grade.is_active,
    }
    
    # 감사로그
    action = AuditAction.GRADE_DEACTIVATE if "is_active" in update_fields and not grade.is_active else AuditAction.GRADE_UPDATE
    audit_log = AuditLog(
        user_id=current_user.id,
        action=action,
        target_type="grade",
        target_id=grade.id,
        before_data=before_data,
        after_data=after_data,
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(grade)
    
    return SuccessResponse(data=GradeResponse.model_validate(grade))


@router.put("/reorder", response_model=SuccessResponse[GradeListResponse])
async def reorder_grades(
    orders: list[dict],
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """등급 정렬 순서 변경 (관리자 전용)"""
    for order_item in orders:
        grade_id = order_item.get("id")
        sort_order = order_item.get("sort_order")
        
        result = await db.execute(select(Grade).where(Grade.id == UUID(grade_id)))
        grade = result.scalar_one_or_none()
        if grade:
            grade.sort_order = sort_order
    
    await db.commit()
    
    # 전체 목록 반환
    result = await db.execute(select(Grade).order_by(Grade.sort_order))
    grades = result.scalars().all()
    
    return SuccessResponse(
        data=GradeListResponse(
            grades=[GradeResponse.model_validate(g) for g in grades],
            total=len(grades)
        )
    )
