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
    """SSOT 모델 수정 요청
    
    불변 필드 (수정 불가):
    - model_key: 불변 식별자
    - model_code: model_key + storage 조합
    - storage_gb: model_code에 영향을 주므로 불변
    
    수정 가능 필드:
    - model_name: 표시용 이름만 변경 가능
    - device_type, manufacturer, series: 분류 정보 변경 가능
    - connectivity, is_active: 상태 변경 가능
    """
    # model_code: 제거됨 (불변)
    # model_key: 제거됨 (불변)
    # storage_gb: 제거됨 (model_code에 영향)
    device_type: Optional[DeviceType] = Field(None, description="기기 타입")
    manufacturer: Optional[Manufacturer] = Field(None, description="제조사")
    series: Optional[str] = Field(None, min_length=1, max_length=100, description="시리즈")
    model_name: Optional[str] = Field(None, min_length=1, max_length=200, description="모델명 (표시용)")
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
    model_key: str  # 불변 식별자 (동일 기종 공유)
    model_code: str  # 불변 코드 (model_key + storage)
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


class JsonBulkModelInput(BaseModel):
    """JSON 일괄 등록 입력 모델
    
    model_code/model_key는 서버에서 자동 생성됩니다.
    storage_gb를 배열로 입력하면 각 스토리지별로 개별 모델이 생성됩니다.
    """
    device_type: DeviceType = Field(..., description="기기 타입")
    manufacturer: Manufacturer = Field(..., description="제조사")
    series: str = Field(..., min_length=1, max_length=100, description="시리즈")
    model_name: str = Field(..., min_length=1, max_length=200, description="모델명")
    storage_gb: list[int] = Field(..., min_length=1, description="스토리지 배열 (GB)")
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
    
    @field_validator("storage_gb")
    @classmethod
    def validate_storage_list(cls, v: list[int]) -> list[int]:
        """스토리지 배열 검증: 정수, 오름차순 정렬, 중복 제거, 허용 범위"""
        if not v:
            raise ValueError("스토리지를 최소 1개 이상 입력해야 합니다")
        # 중복 제거 + 정렬
        unique_sorted = sorted(set(v))
        # 허용 범위 검증 (8GB ~ 2TB)
        for storage in unique_sorted:
            if storage < 8 or storage > 2048:
                raise ValueError(f"스토리지 범위 오류: {storage}GB (8~2048GB)")
        return unique_sorted


class JsonBulkValidateRequest(BaseModel):
    """JSON 일괄 등록 - 검증 요청
    
    여러 모델을 JSON 배열로 한 번에 등록
    model_code/model_key는 서버에서 자동 생성됩니다.
    """
    models: list[JsonBulkModelInput] = Field(..., min_length=1, description="등록할 모델 목록")


class ValidateRowResult(BaseModel):
    """검증 결과 - 개별 행"""
    row_index: int = Field(..., description="행 인덱스 (0부터 시작)")
    model_key: str = Field(..., description="불변 모델 키 (동일 기종 공유)")
    model_code: str = Field(..., description="모델 코드 (model_key + storage)")
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


# ============================================================================
# 등급별 가격 일괄 설정 스키마
# ============================================================================

class GradePriceItem(BaseModel):
    """등급별 가격 항목"""
    grade_id: UUID = Field(..., description="등급 ID")
    price: int = Field(..., ge=0, description="가격 (원)")


class BulkPriceSetRequest(BaseModel):
    """등급별 가격 일괄 설정 요청 - model_key 기준
    
    동일 기종(model_key)의 여러 스토리지 모델에 한 번에 가격 설정
    """
    model_key: str = Field(..., min_length=1, description="대상 model_key (동일 기종 식별)")
    prices: list[GradePriceItem] = Field(..., min_length=1, description="등급별 가격 목록")


class BulkPriceSetByIdsRequest(BaseModel):
    """등급별 가격 일괄 설정 요청 - 모델 ID 목록 기준"""
    model_ids: list[UUID] = Field(..., min_length=1, description="대상 모델 ID 목록")
    prices: list[GradePriceItem] = Field(..., min_length=1, description="등급별 가격 목록")


class BulkPriceSetResponse(BaseModel):
    """등급별 가격 일괄 설정 응답"""
    model_key: Optional[str] = Field(None, description="대상 model_key")
    affected_models: int = Field(..., description="영향받은 모델 수")
    updated_prices: int = Field(..., description="업데이트된 가격 수")
    model_codes: list[str] = Field(..., description="영향받은 모델 코드 목록")