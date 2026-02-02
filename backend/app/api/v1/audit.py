"""
단가표 통합 관리 시스템 - 감사로그 API
변경 이력 조회 (관리자 전용)
"""

from typing import Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction
from app.schemas.audit import (
    AuditLogResponse,
    AuditLogListResponse,
)
from app.schemas.common import SuccessResponse

router = APIRouter()


@router.get("", response_model=SuccessResponse[AuditLogListResponse])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user_id: Optional[UUID] = Query(None),
    action: Optional[AuditAction] = Query(None),
    target_type: Optional[str] = Query(None),
    target_id: Optional[UUID] = Query(None),
    trace_id: Optional[UUID] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """
    감사로그 목록 조회 (관리자 전용)
    
    - 기간/사용자/메뉴/작업유형 필터
    - trace_id로 작업 단위 묶음 조회
    """
    query = select(AuditLog).options(selectinload(AuditLog.user))
    count_query = select(func.count(AuditLog.id))
    
    # 필터링
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
        count_query = count_query.where(AuditLog.user_id == user_id)
    
    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)
    
    if target_type:
        query = query.where(AuditLog.target_type == target_type)
        count_query = count_query.where(AuditLog.target_type == target_type)
    
    if target_id:
        query = query.where(AuditLog.target_id == target_id)
        count_query = count_query.where(AuditLog.target_id == target_id)
    
    if trace_id:
        query = query.where(AuditLog.trace_id == trace_id)
        count_query = count_query.where(AuditLog.trace_id == trace_id)
    
    if start_date:
        query = query.where(AuditLog.created_at >= start_date)
        count_query = count_query.where(AuditLog.created_at >= start_date)
    
    if end_date:
        query = query.where(AuditLog.created_at <= end_date)
        count_query = count_query.where(AuditLog.created_at <= end_date)
    
    if search:
        query = query.where(AuditLog.description.ilike(f"%{search}%"))
        count_query = count_query.where(AuditLog.description.ilike(f"%{search}%"))
    
    # 총 개수
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 페이지네이션
    offset = (page - 1) * page_size
    query = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    # 응답 구성
    log_responses = []
    for log in logs:
        log_responses.append(AuditLogResponse(
            id=log.id,
            trace_id=log.trace_id,
            user_id=log.user_id,
            user_email=log.user.email if log.user else None,
            user_name=log.user.name if log.user else None,
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            before_data=log.before_data,
            after_data=log.after_data,
            description=log.description,
            ip_address=log.ip_address,
            created_at=log.created_at,
        ))
    
    return SuccessResponse(
        data=AuditLogListResponse(logs=log_responses, total=total)
    )


@router.get("/{log_id}", response_model=SuccessResponse[AuditLogResponse])
async def get_audit_log(
    log_id: UUID,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """감사로그 상세 조회 (관리자 전용)"""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.id == log_id)
        .options(selectinload(AuditLog.user))
    )
    log = result.scalar_one_or_none()
    
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LOG_NOT_FOUND", "message": "로그를 찾을 수 없습니다"}
        )
    
    return SuccessResponse(
        data=AuditLogResponse(
            id=log.id,
            trace_id=log.trace_id,
            user_id=log.user_id,
            user_email=log.user.email if log.user else None,
            user_name=log.user.name if log.user else None,
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            before_data=log.before_data,
            after_data=log.after_data,
            description=log.description,
            ip_address=log.ip_address,
            created_at=log.created_at,
        )
    )


@router.get("/trace/{trace_id}", response_model=SuccessResponse[AuditLogListResponse])
async def get_audit_logs_by_trace(
    trace_id: UUID,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """trace_id로 작업 단위 감사로그 조회 (관리자 전용)"""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.trace_id == trace_id)
        .options(selectinload(AuditLog.user))
        .order_by(AuditLog.created_at)
    )
    logs = result.scalars().all()
    
    log_responses = []
    for log in logs:
        log_responses.append(AuditLogResponse(
            id=log.id,
            trace_id=log.trace_id,
            user_id=log.user_id,
            user_email=log.user.email if log.user else None,
            user_name=log.user.name if log.user else None,
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            before_data=log.before_data,
            after_data=log.after_data,
            description=log.description,
            ip_address=log.ip_address,
            created_at=log.created_at,
        ))
    
    return SuccessResponse(
        data=AuditLogListResponse(logs=log_responses, total=len(log_responses))
    )
