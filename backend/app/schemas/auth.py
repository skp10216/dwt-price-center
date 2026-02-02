"""
단가표 통합 관리 시스템 - 인증 스키마
로그인, 토큰, 사용자 정보 관련 스키마
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    """로그인 요청"""
    email: EmailStr = Field(..., description="이메일")
    password: str = Field(..., min_length=4, description="비밀번호")


class TokenResponse(BaseModel):
    """토큰 응답"""
    access_token: str = Field(..., description="JWT 액세스 토큰")
    token_type: str = Field(default="bearer", description="토큰 타입")
    expires_in: int = Field(..., description="만료 시간 (초)")


class UserInfo(BaseModel):
    """사용자 정보"""
    id: UUID
    email: EmailStr
    name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    """로그인 응답"""
    token: TokenResponse
    user: UserInfo


class ChangePasswordRequest(BaseModel):
    """비밀번호 변경 요청"""
    current_password: str = Field(..., min_length=4, description="현재 비밀번호")
    new_password: str = Field(..., min_length=8, description="새 비밀번호")
