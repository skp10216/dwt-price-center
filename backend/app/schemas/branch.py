"""
단가표 통합 관리 시스템 - 지사 스키마
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class BranchCreate(BaseModel):
    """지사 생성 요청"""
    name: str = Field(..., min_length=1, max_length=100, description="지사명")
    region: Optional[str] = Field(None, max_length=100, description="지역")
    contact_info: Optional[str] = Field(None, max_length=200, description="연락처")
    memo: Optional[str] = Field(None, description="운영 메모")


class BranchUpdate(BaseModel):
    """지사 수정 요청"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="지사명")
    region: Optional[str] = Field(None, max_length=100, description="지역")
    contact_info: Optional[str] = Field(None, max_length=200, description="연락처")
    memo: Optional[str] = Field(None, description="운영 메모")
    is_active: Optional[bool] = Field(None, description="활성 상태")
    version: Optional[str] = Field(None, description="낙관적 락 version (updated_at ISO string)")


class BranchResponse(BaseModel):
    """지사 응답"""
    id: UUID
    name: str
    region: Optional[str] = None
    contact_info: Optional[str] = None
    memo: Optional[str] = None
    is_active: bool
    deleted_at: Optional[datetime] = None
    delete_reason: Optional[str] = None
    partner_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BranchListResponse(BaseModel):
    """지사 목록 응답"""
    branches: list[BranchResponse]
    total: int


class BranchDeleteRequest(BaseModel):
    """지사 삭제 요청"""
    reason: Optional[str] = Field(None, max_length=500, description="삭제 사유")
    version: Optional[str] = Field(None, description="낙관적 락 version")


class BranchImpactResponse(BaseModel):
    """지사 삭제 영향 요약"""
    partner_count: int
    affected_partners: list[dict]


class PartnerBranchMoveRequest(BaseModel):
    """거래처 지사 이동 요청"""
    branch_id: Optional[UUID] = Field(None, description="이동할 지사 ID (null이면 미배정)")
    reason: Optional[str] = Field(None, max_length=500, description="이동 사유")
    version: Optional[str] = Field(None, description="낙관적 락 version")


class PartnerDeleteRequest(BaseModel):
    """거래처 소프트 삭제 요청"""
    reason: Optional[str] = Field(None, max_length=500, description="삭제 사유")
    version: Optional[str] = Field(None, description="낙관적 락 version")


class PartnerAssignBranchRequest(BaseModel):
    """거래처 일괄 지사 배정 요청"""
    partner_ids: list[UUID] = Field(..., description="거래처 ID 목록")
    branch_id: Optional[UUID] = Field(None, description="배정할 지사 ID (null이면 미배정)")
