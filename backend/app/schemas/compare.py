"""
단가표 통합 관리 시스템 - 비교 스키마
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CompareModelPrice(BaseModel):
    """비교용 모델별 가격 정보"""
    model_id: UUID
    model_code: str
    model_name: str
    storage_display: str
    hq_price: Optional[int] = Field(None, description="본사 가격")
    partner_prices: dict[str, Optional[int]] = Field(
        default_factory=dict,
        description="거래처별 가격 {partner_id: price}"
    )
    min_price: Optional[int] = Field(None, description="최저가")
    max_price: Optional[int] = Field(None, description="최고가")
    min_partner_id: Optional[UUID] = Field(None, description="최저가 거래처 ID")
    max_partner_id: Optional[UUID] = Field(None, description="최고가 거래처 ID")


class CompareResponse(BaseModel):
    """비교 응답"""
    grade_id: UUID
    grade_name: str
    partners: list[dict] = Field(..., description="거래처 목록 [{id, name}, ...]")
    models: list[CompareModelPrice] = Field(..., description="모델별 가격 비교")
    updated_at: datetime = Field(..., description="데이터 기준 시점")


class CompareListAddRequest(BaseModel):
    """비교 리스트 모델 추가 요청"""
    model_ids: list[UUID] = Field(..., description="추가할 모델 ID 목록")


class CompareListRemoveRequest(BaseModel):
    """비교 리스트 모델 제거 요청"""
    model_ids: list[UUID] = Field(..., description="제거할 모델 ID 목록")


class CompareListReorderRequest(BaseModel):
    """비교 리스트 순서 변경 요청"""
    model_orders: list[dict] = Field(
        ...,
        description="모델 순서 목록 [{model_id, sort_order}, ...]"
    )


class HQPriceListItem(BaseModel):
    """본사 단가 리스트 항목"""
    model_id: UUID
    model_code: str
    device_type: str
    manufacturer: str
    series: str
    model_name: str
    storage_display: str
    full_name: str
    connectivity: str
    grade_id: UUID
    grade_name: str
    price: int
    applied_at: datetime
    is_favorite: bool = False
    
    class Config:
        from_attributes = True


class HQPriceListResponse(BaseModel):
    """본사 단가 리스트 응답"""
    items: list[HQPriceListItem]
    total: int
    applied_at: datetime
    applied_version: int
    applied_memo: Optional[str] = None
