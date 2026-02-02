"""
단가표 통합 관리 시스템 - 공통 스키마
API 응답 포맷 및 공통 타입 정의
"""

from typing import Any, Generic, TypeVar, Optional
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# 제네릭 타입 변수
T = TypeVar("T")


class ResponseMeta(BaseModel):
    """응답 메타 정보"""
    total: Optional[int] = None
    page: Optional[int] = None
    page_size: Optional[int] = None
    has_next: Optional[bool] = None


class SuccessResponse(BaseModel, Generic[T]):
    """성공 응답 포맷"""
    data: T
    meta: Optional[ResponseMeta] = None


class ErrorDetail(BaseModel):
    """에러 상세 정보"""
    code: str = Field(..., description="에러 코드")
    message: str = Field(..., description="에러 메시지")
    details: Optional[dict[str, Any]] = Field(None, description="추가 상세 정보")


class ErrorResponse(BaseModel):
    """에러 응답 포맷"""
    error: ErrorDetail


class PaginationParams(BaseModel):
    """페이지네이션 파라미터"""
    page: int = Field(1, ge=1, description="페이지 번호")
    page_size: int = Field(20, ge=1, le=100, description="페이지 크기")
    
    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class TimestampMixin(BaseModel):
    """타임스탬프 믹스인"""
    created_at: datetime
    updated_at: datetime


class IDMixin(BaseModel):
    """ID 믹스인"""
    id: UUID
