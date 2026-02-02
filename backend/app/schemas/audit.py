"""
단가표 통합 관리 시스템 - 감사로그 스키마
"""

from datetime import datetime
from typing import Optional, Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import AuditAction


class AuditLogResponse(BaseModel):
    """감사로그 응답"""
    id: UUID
    trace_id: Optional[UUID] = None
    user_id: UUID
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    action: AuditAction
    target_type: str
    target_id: Optional[UUID] = None
    before_data: Optional[dict[str, Any]] = None
    after_data: Optional[dict[str, Any]] = None
    description: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """감사로그 목록 응답"""
    logs: list[AuditLogResponse]
    total: int


class AuditLogFilter(BaseModel):
    """감사로그 필터"""
    user_id: Optional[UUID] = None
    action: Optional[AuditAction] = None
    target_type: Optional[str] = None
    target_id: Optional[UUID] = None
    trace_id: Optional[UUID] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    search: Optional[str] = Field(None, description="설명 검색")
