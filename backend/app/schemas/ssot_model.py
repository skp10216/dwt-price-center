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


# ============================================================================
# 일괄 등록 (Bulk Registration) 스키마
# ============================================================================

class BulkStorageValidateRequest(BaseModel):
    """다중 스토리지 일괄 생성 - 검증 요청
    
    동일 모델의 공통 정보를 1번 입력하고 스토리지(GB)를 여러 개 선택하면
    선택한 스토리지 개수만큼 모델이 한 번에 생성됨
    """
    device_type: DeviceType = Field(..., description="기기 타입")
    manufacturer: Manufacturer = Field(..., description="제조사")
    series: str = Field(..., min_length=1, max_length=100, description="시리즈")
    model_name: str = Field(..., min_length=1, max_length=200, description="모델명")
    connectivity: Connectivity = Field(..., description="연결성")
    storage_list: list[int] = Field(..., min_length=1, description="스토리지 목록 (GB 단위, 예: [64, 128, 256])")
    model_code_prefix: str = Field(..., min_length=1, max_length=40, description="모델코드 접두어 (예: IP15PM-)")
    
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
    
    @field_validator("storage_list")
    @classmethod
    def validate_storage_list(cls, v: list[int]) -> list[int]:
        """스토리지 목록 유효성 검사"""
        if not v:
            raise ValueError("스토리지를 최소 1개 이상 선택해야 합니다")
        if len(v) != len(set(v)):
            raise ValueError("중복된 스토리지가 있습니다")
        for storage in v:
            if storage <= 0:
                raise ValueError("스토리지는 0보다 커야 합니다")
        return sorted(v)  # 정렬하여 반환


class JsonBulkValidateRequest(BaseModel):
    """JSON 일괄 등록 - 검증 요청
    
    여러 모델을 JSON 배열로 한 번에 등록
    """
    models: list[SSOTModelCreate] = Field(..., min_length=1, description="등록할 모델 목록")


class ValidateRowResult(BaseModel):
    """검증 결과 - 개별 행"""
    row_index: int = Field(..., description="행 인덱스 (0부터 시작)")
    model_code: str = Field(..., description="모델 코드")
    full_name: str = Field(..., description="전체 모델명 (예: iPhone 15 Pro Max 256GB)")
    status: str = Field(..., description="검증 상태: valid, error, duplicate")
    error_message: Optional[str] = Field(None, description="오류 메시지 (status가 error/duplicate일 때)")
    data: dict = Field(..., description="생성될 모델 데이터")


class BulkValidateSummary(BaseModel):
    """검증 결과 요약 (ConfirmDialog용)"""
    by_manufacturer: dict[str, int] = Field(default_factory=dict, description="제조사별 카운트")
    by_series: dict[str, int] = Field(default_factory=dict, description="시리즈별 카운트")


class BulkValidateResponse(BaseModel):
    """일괄 등록 검증 응답"""
    validation_id: str = Field(..., description="검증 ID (커밋 시 사용)")
    total_count: int = Field(..., description="총 입력 개수")
    valid_count: int = Field(..., description="유효한 개수")
    error_count: int = Field(..., description="오류 개수")
    duplicate_count: int = Field(..., description="중복 개수")
    preview: list[ValidateRowResult] = Field(..., description="프리뷰 목록")
    summary: BulkValidateSummary = Field(..., description="제조사/시리즈별 요약")
    expires_at: datetime = Field(..., description="검증 결과 만료 시간")


class BulkCommitRequest(BaseModel):
    """일괄 등록 커밋 요청"""
    validation_id: str = Field(..., description="검증 ID")


class BulkCommitResponse(BaseModel):
    """일괄 등록 커밋 응답"""
    trace_id: str = Field(..., description="감사로그 추적 ID")
    created_count: int = Field(..., description="생성된 모델 수")
    created_models: list[SSOTModelResponse] = Field(..., description="생성된 모델 목록")