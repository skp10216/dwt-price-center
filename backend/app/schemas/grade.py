"""
단가표 통합 관리 시스템 - 등급 스키마
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class GradeCreate(BaseModel):
    """등급 생성 요청"""
    name: str = Field(..., min_length=1, max_length=20, description="등급명 (예: A+, A, A-, B+)")
    description: Optional[str] = Field(None, max_length=200, description="등급 설명")
    sort_order: int = Field(default=0, description="정렬 순서")
    is_default: bool = Field(default=False, description="기본 등급 여부")


class GradeUpdate(BaseModel):
    """등급 수정 요청"""
    name: Optional[str] = Field(None, min_length=1, max_length=20, description="등급명")
    description: Optional[str] = Field(None, max_length=200, description="등급 설명")
    sort_order: Optional[int] = Field(None, description="정렬 순서")
    is_default: Optional[bool] = Field(None, description="기본 등급 여부")
    is_active: Optional[bool] = Field(None, description="활성 상태")


class GradeResponse(BaseModel):
    """등급 응답"""
    id: UUID
    name: str
    description: Optional[str] = None
    sort_order: int
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class GradeListResponse(BaseModel):
    """등급 목록 응답"""
    grades: list[GradeResponse]
    total: int


class GradePriceUpdate(BaseModel):
    """등급별 가격 업데이트 요청"""
    model_id: UUID = Field(..., description="SSOT 모델 ID")
    grade_id: UUID = Field(..., description="등급 ID")
    price: int = Field(..., ge=0, description="가격 (원)")


class GradePriceBulkUpdate(BaseModel):
    """등급별 가격 일괄 업데이트 요청"""
    model_id: UUID = Field(..., description="SSOT 모델 ID")
    prices: list[dict] = Field(..., description="등급별 가격 목록 [{grade_id, price}, ...]")
