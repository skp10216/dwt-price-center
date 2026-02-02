"""
단가표 통합 관리 시스템 - 내 리스트 API
사용자 개인 리스트 및 즐겨찾기 관리
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.ssot_model import SSOTModel
from app.models.user_list import UserList, UserListItem, UserFavorite
from app.schemas.user_list import (
    UserListCreate,
    UserListUpdate,
    UserListResponse,
    UserListsResponse,
    UserListItemResponse,
    AddToListRequest,
    RemoveFromListRequest,
    FavoriteToggleRequest,
    FavoriteListResponse,
)
from app.schemas.common import SuccessResponse

router = APIRouter()


# === 리스트 API ===

@router.get("", response_model=SuccessResponse[UserListsResponse])
async def get_my_lists(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """내 리스트 목록 조회"""
    result = await db.execute(
        select(UserList)
        .where(UserList.user_id == current_user.id)
        .options(selectinload(UserList.items))
        .order_by(UserList.is_default.desc(), UserList.name)
    )
    lists = result.scalars().all()
    
    response_lists = []
    for lst in lists:
        response_lists.append(UserListResponse(
            id=lst.id,
            name=lst.name,
            description=lst.description,
            is_default=lst.is_default,
            created_at=lst.created_at,
            updated_at=lst.updated_at,
            item_count=len(lst.items),
        ))
    
    return SuccessResponse(
        data=UserListsResponse(lists=response_lists, total=len(response_lists))
    )


@router.post("", response_model=SuccessResponse[UserListResponse], status_code=status.HTTP_201_CREATED)
async def create_my_list(
    list_data: UserListCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """내 리스트 생성"""
    # 이름 중복 확인
    existing = await db.execute(
        select(UserList).where(
            UserList.user_id == current_user.id,
            UserList.name == list_data.name
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "LIST_NAME_EXISTS", "message": "이미 존재하는 리스트 이름입니다"}
        )
    
    # 기본 리스트 설정 시 기존 기본 리스트 해제
    if list_data.is_default:
        existing_default = await db.execute(
            select(UserList).where(
                UserList.user_id == current_user.id,
                UserList.is_default == True
            )
        )
        for lst in existing_default.scalars():
            lst.is_default = False
    
    # 리스트 생성
    new_list = UserList(
        user_id=current_user.id,
        **list_data.model_dump()
    )
    db.add(new_list)
    await db.commit()
    await db.refresh(new_list)
    
    return SuccessResponse(
        data=UserListResponse(
            id=new_list.id,
            name=new_list.name,
            description=new_list.description,
            is_default=new_list.is_default,
            created_at=new_list.created_at,
            updated_at=new_list.updated_at,
            item_count=0,
        )
    )


@router.get("/{list_id}", response_model=SuccessResponse[UserListResponse])
async def get_my_list(
    list_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """내 리스트 상세 조회"""
    result = await db.execute(
        select(UserList)
        .where(UserList.id == list_id, UserList.user_id == current_user.id)
        .options(selectinload(UserList.items).selectinload(UserListItem.model))
    )
    lst = result.scalar_one_or_none()
    
    if not lst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LIST_NOT_FOUND", "message": "리스트를 찾을 수 없습니다"}
        )
    
    items = []
    for item in lst.items:
        if item.model and item.model.is_active:
            items.append(UserListItemResponse(
                id=item.id,
                model_id=item.model_id,
                model_code=item.model.model_code,
                model_name=item.model.model_name,
                storage_display=item.model.storage_display,
                created_at=item.created_at,
            ))
    
    return SuccessResponse(
        data=UserListResponse(
            id=lst.id,
            name=lst.name,
            description=lst.description,
            is_default=lst.is_default,
            created_at=lst.created_at,
            updated_at=lst.updated_at,
            item_count=len(items),
            items=items,
        )
    )


@router.patch("/{list_id}", response_model=SuccessResponse[UserListResponse])
async def update_my_list(
    list_id: UUID,
    list_data: UserListUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """내 리스트 수정"""
    result = await db.execute(
        select(UserList).where(UserList.id == list_id, UserList.user_id == current_user.id)
    )
    lst = result.scalar_one_or_none()
    
    if not lst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LIST_NOT_FOUND", "message": "리스트를 찾을 수 없습니다"}
        )
    
    # 기본 리스트 설정 시 기존 기본 리스트 해제
    if list_data.is_default:
        existing_default = await db.execute(
            select(UserList).where(
                UserList.user_id == current_user.id,
                UserList.is_default == True,
                UserList.id != list_id
            )
        )
        for l in existing_default.scalars():
            l.is_default = False
    
    # 업데이트
    update_fields = list_data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(lst, field, value)
    
    await db.commit()
    await db.refresh(lst)
    
    return SuccessResponse(
        data=UserListResponse(
            id=lst.id,
            name=lst.name,
            description=lst.description,
            is_default=lst.is_default,
            created_at=lst.created_at,
            updated_at=lst.updated_at,
            item_count=0,
        )
    )


@router.delete("/{list_id}", response_model=SuccessResponse[dict])
async def delete_my_list(
    list_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """내 리스트 삭제"""
    result = await db.execute(
        select(UserList)
        .where(UserList.id == list_id, UserList.user_id == current_user.id)
        .options(selectinload(UserList.items))
    )
    lst = result.scalar_one_or_none()
    
    if not lst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LIST_NOT_FOUND", "message": "리스트를 찾을 수 없습니다"}
        )
    
    await db.delete(lst)
    await db.commit()
    
    return SuccessResponse(data={"message": "리스트가 삭제되었습니다"})


@router.post("/{list_id}/items", response_model=SuccessResponse[dict])
async def add_items_to_list(
    list_id: UUID,
    request: AddToListRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """리스트에 모델 추가"""
    result = await db.execute(
        select(UserList).where(UserList.id == list_id, UserList.user_id == current_user.id)
    )
    lst = result.scalar_one_or_none()
    
    if not lst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LIST_NOT_FOUND", "message": "리스트를 찾을 수 없습니다"}
        )
    
    added_count = 0
    for model_id in request.model_ids:
        # 중복 확인
        existing = await db.execute(
            select(UserListItem).where(
                UserListItem.list_id == list_id,
                UserListItem.model_id == model_id
            )
        )
        if existing.scalar_one_or_none():
            continue
        
        new_item = UserListItem(list_id=list_id, model_id=model_id)
        db.add(new_item)
        added_count += 1
    
    await db.commit()
    
    return SuccessResponse(data={"message": f"{added_count}개 모델이 추가되었습니다"})


@router.delete("/{list_id}/items", response_model=SuccessResponse[dict])
async def remove_items_from_list(
    list_id: UUID,
    request: RemoveFromListRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """리스트에서 모델 제거"""
    result = await db.execute(
        select(UserListItem).where(
            UserListItem.list_id == list_id,
            UserListItem.model_id.in_(request.model_ids)
        )
    )
    items = result.scalars().all()
    
    for item in items:
        await db.delete(item)
    
    await db.commit()
    
    return SuccessResponse(data={"message": f"{len(items)}개 모델이 제거되었습니다"})


# === 즐겨찾기 API ===

@router.get("/favorites", response_model=SuccessResponse[FavoriteListResponse])
async def get_favorites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """즐겨찾기 목록 조회"""
    result = await db.execute(
        select(UserFavorite, SSOTModel)
        .join(SSOTModel, UserFavorite.model_id == SSOTModel.id)
        .where(UserFavorite.user_id == current_user.id, SSOTModel.is_active == True)
        .order_by(UserFavorite.created_at.desc())
    )
    rows = result.all()
    
    favorites = []
    for fav, model in rows:
        favorites.append(UserListItemResponse(
            id=fav.id,
            model_id=model.id,
            model_code=model.model_code,
            model_name=model.model_name,
            storage_display=model.storage_display,
            created_at=fav.created_at,
        ))
    
    return SuccessResponse(
        data=FavoriteListResponse(favorites=favorites, total=len(favorites))
    )


@router.post("/favorites/toggle", response_model=SuccessResponse[dict])
async def toggle_favorite(
    request: FavoriteToggleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """즐겨찾기 토글"""
    # 기존 즐겨찾기 확인
    result = await db.execute(
        select(UserFavorite).where(
            UserFavorite.user_id == current_user.id,
            UserFavorite.model_id == request.model_id
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        # 제거
        await db.delete(existing)
        await db.commit()
        return SuccessResponse(data={"is_favorite": False, "message": "즐겨찾기에서 제거되었습니다"})
    else:
        # 추가
        new_fav = UserFavorite(user_id=current_user.id, model_id=request.model_id)
        db.add(new_fav)
        await db.commit()
        return SuccessResponse(data={"is_favorite": True, "message": "즐겨찾기에 추가되었습니다"})
