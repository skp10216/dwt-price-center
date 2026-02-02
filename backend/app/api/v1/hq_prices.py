"""
단가표 통합 관리 시스템 - 본사 단가 API
본사 판매 단가 리스트 조회
"""

from typing import Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.ssot_model import SSOTModel
from app.models.grade import Grade
from app.models.grade_price import GradePrice
from app.models.user_list import UserFavorite
from app.models.hq_price_apply import HQPriceApply
from app.models.enums import DeviceType, Manufacturer
from app.schemas.compare import HQPriceListItem, HQPriceListResponse
from app.schemas.common import SuccessResponse

router = APIRouter()


@router.get("", response_model=SuccessResponse[HQPriceListResponse])
async def list_hq_prices(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    grade_id: Optional[UUID] = Query(None, description="등급 ID (미지정 시 기본 등급)"),
    device_type: Optional[DeviceType] = Query(None),
    manufacturer: Optional[Manufacturer] = Query(None),
    series: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    favorites_only: bool = Query(False, description="즐겨찾기만 보기"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    본사 판매 단가 리스트 조회
    
    - 최종 업데이트 일시 및 버전 포함
    - 등급 선택 (기본: 기본 등급)
    - 검색/필터 지원
    - 즐겨찾기 표시
    """
    # 등급 결정
    if grade_id:
        grade_result = await db.execute(select(Grade).where(Grade.id == grade_id))
        grade = grade_result.scalar_one_or_none()
        if not grade:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "GRADE_NOT_FOUND", "message": "등급을 찾을 수 없습니다"}
            )
    else:
        # 기본 등급 조회
        grade_result = await db.execute(
            select(Grade).where(Grade.is_default == True, Grade.is_active == True)
        )
        grade = grade_result.scalar_one_or_none()
        if not grade:
            # 기본 등급이 없으면 첫 번째 활성 등급
            grade_result = await db.execute(
                select(Grade).where(Grade.is_active == True).order_by(Grade.sort_order).limit(1)
            )
            grade = grade_result.scalar_one_or_none()
        
        if not grade:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "NO_GRADES", "message": "등록된 등급이 없습니다"}
            )
    
    # 사용자 즐겨찾기 조회
    favorites_result = await db.execute(
        select(UserFavorite.model_id).where(UserFavorite.user_id == current_user.id)
    )
    favorite_model_ids = set(row[0] for row in favorites_result.all())
    
    # 쿼리 구성
    query = (
        select(SSOTModel, GradePrice)
        .join(GradePrice, and_(
            GradePrice.model_id == SSOTModel.id,
            GradePrice.grade_id == grade.id
        ))
        .where(SSOTModel.is_active == True)
    )
    count_query = (
        select(func.count(SSOTModel.id))
        .join(GradePrice, and_(
            GradePrice.model_id == SSOTModel.id,
            GradePrice.grade_id == grade.id
        ))
        .where(SSOTModel.is_active == True)
    )
    
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
        search_filter = (
            SSOTModel.model_code.ilike(f"%{search}%") |
            SSOTModel.model_name.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    
    if favorites_only and favorite_model_ids:
        query = query.where(SSOTModel.id.in_(favorite_model_ids))
        count_query = count_query.where(SSOTModel.id.in_(favorite_model_ids))
    
    # 총 개수
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 페이지네이션
    offset = (page - 1) * page_size
    query = (
        query
        .order_by(SSOTModel.device_type, SSOTModel.manufacturer, SSOTModel.series, SSOTModel.model_name)
        .offset(offset)
        .limit(page_size)
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    # 최신 적용 정보 조회
    apply_result = await db.execute(
        select(HQPriceApply)
        .where(HQPriceApply.is_current == True)
        .limit(1)
    )
    current_apply = apply_result.scalar_one_or_none()
    
    # 응답 구성
    items = []
    for model, grade_price in rows:
        items.append(HQPriceListItem(
            model_id=model.id,
            model_code=model.model_code,
            device_type=model.device_type.value,
            manufacturer=model.manufacturer.value,
            series=model.series,
            model_name=model.model_name,
            storage_display=model.storage_display,
            full_name=model.full_name,
            connectivity=model.connectivity.value,
            grade_id=grade.id,
            grade_name=grade.name,
            price=grade_price.price,
            applied_at=grade_price.applied_at,
            is_favorite=model.id in favorite_model_ids
        ))
    
    return SuccessResponse(
        data=HQPriceListResponse(
            items=items,
            total=total,
            applied_at=current_apply.applied_at if current_apply else datetime.utcnow(),
            applied_version=current_apply.version if current_apply else 0,
            applied_memo=current_apply.memo if current_apply else None
        )
    )
