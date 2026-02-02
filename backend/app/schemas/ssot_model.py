"""
단가표 통합 관리 시스템 - SSOT 모델 스키마
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.enums import DeviceType, Manufacturer, Connectivity


class SSOTModelCreate(BaseModel):
    """SSOT 모델 생성 요청"""
    model_code: str = Field(..., min_length=1, max_length=50, description="모델 코드")
    device_type: DeviceType = Field(..., description="기기 타입")
    manufacturer: Manufacturer = Field(..., description="제조사")
    series: str = Field(..., min_length=1, max_length=100, description="시리즈")
    model_name: str = Field(..., min_length=1, max_length=200, description="모델명")
    storage_gb: int = Field(..., gt=0, description="스토리지 (GB)")
    connectivity: Connectivity = Field(..., description="연결성")
    
    @field_validator("connectivity")
    @classmethod
    def validate_connectivity(cls, v: Connectivity, info) -> Connectivity:
        """연결성 유효성 검사 (기기 타입에 따라)"""
        device_type = info.data.get("device_type")
        
        if device_type == DeviceType.SMARTPHONE and v != Connectivity.LTE:
            raise ValueError("스마트폰은 LTE만 선택 가능합니다")
        elif device_type == DeviceType.WEARABLE and v != Connectivity.STANDARD:
            raise ValueError("웨어러블은 Standard만 선택 가능합니다")
        elif device_type == DeviceType.TABLET and v not in [Connectivity.WIFI, Connectivity.WIFI_CELLULAR]:
            raise ValueError("태블릿은 WiFi 또는 WiFi+Cellular만 선택 가능합니다")
        
        return v


class SSOTModelUpdate(BaseModel):
    """SSOT 모델 수정 요청"""
    model_code: Optional[str] = Field(None, min_length=1, max_length=50, description="모델 코드")
    device_type: Optional[DeviceType] = Field(None, description="기기 타입")
    manufacturer: Optional[Manufacturer] = Field(None, description="제조사")
    series: Optional[str] = Field(None, min_length=1, max_length=100, description="시리즈")
    model_name: Optional[str] = Field(None, min_length=1, max_length=200, description="모델명")
    storage_gb: Optional[int] = Field(None, gt=0, description="스토리지 (GB)")
    connectivity: Optional[Connectivity] = Field(None, description="연결성")
    is_active: Optional[bool] = Field(None, description="활성 상태")


class GradePriceInfo(BaseModel):
    """등급별 가격 정보"""
    grade_id: UUID
    grade_name: str
    price: int
    
    class Config:
        from_attributes = True


class SSOTModelResponse(BaseModel):
    """SSOT 모델 응답"""
    id: UUID
    model_code: str
    device_type: DeviceType
    manufacturer: Manufacturer
    series: str
    model_name: str
    storage_gb: int
    storage_display: str
    full_name: str
    connectivity: Connectivity
    is_active: bool
    created_at: datetime
    updated_at: datetime
    grade_prices: Optional[list[GradePriceInfo]] = None
    
    class Config:
        from_attributes = True


class SSOTModelListResponse(BaseModel):
    """SSOT 모델 목록 응답"""
    models: list[SSOTModelResponse]
    total: int


class SSOTModelFilter(BaseModel):
    """SSOT 모델 필터"""
    device_type: Optional[DeviceType] = None
    manufacturer: Optional[Manufacturer] = None
    series: Optional[str] = None
    search: Optional[str] = Field(None, description="모델명/모델코드 검색")
    is_active: Optional[bool] = None
