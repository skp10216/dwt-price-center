"""
단가표 통합 관리 시스템 - 공통 스키마
API 응답 포맷 및 공통 타입 정의
"""

from decimal import Decimal
from typing import Any, Annotated, Generic, TypeVar, Optional
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field
from pydantic.functional_serializers import PlainSerializer

FloatDecimal = Annotated[
    Decimal,
    PlainSerializer(lambda v: float(v) if v is not None else 0.0, return_type=float),
]
"""Decimal → float 자동 직렬화 타입. JSON 응답에서 문자열 대신 숫자로 반환됨."""


class DecimalSafeModel(BaseModel):
    """하위 호환용 — settlement 스키마에서 BaseModel 대신 사용"""
    pass


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
