"""
단가표 통합 관리 시스템 - SSOT 모델 API
모델 CRUD, 등급별 가격 관리
"""

from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_admin_user
from app.models.user import User
from app.models.ssot_model import SSOTModel
from app.models.grade import Grade
from app.models.grade_price import GradePrice
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction, DeviceType, Manufacturer
from app.schemas.ssot_model import (
    SSOTModelCreate,
    SSOTModelUpdate,
    SSOTModelResponse,
    SSOTModelListResponse,
    GradePriceInfo,
)
from app.schemas.grade import GradePriceBulkUpdate
from app.schemas.common import SuccessResponse

router = APIRouter()


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
