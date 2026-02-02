"""
단가표 통합 관리 시스템 - 사용자 스키마
사용자 관리 관련 스키마
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole


class UserCreate(BaseModel):
    """사용자 생성 요청"""
    email: EmailStr = Field(..., description="이메일 (로그인 ID)")
    password: str = Field(..., min_length=8, description="비밀번호")
    name: str = Field(..., min_length=1, max_length=100, description="사용자 이름")
    role: UserRole = Field(default=UserRole.VIEWER, description="역할")


class UserUpdate(BaseModel):
    """사용자 수정 요청"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="사용자 이름")
    role: Optional[UserRole] = Field(None, description="역할")
    is_active: Optional[bool] = Field(None, description="활성 상태")


class UserResponse(BaseModel):
    """사용자 응답"""
    id: UUID
    email: EmailStr
    name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """사용자 목록 응답"""
    users: list[UserResponse]
    total: int
