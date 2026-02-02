"""
단가표 통합 관리 시스템 - SSOT 모델 API
모델 CRUD, 등급별 가격 관리, 일괄 등록 (Bulk Registration)
"""

import uuid as uuid_module
import json
from uuid import UUID
from typing import Optional
from datetime import datetime, timedelta
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import redis.asyncio as redis

from app.core.database import get_db, get_redis
from app.api.deps import get_current_user, get_current_admin_user
from app.models.user import User
from app.models.ssot_model import SSOTModel
from app.models.grade import Grade
from app.models.grade_price import GradePrice
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction, DeviceType, Manufacturer, Connectivity
from app.schemas.ssot_model import (
    SSOTModelCreate,
    SSOTModelUpdate,
    SSOTModelResponse,
    SSOTModelListResponse,
    GradePriceInfo,
    BulkStorageValidateRequest,
    JsonBulkValidateRequest,
    ValidateRowResult,
    BulkValidateResponse,
    BulkValidateSummary,
    BulkCommitRequest,
    BulkCommitResponse,
)
from app.schemas.grade import GradePriceBulkUpdate
from app.schemas.common import SuccessResponse

router = APIRouter()

# Redis 키 접두어 및 TTL 설정
BULK_VALIDATE_KEY_PREFIX = "bulk_validate:"
BULK_VALIDATE_TTL = 1800  # 30분


@router.get("", response_model=SuccessResponse[SSOTModelListResponse])
async def list_models(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    device_type: Optional[DeviceType] = Query(None),
    manufacturer: Optional[Manufacturer] = Query(None),
    series: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """SSOT 모델 목록 조회"""
    query = select(SSOTModel)
    count_query = select(func.count(SSOTModel.id))
    
    # Viewer는 활성 모델만 조회
    if current_user.role.value == "viewer":
        query = query.where(SSOTModel.is_active == True)
        count_query = count_query.where(SSOTModel.is_active == True)
    elif is_active is not None:
        query = query.where(SSOTModel.is_active == is_active)
        count_query = count_query.where(SSOTModel.is_active == is_active)
    
    # 필터링
    if device_type:
        query = query.where(SSOTModel.device_type == device_type)
        count_query = count_query.where(SSOTModel.device_type == device_type)
    
    if manufacturer:
        query = query.where(SSOTModel.manufacturer == manufacturer)
        count_query = count_query.where(SSOTModel.manufacturer == manufacturer)
    
    if series:
        query = query.where(SSOTModel.series.ilike(f"%{series}%"))
        count_query = count_query.where(SSOTModel.series.ilike(f"%{series}%"))
    
    if search:
        search_filter = or_(
            SSOTModel.model_code.ilike(f"%{search}%"),
            SSOTModel.model_name.ilike(f"%{search}%"),
            SSOTModel.series.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    
    # 총 개수
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 페이지네이션
    offset = (page - 1) * page_size
    query = (
        query
        .options(selectinload(SSOTModel.grade_prices).selectinload(GradePrice.grade))
        .order_by(SSOTModel.device_type, SSOTModel.manufacturer, SSOTModel.series, SSOTModel.model_name)
        .offset(offset)
        .limit(page_size)
    )
    
    result = await db.execute(query)
    models = result.scalars().all()
    
    # 응답 변환
    model_responses = []
    for model in models:
        grade_prices = [
            GradePriceInfo(
                grade_id=gp.grade_id,
                grade_name=gp.grade.name,
                price=gp.price
            )
            for gp in model.grade_prices if gp.grade.is_active
        ]
        
        response = SSOTModelResponse(
            id=model.id,
            model_code=model.model_code,
            device_type=model.device_type,
            manufacturer=model.manufacturer,
            series=model.series,
            model_name=model.model_name,
            storage_gb=model.storage_gb,
            storage_display=model.storage_display,
            full_name=model.full_name,
            connectivity=model.connectivity,
            is_active=model.is_active,
            created_at=model.created_at,
            updated_at=model.updated_at,
            grade_prices=grade_prices
        )
        model_responses.append(response)
    
    return SuccessResponse(
        data=SSOTModelListResponse(models=model_responses, total=total)
    )


@router.post("", response_model=SuccessResponse[SSOTModelResponse], status_code=status.HTTP_201_CREATED)
async def create_model(
    model_data: SSOTModelCreate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """SSOT 모델 생성 (관리자 전용)"""
    # 모델코드 중복 확인
    result = await db.execute(
        select(SSOTModel).where(SSOTModel.model_code == model_data.model_code)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MODEL_CODE_EXISTS", "message": "이미 사용 중인 모델 코드입니다"}
        )
    
    # 모델 생성
    new_model = SSOTModel(**model_data.model_dump())
    db.add(new_model)
    await db.flush()
    
    # 감사로그
    audit_log = AuditLog(
        user_id=current_user.id,
        action=AuditAction.MODEL_CREATE,
        target_type="ssot_model",
        target_id=new_model.id,
        after_data=model_data.model_dump(mode="json"),
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(new_model)
    
    return SuccessResponse(
        data=SSOTModelResponse(
            id=new_model.id,
            model_code=new_model.model_code,
            device_type=new_model.device_type,
            manufacturer=new_model.manufacturer,
            series=new_model.series,
            model_name=new_model.model_name,
            storage_gb=new_model.storage_gb,
            storage_display=new_model.storage_display,
            full_name=new_model.full_name,
            connectivity=new_model.connectivity,
            is_active=new_model.is_active,
            created_at=new_model.created_at,
            updated_at=new_model.updated_at,
            grade_prices=[]
        )
    )


@router.get("/{model_id}", response_model=SuccessResponse[SSOTModelResponse])
async def get_model(
    model_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """SSOT 모델 상세 조회"""
    query = (
        select(SSOTModel)
        .where(SSOTModel.id == model_id)
        .options(selectinload(SSOTModel.grade_prices).selectinload(GradePrice.grade))
    )
    
    result = await db.execute(query)
    model = result.scalar_one_or_none()
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "MODEL_NOT_FOUND", "message": "모델을 찾을 수 없습니다"}
        )
    
    # Viewer는 비활성 모델 조회 불가
    if current_user.role.value == "viewer" and not model.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "MODEL_NOT_FOUND", "message": "모델을 찾을 수 없습니다"}
        )
    
    grade_prices = [
        GradePriceInfo(
            grade_id=gp.grade_id,
            grade_name=gp.grade.name,
            price=gp.price
        )
        for gp in model.grade_prices if gp.grade.is_active
    ]
    
    return SuccessResponse(
        data=SSOTModelResponse(
            id=model.id,
            model_code=model.model_code,
            device_type=model.device_type,
            manufacturer=model.manufacturer,
            series=model.series,
            model_name=model.model_name,
            storage_gb=model.storage_gb,
            storage_display=model.storage_display,
            full_name=model.full_name,
            connectivity=model.connectivity,
            is_active=model.is_active,
            created_at=model.created_at,
            updated_at=model.updated_at,
            grade_prices=grade_prices
        )
    )


@router.patch("/{model_id}", response_model=SuccessResponse[SSOTModelResponse])
async def update_model(
    model_id: UUID,
    model_data: SSOTModelUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """SSOT 모델 수정 (관리자 전용)"""
    result = await db.execute(
        select(SSOTModel)
        .where(SSOTModel.id == model_id)
        .options(selectinload(SSOTModel.grade_prices).selectinload(GradePrice.grade))
    )
    model = result.scalar_one_or_none()
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "MODEL_NOT_FOUND", "message": "모델을 찾을 수 없습니다"}
        )
    
    # 모델코드 중복 확인
    if model_data.model_code and model_data.model_code != model.model_code:
        dup_result = await db.execute(
            select(SSOTModel).where(SSOTModel.model_code == model_data.model_code)
        )
        if dup_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "MODEL_CODE_EXISTS", "message": "이미 사용 중인 모델 코드입니다"}
            )
    
    # 변경 전 데이터
    before_data = {
        "model_code": model.model_code,
        "device_type": model.device_type.value,
        "manufacturer": model.manufacturer.value,
        "series": model.series,
        "model_name": model.model_name,
        "storage_gb": model.storage_gb,
        "connectivity": model.connectivity.value,
        "is_active": model.is_active,
    }
    
    # 업데이트
    update_fields = model_data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(model, field, value)
    
    # 변경 후 데이터
    after_data = {
        "model_code": model.model_code,
        "device_type": model.device_type.value,
        "manufacturer": model.manufacturer.value,
        "series": model.series,
        "model_name": model.model_name,
        "storage_gb": model.storage_gb,
        "connectivity": model.connectivity.value,
        "is_active": model.is_active,
    }
    
    # 감사로그
    action = AuditAction.MODEL_DEACTIVATE if "is_active" in update_fields and not model.is_active else AuditAction.MODEL_UPDATE
    audit_log = AuditLog(
        user_id=current_user.id,
        action=action,
        target_type="ssot_model",
        target_id=model.id,
        before_data=before_data,
        after_data=after_data,
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(model)
    
    grade_prices = [
        GradePriceInfo(
            grade_id=gp.grade_id,
            grade_name=gp.grade.name,
            price=gp.price
        )
        for gp in model.grade_prices if gp.grade.is_active
    ]
    
    return SuccessResponse(
        data=SSOTModelResponse(
            id=model.id,
            model_code=model.model_code,
            device_type=model.device_type,
            manufacturer=model.manufacturer,
            series=model.series,
            model_name=model.model_name,
            storage_gb=model.storage_gb,
            storage_display=model.storage_display,
            full_name=model.full_name,
            connectivity=model.connectivity,
            is_active=model.is_active,
            created_at=model.created_at,
            updated_at=model.updated_at,
            grade_prices=grade_prices
        )
    )


@router.put("/{model_id}/prices", response_model=SuccessResponse[SSOTModelResponse])
async def update_model_prices(
    model_id: UUID,
    price_data: GradePriceBulkUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """모델 등급별 가격 일괄 업데이트 (관리자 전용)"""
    if price_data.model_id != model_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MODEL_ID_MISMATCH", "message": "모델 ID가 일치하지 않습니다"}
        )
    
    result = await db.execute(
        select(SSOTModel)
        .where(SSOTModel.id == model_id)
        .options(selectinload(SSOTModel.grade_prices).selectinload(GradePrice.grade))
    )
    model = result.scalar_one_or_none()
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "MODEL_NOT_FOUND", "message": "모델을 찾을 수 없습니다"}
        )
    
    # 기존 가격 매핑
    existing_prices = {str(gp.grade_id): gp for gp in model.grade_prices}
    before_prices = {str(gp.grade_id): gp.price for gp in model.grade_prices}
    after_prices = {}
    
    # 가격 업데이트
    for price_item in price_data.prices:
        grade_id = str(price_item.get("grade_id"))
        price = price_item.get("price")
        
        if grade_id in existing_prices:
            # 기존 가격 업데이트
            existing_prices[grade_id].price = price
            existing_prices[grade_id].version += 1
        else:
            # 새 가격 생성
            new_price = GradePrice(
                model_id=model_id,
                grade_id=UUID(grade_id),
                price=price,
            )
            db.add(new_price)
        
        after_prices[grade_id] = price
    
    # 감사로그
    audit_log = AuditLog(
        user_id=current_user.id,
        action=AuditAction.PRICE_UPDATE,
        target_type="grade_price",
        target_id=model_id,
        before_data=before_prices,
        after_data=after_prices,
        description=f"모델 {model.model_code} 등급별 가격 업데이트"
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(model)
    
    # 새로 조회
    result = await db.execute(
        select(SSOTModel)
        .where(SSOTModel.id == model_id)
        .options(selectinload(SSOTModel.grade_prices).selectinload(GradePrice.grade))
    )
    model = result.scalar_one()
    
    grade_prices = [
        GradePriceInfo(
            grade_id=gp.grade_id,
            grade_name=gp.grade.name,
            price=gp.price
        )
        for gp in model.grade_prices if gp.grade.is_active
    ]
    
    return SuccessResponse(
        data=SSOTModelResponse(
            id=model.id,
            model_code=model.model_code,
            device_type=model.device_type,
            manufacturer=model.manufacturer,
            series=model.series,
            model_name=model.model_name,
            storage_gb=model.storage_gb,
            storage_display=model.storage_display,
            full_name=model.full_name,
            connectivity=model.connectivity,
            is_active=model.is_active,
            created_at=model.created_at,
            updated_at=model.updated_at,
            grade_prices=grade_prices
        )
    )


# ============================================================================
# 일괄 등록 (Bulk Registration) API
# ============================================================================

def _get_storage_display(storage_gb: int) -> str:
    """스토리지 표시 문자열 생성 (예: 256GB, 1TB)"""
    if storage_gb >= 1024:
        return f"{storage_gb // 1024}TB"
    return f"{storage_gb}GB"


def _get_full_name(model_name: str, storage_gb: int) -> str:
    """전체 모델명 생성 (예: iPhone 15 Pro Max 256GB)"""
    return f"{model_name} {_get_storage_display(storage_gb)}"


async def _get_existing_model_codes(db: AsyncSession) -> set[str]:
    """기존 DB에 등록된 모델코드 조회 (한 번에)"""
    result = await db.execute(select(SSOTModel.model_code))
    return set(row[0] for row in result.fetchall())


def _find_internal_duplicates(codes: list[str]) -> set[str]:
    """입력 데이터 내 중복된 코드 찾기"""
    counter = Counter(codes)
    return {code for code, count in counter.items() if count > 1}


def _validate_connectivity_for_device(device_type: DeviceType, connectivity: Connectivity) -> Optional[str]:
    """연결성 유효성 검사 (기기 타입에 따라)"""
    if device_type == DeviceType.SMARTPHONE and connectivity != Connectivity.LTE:
        return "스마트폰은 LTE만 선택 가능합니다"
    elif device_type == DeviceType.WEARABLE and connectivity != Connectivity.STANDARD:
        return "웨어러블은 Standard만 선택 가능합니다"
    elif device_type == DeviceType.TABLET and connectivity not in [Connectivity.WIFI, Connectivity.WIFI_CELLULAR]:
        return "태블릿은 WiFi 또는 WiFi+Cellular만 선택 가능합니다"
    return None


async def _validate_bulk_models(
    models_data: list[dict],
    db: AsyncSession,
    redis_client: redis.Redis,
    method: str  # "multi_storage" 또는 "json_bulk"
) -> BulkValidateResponse:
    """
    일괄 등록 검증 공통 로직
    
    1. 기존 DB 모델코드 중복 검사
    2. 입력 내부 중복 검사
    3. 필수값/enum 검증
    4. 검증 결과 Redis에 캐싱
    """
    validation_id = str(uuid_module.uuid4())
    results: list[ValidateRowResult] = []
    valid_count = 0
    error_count = 0
    duplicate_count = 0
    
    # 1. 기존 DB 모델코드 조회 (한 번에)
    existing_codes = await _get_existing_model_codes(db)
    
    # 2. 입력 내부 중복 체크
    input_codes = [m.get("model_code", "") for m in models_data]
    internal_duplicates = _find_internal_duplicates(input_codes)
    
    # 요약 정보
    manufacturer_counter: Counter = Counter()
    series_counter: Counter = Counter()
    
    # 3. 각 행 검증
    for idx, model_data in enumerate(models_data):
        model_code = model_data.get("model_code", "")
        model_name = model_data.get("model_name", "")
        storage_gb = model_data.get("storage_gb", 0)
        full_name = _get_full_name(model_name, storage_gb)
        
        errors = []
        
        # 필수값 검증
        if not model_code:
            errors.append("모델코드 필수")
        if not model_data.get("device_type"):
            errors.append("기기타입 필수")
        if not model_data.get("manufacturer"):
            errors.append("제조사 필수")
        if not model_data.get("series"):
            errors.append("시리즈 필수")
        if not model_name:
            errors.append("모델명 필수")
        if not storage_gb or storage_gb <= 0:
            errors.append("스토리지 필수")
        if not model_data.get("connectivity"):
            errors.append("연결성 필수")
        
        # enum 검증
        try:
            device_type = DeviceType(model_data.get("device_type", ""))
        except ValueError:
            errors.append("유효하지 않은 기기타입")
            device_type = None
        
        try:
            manufacturer = Manufacturer(model_data.get("manufacturer", ""))
        except ValueError:
            errors.append("유효하지 않은 제조사")
            manufacturer = None
        
        try:
            connectivity = Connectivity(model_data.get("connectivity", ""))
        except ValueError:
            errors.append("유효하지 않은 연결성")
            connectivity = None
        
        # 연결성-기기타입 검증
        if device_type and connectivity:
            conn_error = _validate_connectivity_for_device(device_type, connectivity)
            if conn_error:
                errors.append(conn_error)
        
        # 중복 검증
        if model_code in existing_codes:
            status_str = "duplicate"
            error_message = "이미 등록된 모델코드"
            duplicate_count += 1
        elif model_code in internal_duplicates:
            status_str = "duplicate"
            error_message = "입력 데이터 내 중복"
            duplicate_count += 1
        elif errors:
            status_str = "error"
            error_message = ", ".join(errors)
            error_count += 1
        else:
            status_str = "valid"
            error_message = None
            valid_count += 1
            
            # 요약 정보 업데이트 (유효한 것만)
            if manufacturer:
                manufacturer_counter[manufacturer.value] += 1
            series_counter[model_data.get("series", "")] += 1
        
        results.append(ValidateRowResult(
            row_index=idx,
            model_code=model_code,
            full_name=full_name,
            status=status_str,
            error_message=error_message,
            data=model_data
        ))
    
    # 4. Redis에 검증 결과 저장 (유효한 모델 데이터만)
    valid_models = [r.data for r in results if r.status == "valid"]
    cache_data = {
        "method": method,
        "models": valid_models,
        "created_at": datetime.utcnow().isoformat(),
    }
    await redis_client.setex(
        f"{BULK_VALIDATE_KEY_PREFIX}{validation_id}",
        BULK_VALIDATE_TTL,
        json.dumps(cache_data)
    )
    
    expires_at = datetime.utcnow() + timedelta(seconds=BULK_VALIDATE_TTL)
    
    return BulkValidateResponse(
        validation_id=validation_id,
        total_count=len(models_data),
        valid_count=valid_count,
        error_count=error_count,
        duplicate_count=duplicate_count,
        preview=results,
        summary=BulkValidateSummary(
            by_manufacturer=dict(manufacturer_counter),
            by_series=dict(series_counter)
        ),
        expires_at=expires_at
    )


@router.post("/bulk/storage/validate", response_model=SuccessResponse[BulkValidateResponse])
async def validate_bulk_storage(
    request: BulkStorageValidateRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    다중 스토리지 일괄 생성 - 검증 (관리자 전용)
    
    공통 정보(타입/제조사/시리즈/모델명/연결성)와 스토리지 목록을 받아
    생성될 모델 목록을 검증하고 프리뷰를 반환합니다.
    
    - 모델코드: {접두어}{스토리지} 형식으로 자동 생성 (예: IP15PM-256)
    - 검증 결과는 30분간 유효하며, commit API에서 사용됩니다.
    """
    # 스토리지별 모델 데이터 생성
    models_data = []
    for storage in request.storage_list:
        # 모델코드 생성: 접두어 + 스토리지 (1TB 이상은 TB 표기)
        storage_suffix = f"{storage // 1024}TB" if storage >= 1024 else str(storage)
        model_code = f"{request.model_code_prefix}{storage_suffix}"
        
        models_data.append({
            "model_code": model_code,
            "device_type": request.device_type.value,
            "manufacturer": request.manufacturer.value,
            "series": request.series,
            "model_name": request.model_name,
            "storage_gb": storage,
            "connectivity": request.connectivity.value,
        })
    
    result = await _validate_bulk_models(models_data, db, redis_client, "multi_storage")
    return SuccessResponse(data=result)


@router.post("/bulk/json/validate", response_model=SuccessResponse[BulkValidateResponse])
async def validate_bulk_json(
    request: JsonBulkValidateRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    JSON 일괄 등록 - 검증 (관리자 전용)
    
    여러 모델 정보를 JSON 배열로 받아 검증하고 프리뷰를 반환합니다.
    
    - 검증 결과는 30분간 유효하며, commit API에서 사용됩니다.
    - 부분 성공은 허용되지 않습니다 (검증 통과 모델만 커밋 가능).
    """
    # SSOTModelCreate 스키마에서 dict로 변환
    models_data = [
        {
            "model_code": m.model_code,
            "device_type": m.device_type.value,
            "manufacturer": m.manufacturer.value,
            "series": m.series,
            "model_name": m.model_name,
            "storage_gb": m.storage_gb,
            "connectivity": m.connectivity.value,
        }
        for m in request.models
    ]
    
    result = await _validate_bulk_models(models_data, db, redis_client, "json_bulk")
    return SuccessResponse(data=result)


@router.post("/bulk/commit", response_model=SuccessResponse[BulkCommitResponse], status_code=status.HTTP_201_CREATED)
async def commit_bulk(
    request: BulkCommitRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    일괄 등록 커밋 (관리자 전용)
    
    validate API에서 받은 validation_id로 검증된 모델들을 실제로 생성합니다.
    
    - 단일 트랜잭션으로 처리되며, 하나라도 실패하면 전체 롤백됩니다.
    - 감사로그는 trace_id로 묶어서 기록됩니다.
    """
    # Redis에서 검증 결과 조회
    cache_key = f"{BULK_VALIDATE_KEY_PREFIX}{request.validation_id}"
    cached_data = await redis_client.get(cache_key)
    
    if not cached_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "VALIDATION_EXPIRED",
                "message": "검증 결과가 만료되었거나 존재하지 않습니다. 다시 검증해주세요."
            }
        )
    
    try:
        cache_data = json.loads(cached_data)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CACHE_ERROR",
                "message": "캐시 데이터 파싱에 실패했습니다."
            }
        )
    
    models_data = cache_data.get("models", [])
    method = cache_data.get("method", "unknown")
    
    if not models_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "NO_VALID_MODELS",
                "message": "생성할 유효한 모델이 없습니다."
            }
        )
    
    # 커밋 전 중복 재확인 (검증 후 다른 사용자가 등록했을 수 있음)
    existing_codes = await _get_existing_model_codes(db)
    new_codes = [m.get("model_code") for m in models_data]
    duplicates = [code for code in new_codes if code in existing_codes]
    
    if duplicates:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "DUPLICATE_FOUND",
                "message": f"검증 후 중복 모델코드가 발견되었습니다: {', '.join(duplicates)}"
            }
        )
    
    # trace_id 생성 (감사로그 묶음)
    trace_id = str(uuid_module.uuid4())
    
    # 모델 일괄 생성
    created_models: list[SSOTModel] = []
    try:
        for model_data in models_data:
            new_model = SSOTModel(
                model_code=model_data["model_code"],
                device_type=DeviceType(model_data["device_type"]),
                manufacturer=Manufacturer(model_data["manufacturer"]),
                series=model_data["series"],
                model_name=model_data["model_name"],
                storage_gb=model_data["storage_gb"],
                connectivity=Connectivity(model_data["connectivity"]),
            )
            db.add(new_model)
            created_models.append(new_model)
        
        await db.flush()
        
        # 감사로그 기록 (trace_id로 묶음)
        created_models_summary = [
            {
                "model_code": m.model_code,
                "full_name": m.full_name,
                "manufacturer": m.manufacturer.value,
                "series": m.series,
            }
            for m in created_models
        ]
        
        audit_log = AuditLog(
            trace_id=UUID(trace_id),
            user_id=current_user.id,
            action=AuditAction.MODEL_BULK_CREATE,
            target_type="ssot_model",
            target_id=None,  # 복수 대상이므로 None
            before_data=None,
            after_data={
                "created_count": len(created_models),
                "method": method,
                "created_models": created_models_summary,
            },
            description=f"일괄 등록 ({method}): {len(created_models)}개 모델 생성"
        )
        db.add(audit_log)
        
        await db.commit()
        
        # 사용한 캐시 삭제
        await redis_client.delete(cache_key)
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "COMMIT_FAILED",
                "message": f"모델 생성에 실패했습니다: {str(e)}"
            }
        )
    
    # 응답 생성
    created_responses = [
        SSOTModelResponse(
            id=m.id,
            model_code=m.model_code,
            device_type=m.device_type,
            manufacturer=m.manufacturer,
            series=m.series,
            model_name=m.model_name,
            storage_gb=m.storage_gb,
            storage_display=m.storage_display,
            full_name=m.full_name,
            connectivity=m.connectivity,
            is_active=m.is_active,
            created_at=m.created_at,
            updated_at=m.updated_at,
            grade_prices=[]
        )
        for m in created_models
    ]
    
    return SuccessResponse(
        data=BulkCommitResponse(
            trace_id=trace_id,
            created_count=len(created_models),
            created_models=created_responses
        )
    )
