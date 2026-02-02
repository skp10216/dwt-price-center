"""
단가표 통합 관리 시스템 - 비교 API
거래처별 가격 비교
"""

from typing import Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_admin_user
from app.models.user import User
from app.models.ssot_model import SSOTModel
from app.models.grade import Grade
from app.models.grade_price import GradePrice
from app.models.partner import Partner
from app.models.partner_price import PartnerPrice
from app.models.compare_list import CompareListModel
from app.models.user_list import UserList, UserListItem
from app.schemas.compare import (
    CompareResponse,
    CompareModelPrice,
    CompareListAddRequest,
    CompareListRemoveRequest,
)
from app.schemas.common import SuccessResponse

router = APIRouter()


@router.get("", response_model=SuccessResponse[CompareResponse])
async def get_compare_data(
    grade_id: Optional[UUID] = Query(None, description="등급 ID"),
    partner_ids: Optional[str] = Query(None, description="거래처 ID 목록 (콤마 구분)"),
    list_type: str = Query("admin", description="리스트 타입: admin(관리자 지정), my(내 리스트)"),
    my_list_id: Optional[UUID] = Query(None, description="내 리스트 ID (list_type=my일 때)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    거래처별 가격 비교
    
    - 관리자 지정 리스트 또는 내 리스트 기준
    - 모델(행) x 거래처(열) 테이블
    - 최고가/최저가 자동 계산
    """
    # 등급 결정
    if grade_id:
        grade_result = await db.execute(select(Grade).where(Grade.id == grade_id))
        grade = grade_result.scalar_one_or_none()
        if not grade or not grade.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "GRADE_NOT_FOUND", "message": "등급을 찾을 수 없습니다"}
            )
    else:
        # 기본 등급
        grade_result = await db.execute(
            select(Grade).where(Grade.is_default == True, Grade.is_active == True)
        )
        grade = grade_result.scalar_one_or_none()
        if not grade:
            grade_result = await db.execute(
                select(Grade).where(Grade.is_active == True).order_by(Grade.sort_order).limit(1)
            )
            grade = grade_result.scalar_one_or_none()
        
        if not grade:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "NO_GRADES", "message": "등록된 등급이 없습니다"}
            )
    
    # 비교 대상 모델 조회
    if list_type == "my" and my_list_id:
        # 내 리스트
        list_result = await db.execute(
            select(UserList).where(
                UserList.id == my_list_id,
                UserList.user_id == current_user.id
            )
        )
        my_list = list_result.scalar_one_or_none()
        if not my_list:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "LIST_NOT_FOUND", "message": "리스트를 찾을 수 없습니다"}
            )
        
        model_ids_result = await db.execute(
            select(UserListItem.model_id).where(UserListItem.list_id == my_list_id)
        )
        model_ids = [row[0] for row in model_ids_result.all()]
    else:
        # 관리자 지정 리스트
        model_ids_result = await db.execute(
            select(CompareListModel.model_id).order_by(CompareListModel.sort_order)
        )
        model_ids = [row[0] for row in model_ids_result.all()]
    
    if not model_ids:
        return SuccessResponse(
            data=CompareResponse(
                grade_id=grade.id,
                grade_name=grade.name,
                partners=[],
                models=[],
                updated_at=datetime.utcnow()
            )
        )
    
    # 거래처 목록
    partner_query = select(Partner).where(Partner.is_active == True)
    if partner_ids:
        partner_id_list = [UUID(pid.strip()) for pid in partner_ids.split(",") if pid.strip()]
        if partner_id_list:
            partner_query = partner_query.where(Partner.id.in_(partner_id_list))
    
    partner_result = await db.execute(partner_query.order_by(Partner.name))
    partners = partner_result.scalars().all()
    
    # 모델 정보 조회
    models_result = await db.execute(
        select(SSOTModel)
        .where(SSOTModel.id.in_(model_ids), SSOTModel.is_active == True)
    )
    models = models_result.scalars().all()
    model_map = {m.id: m for m in models}
    
    # 본사 가격 조회
    hq_prices_result = await db.execute(
        select(GradePrice)
        .where(
            GradePrice.model_id.in_(model_ids),
            GradePrice.grade_id == grade.id
        )
    )
    hq_prices = {gp.model_id: gp.price for gp in hq_prices_result.scalars().all()}
    
    # 거래처 가격 조회
    partner_prices_result = await db.execute(
        select(PartnerPrice)
        .where(
            PartnerPrice.model_id.in_(model_ids),
            PartnerPrice.grade_id == grade.id,
            PartnerPrice.partner_id.in_([p.id for p in partners])
        )
    )
    partner_prices = {}
    for pp in partner_prices_result.scalars().all():
        if pp.model_id not in partner_prices:
            partner_prices[pp.model_id] = {}
        partner_prices[pp.model_id][str(pp.partner_id)] = pp.price
    
    # 응답 구성
    compare_models = []
    for model_id in model_ids:
        if model_id not in model_map:
            continue
        
        model = model_map[model_id]
        model_partner_prices = partner_prices.get(model_id, {})
        
        # 최고가/최저가 계산
        prices = [p for p in model_partner_prices.values() if p is not None]
        min_price = min(prices) if prices else None
        max_price = max(prices) if prices else None
        min_partner_id = None
        max_partner_id = None
        
        for partner_id, price in model_partner_prices.items():
            if price == min_price and min_partner_id is None:
                min_partner_id = UUID(partner_id)
            if price == max_price and max_partner_id is None:
                max_partner_id = UUID(partner_id)
        
        compare_models.append(CompareModelPrice(
            model_id=model_id,
            model_code=model.model_code,
            model_name=model.model_name,
            storage_display=model.storage_display,
            hq_price=hq_prices.get(model_id),
            partner_prices=model_partner_prices,
            min_price=min_price,
            max_price=max_price,
            min_partner_id=min_partner_id,
            max_partner_id=max_partner_id,
        ))
    
    return SuccessResponse(
        data=CompareResponse(
            grade_id=grade.id,
            grade_name=grade.name,
            partners=[{"id": str(p.id), "name": p.name} for p in partners],
            models=compare_models,
            updated_at=datetime.utcnow()
        )
    )


@router.get("/list", response_model=SuccessResponse[list])
async def get_compare_list(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """관리자 지정 비교 리스트 조회"""
    result = await db.execute(
        select(CompareListModel, SSOTModel)
        .join(SSOTModel, CompareListModel.model_id == SSOTModel.id)
        .where(SSOTModel.is_active == True)
        .order_by(CompareListModel.sort_order)
    )
    rows = result.all()
    
    items = []
    for clm, model in rows:
        items.append({
            "id": str(clm.id),
            "model_id": str(model.id),
            "model_code": model.model_code,
            "model_name": model.model_name,
            "storage_display": model.storage_display,
            "sort_order": clm.sort_order,
        })
    
    return SuccessResponse(data=items)


@router.post("/list/add", response_model=SuccessResponse[dict])
async def add_to_compare_list(
    request: CompareListAddRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """비교 리스트에 모델 추가 (관리자 전용)"""
    # 현재 최대 sort_order 조회
    max_order_result = await db.execute(
        select(func.max(CompareListModel.sort_order))
    )
    max_order = max_order_result.scalar() or 0
    
    added_count = 0
    for model_id in request.model_ids:
        # 중복 확인
        existing = await db.execute(
            select(CompareListModel).where(CompareListModel.model_id == model_id)
        )
        if existing.scalar_one_or_none():
            continue
        
        max_order += 1
        new_item = CompareListModel(
            model_id=model_id,
            sort_order=max_order,
            added_by=current_user.id,
        )
        db.add(new_item)
        added_count += 1
    
    await db.commit()
    
    return SuccessResponse(data={"message": f"{added_count}개 모델이 추가되었습니다"})


@router.post("/list/remove", response_model=SuccessResponse[dict])
async def remove_from_compare_list(
    request: CompareListRemoveRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """비교 리스트에서 모델 제거 (관리자 전용)"""
    result = await db.execute(
        select(CompareListModel).where(CompareListModel.model_id.in_(request.model_ids))
    )
    items = result.scalars().all()
    
    for item in items:
        await db.delete(item)
    
    await db.commit()
    
    return SuccessResponse(data={"message": f"{len(items)}개 모델이 제거되었습니다"})
