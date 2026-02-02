"""
단가표 통합 관리 시스템 - 차감 스키마
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# === 차감 레벨 스키마 ===

class DeductionLevelCreate(BaseModel):
    """차감 레벨 생성 요청"""
    name: str = Field(..., min_length=1, max_length=50, description="레벨명 (예: L1, L2, 중상, 상)")
    amount: int = Field(..., ge=0, description="차감 금액 (원)")
    sort_order: int = Field(default=0, description="정렬 순서")


class DeductionLevelUpdate(BaseModel):
    """차감 레벨 수정 요청"""
    name: Optional[str] = Field(None, min_length=1, max_length=50, description="레벨명")
    amount: Optional[int] = Field(None, ge=0, description="차감 금액 (원)")
    sort_order: Optional[int] = Field(None, description="정렬 순서")
    is_active: Optional[bool] = Field(None, description="활성 상태")


class DeductionLevelResponse(BaseModel):
    """차감 레벨 응답"""
    id: UUID
    item_id: UUID
    name: str
    amount: int
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# === 차감 항목 스키마 ===

class DeductionItemCreate(BaseModel):
    """차감 항목 생성 요청"""
    name: str = Field(..., min_length=1, max_length=100, description="항목명 (예: 내부 잔상, 서브 잔상)")
    description: Optional[str] = Field(None, max_length=500, description="항목 설명")
    sort_order: int = Field(default=0, description="정렬 순서")
    levels: Optional[list[DeductionLevelCreate]] = Field(None, description="레벨 목록")


class DeductionItemUpdate(BaseModel):
    """차감 항목 수정 요청"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="항목명")
    description: Optional[str] = Field(None, max_length=500, description="항목 설명")
    sort_order: Optional[int] = Field(None, description="정렬 순서")
    is_active: Optional[bool] = Field(None, description="활성 상태")


class DeductionItemResponse(BaseModel):
    """차감 항목 응답"""
    id: UUID
    name: str
    description: Optional[str] = None
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    levels: list[DeductionLevelResponse] = []
    
    class Config:
        from_attributes = True


class DeductionItemListResponse(BaseModel):
    """차감 항목 목록 응답"""
    items: list[DeductionItemResponse]
    total: int
