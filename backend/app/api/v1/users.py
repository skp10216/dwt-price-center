"""
단가표 통합 관리 시스템 - 사용자 관리 API
관리자 전용: 계정 생성/수정/비활성화
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_password_hash
from app.api.deps import get_current_admin_user
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction, UserRole
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
)
from app.schemas.common import SuccessResponse

router = APIRouter()


@router.get("", response_model=SuccessResponse[UserListResponse])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: UserRole = Query(None),
    is_active: bool = Query(None),
    search: str = Query(None),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """사용자 목록 조회 (관리자 전용)"""
    query = select(User)
    count_query = select(func.count(User.id))
    
    # 필터링
    if role is not None:
        query = query.where(User.role == role)
        count_query = count_query.where(User.role == role)
    
    if is_active is not None:
        query = query.where(User.is_active == is_active)
        count_query = count_query.where(User.is_active == is_active)
    
    if search:
        search_filter = User.email.ilike(f"%{search}%") | User.name.ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    
    # 총 개수
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 페이지네이션
    offset = (page - 1) * page_size
    query = query.order_by(User.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    return SuccessResponse(
        data=UserListResponse(
            users=[UserResponse.model_validate(u) for u in users],
            total=total
        )
    )


@router.post("", response_model=SuccessResponse[UserResponse], status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """사용자 생성 (관리자 전용)"""
    # 이메일 중복 확인
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMAIL_EXISTS", "message": "이미 사용 중인 이메일입니다"}
        )
    
    # 사용자 생성
    new_user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        name=user_data.name,
        role=user_data.role,
    )
    db.add(new_user)
    await db.flush()
    
    # 감사로그
    audit_log = AuditLog(
        user_id=current_user.id,
        action=AuditAction.USER_CREATE,
        target_type="user",
        target_id=new_user.id,
        after_data={
            "email": new_user.email,
            "name": new_user.name,
            "role": new_user.role.value,
        }
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(new_user)
    
    return SuccessResponse(data=UserResponse.model_validate(new_user))


@router.get("/{user_id}", response_model=SuccessResponse[UserResponse])
async def get_user(
    user_id: UUID,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """사용자 상세 조회 (관리자 전용)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "USER_NOT_FOUND", "message": "사용자를 찾을 수 없습니다"}
        )
    
    return SuccessResponse(data=UserResponse.model_validate(user))


@router.patch("/{user_id}", response_model=SuccessResponse[UserResponse])
async def update_user(
    user_id: UUID,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """사용자 수정 (관리자 전용)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "USER_NOT_FOUND", "message": "사용자를 찾을 수 없습니다"}
        )
    
    # 변경 전 데이터
    before_data = {
        "name": user.name,
        "role": user.role.value,
        "is_active": user.is_active,
    }
    
    # 업데이트
    update_fields = user_data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(user, field, value)
    
    # 변경 후 데이터
    after_data = {
        "name": user.name,
        "role": user.role.value,
        "is_active": user.is_active,
    }
    
    # 역할 변경 시 별도 감사로그
    if "role" in update_fields:
        audit_log = AuditLog(
            user_id=current_user.id,
            action=AuditAction.USER_ROLE_CHANGE,
            target_type="user",
            target_id=user.id,
            before_data={"role": before_data["role"]},
            after_data={"role": after_data["role"]},
        )
        db.add(audit_log)
    
    # 비활성화 시 별도 감사로그
    if "is_active" in update_fields and not user.is_active:
        audit_log = AuditLog(
            user_id=current_user.id,
            action=AuditAction.USER_DEACTIVATE,
            target_type="user",
            target_id=user.id,
            before_data=before_data,
            after_data=after_data,
        )
        db.add(audit_log)
    else:
        # 일반 업데이트
        audit_log = AuditLog(
            user_id=current_user.id,
            action=AuditAction.USER_UPDATE,
            target_type="user",
            target_id=user.id,
            before_data=before_data,
            after_data=after_data,
        )
        db.add(audit_log)
    
    await db.commit()
    await db.refresh(user)
    
    return SuccessResponse(data=UserResponse.model_validate(user))
