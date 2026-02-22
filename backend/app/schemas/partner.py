"""
단가표 통합 관리 시스템 - 거래처 스키마
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PartnerCreate(BaseModel):
    """거래처 생성 요청"""
    name: str = Field(..., min_length=1, max_length=100, description="거래처명")
    region: Optional[str] = Field(None, max_length=100, description="지역")
    contact_info: Optional[str] = Field(None, max_length=200, description="연락처")
    memo: Optional[str] = Field(None, description="운영 메모")


class PartnerUpdate(BaseModel):
    """거래처 수정 요청"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="거래처명")
    region: Optional[str] = Field(None, max_length=100, description="지역")
    contact_info: Optional[str] = Field(None, max_length=200, description="연락처")
    memo: Optional[str] = Field(None, description="운영 메모")
    is_active: Optional[bool] = Field(None, description="활성 상태")


class PartnerResponse(BaseModel):
    """거래처 응답"""
    id: UUID
    name: str
    region: Optional[str] = None
    contact_info: Optional[str] = None
    memo: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    price_count: Optional[int] = None  # 등록된 가격 수
    last_upload_at: Optional[datetime] = None  # 최근 업로드 일시
    is_favorite: bool = False  # 현재 사용자의 즐겨찾기 여부 (API 레이어에서 주입)
    
    class Config:
        from_attributes = True


class PartnerListResponse(BaseModel):
    """거래처 목록 응답"""
    partners: list[PartnerResponse]
    total: int


class PartnerMappingResponse(BaseModel):
    """거래처 매핑 응답"""
    id: UUID
    partner_id: UUID
    model_id: UUID
    partner_expression: str
    confidence: float
    is_manual: bool
    created_at: datetime
    
    class Config:
        from_attributes = True
