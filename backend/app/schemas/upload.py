"""
단가표 통합 관리 시스템 - 업로드 스키마
"""

from datetime import datetime
from typing import Optional, Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import JobType, JobStatus


class UploadJobCreate(BaseModel):
    """업로드 작업 생성 요청"""
    job_type: JobType = Field(..., description="작업 타입")
    partner_id: Optional[UUID] = Field(None, description="거래처 ID (거래처 업로드 시)")


class UploadJobResponse(BaseModel):
    """업로드 작업 응답"""
    id: UUID
    job_type: JobType
    status: JobStatus
    progress: int
    original_filename: str
    partner_id: Optional[UUID] = None
    result_summary: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    is_reviewed: bool
    is_confirmed: bool
    is_applied: bool
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    applied_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UploadJobListResponse(BaseModel):
    """업로드 작업 목록 응답"""
    jobs: list[UploadJobResponse]
    total: int


class UploadReviewItem(BaseModel):
    """업로드 검수 항목"""
    row_index: int = Field(..., description="행 번호")
    raw_data: dict[str, Any] = Field(..., description="원본 데이터")
    matched_model_id: Optional[UUID] = Field(None, description="매칭된 모델 ID")
    matched_model_name: Optional[str] = Field(None, description="매칭된 모델명")
    match_confidence: Optional[float] = Field(None, description="매칭 신뢰도")
    match_status: str = Field(..., description="매칭 상태: matched, low_confidence, unmatched")
    prices: Optional[dict[str, int]] = Field(None, description="등급별 가격")


class UploadReviewResponse(BaseModel):
    """업로드 검수 응답"""
    job_id: UUID
    job_type: JobType
    total_rows: int
    matched_count: int
    unmatched_count: int
    low_confidence_count: int
    items: list[UploadReviewItem]


class UploadReviewUpdateItem(BaseModel):
    """검수 수정 항목"""
    row_index: int = Field(..., description="행 번호")
    model_id: Optional[UUID] = Field(None, description="수정된 모델 ID (None이면 제외)")


class UploadReviewUpdate(BaseModel):
    """검수 수정 요청"""
    items: list[UploadReviewUpdateItem] = Field(..., description="수정 항목 목록")


class UploadConfirmRequest(BaseModel):
    """업로드 확정 요청"""
    exclude_unmatched: bool = Field(default=True, description="미매핑 항목 제외 여부")


class UploadApplyRequest(BaseModel):
    """본사 단가표 적용 요청"""
    memo: Optional[str] = Field(None, max_length=500, description="적용 메모")
