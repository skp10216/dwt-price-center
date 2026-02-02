"""
단가표 통합 관리 시스템 - 사용자 리스트 스키마
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class UserListCreate(BaseModel):
    """사용자 리스트 생성 요청"""
    name: str = Field(..., min_length=1, max_length=100, description="리스트 이름")
    description: Optional[str] = Field(None, max_length=500, description="리스트 설명")
    is_default: bool = Field(default=False, description="기본 리스트 여부")


class UserListUpdate(BaseModel):
    """사용자 리스트 수정 요청"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="리스트 이름")
    description: Optional[str] = Field(None, max_length=500, description="리스트 설명")
    is_default: Optional[bool] = Field(None, description="기본 리스트 여부")


class UserListItemResponse(BaseModel):
    """사용자 리스트 항목 응답"""
    id: UUID
    model_id: UUID
    model_code: str
    model_name: str
    storage_display: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """사용자 리스트 응답"""
    id: UUID
    name: str
    description: Optional[str] = None
    is_default: bool
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    items: Optional[list[UserListItemResponse]] = None
    
    class Config:
        from_attributes = True


class UserListsResponse(BaseModel):
    """사용자 리스트 목록 응답"""
    lists: list[UserListResponse]
    total: int


class AddToListRequest(BaseModel):
    """리스트에 모델 추가 요청"""
    model_ids: list[UUID] = Field(..., description="추가할 모델 ID 목록")


class RemoveFromListRequest(BaseModel):
    """리스트에서 모델 제거 요청"""
    model_ids: list[UUID] = Field(..., description="제거할 모델 ID 목록")


class FavoriteToggleRequest(BaseModel):
    """즐겨찾기 토글 요청"""
    model_id: UUID = Field(..., description="모델 ID")


class FavoriteListResponse(BaseModel):
    """즐겨찾기 목록 응답"""
    favorites: list[UserListItemResponse]
    total: int
