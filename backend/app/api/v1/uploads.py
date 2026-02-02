"""
단가표 통합 관리 시스템 - 업로드 API
본사/거래처 단가표 업로드 및 Job 상태 관리
"""

import os
import hashlib
from uuid import UUID, uuid4
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import redis

from app.core.database import get_db
from app.core.config import settings
from app.api.deps import get_current_admin_user
from app.models.user import User
from app.models.upload_job import UploadJob
from app.models.partner import Partner
from app.models.audit_log import AuditLog
from app.models.enums import JobType, JobStatus, AuditAction
from app.schemas.upload import (
    UploadJobResponse,
    UploadJobListResponse,
)
from app.schemas.common import SuccessResponse

router = APIRouter()

# Redis 연결
redis_client = redis.from_url(settings.REDIS_URL)


def get_file_hash(file_content: bytes) -> str:
    """파일 해시 생성"""
    return hashlib.sha256(file_content).hexdigest()


@router.get("", response_model=SuccessResponse[UploadJobListResponse])
async def list_upload_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    job_type: Optional[JobType] = Query(None),
    status: Optional[JobStatus] = Query(None),
    partner_id: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """업로드 작업 목록 조회 (관리자 전용)"""
    query = select(UploadJob)
    count_query = select(func.count(UploadJob.id))
    
    if job_type:
        query = query.where(UploadJob.job_type == job_type)
        count_query = count_query.where(UploadJob.job_type == job_type)
    
    if status:
        query = query.where(UploadJob.status == status)
        count_query = count_query.where(UploadJob.status == status)
    
    if partner_id:
        query = query.where(UploadJob.partner_id == partner_id)
        count_query = count_query.where(UploadJob.partner_id == partner_id)
    
    # 총 개수
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 페이지네이션
    offset = (page - 1) * page_size
    query = query.order_by(UploadJob.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    jobs = result.scalars().all()
    
    return SuccessResponse(
        data=UploadJobListResponse(
            jobs=[UploadJobResponse.model_validate(j) for j in jobs],
            total=total
        )
    )


@router.post("/hq-excel", response_model=SuccessResponse[UploadJobResponse], status_code=status.HTTP_202_ACCEPTED)
async def upload_hq_excel(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """본사 엑셀 업로드 (관리자 전용)"""
    # 파일 확장자 확인
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_FILE_TYPE", "message": "엑셀 파일(.xlsx, .xls)만 업로드 가능합니다"}
        )
    
    # 파일 크기 확인
    file_content = await file.read()
    if len(file_content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "FILE_TOO_LARGE", "message": f"파일 크기가 {settings.MAX_UPLOAD_SIZE // 1024 // 1024}MB를 초과합니다"}
        )
    
    # 파일 해시 (중복 방지)
    file_hash = get_file_hash(file_content)
    
    # 파일 저장
    job_id = uuid4()
    upload_dir = os.path.join(settings.UPLOAD_DIR, "hq_excel")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"{job_id}_{file.filename}")
    
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    # Job 생성
    new_job = UploadJob(
        id=job_id,
        job_type=JobType.HQ_EXCEL,
        status=JobStatus.QUEUED,
        file_path=file_path,
        original_filename=file.filename,
        file_hash=file_hash,
        created_by=current_user.id,
    )
    db.add(new_job)
    
    # 감사로그
    trace_id = uuid4()
    audit_log = AuditLog(
        trace_id=trace_id,
        user_id=current_user.id,
        action=AuditAction.UPLOAD_START,
        target_type="upload_job",
        target_id=job_id,
        after_data={
            "job_type": JobType.HQ_EXCEL.value,
            "filename": file.filename,
        },
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(new_job)
    
    # Redis Queue에 작업 추가
    redis_client.rpush("default", str(job_id))
    
    return SuccessResponse(data=UploadJobResponse.model_validate(new_job))


@router.post("/partner", response_model=SuccessResponse[UploadJobResponse], status_code=status.HTTP_202_ACCEPTED)
async def upload_partner_price(
    file: UploadFile = File(...),
    partner_id: UUID = Form(...),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """거래처 단가표 업로드 (관리자 전용)"""
    # 거래처 확인
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()
    
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PARTNER_NOT_FOUND", "message": "거래처를 찾을 수 없습니다"}
        )
    
    # 파일 타입 결정
    filename_lower = file.filename.lower()
    if filename_lower.endswith(('.xlsx', '.xls')):
        job_type = JobType.PARTNER_EXCEL
        upload_subdir = "partner_excel"
    elif filename_lower.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
        job_type = JobType.PARTNER_IMAGE
        upload_subdir = "partner_image"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_FILE_TYPE", "message": "엑셀(.xlsx, .xls) 또는 이미지(.png, .jpg, .jpeg) 파일만 업로드 가능합니다"}
        )
    
    # 파일 읽기
    file_content = await file.read()
    if len(file_content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "FILE_TOO_LARGE", "message": f"파일 크기가 {settings.MAX_UPLOAD_SIZE // 1024 // 1024}MB를 초과합니다"}
        )
    
    file_hash = get_file_hash(file_content)
    
    # 파일 저장
    job_id = uuid4()
    upload_dir = os.path.join(settings.UPLOAD_DIR, upload_subdir)
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"{job_id}_{file.filename}")
    
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    # Job 생성
    new_job = UploadJob(
        id=job_id,
        job_type=job_type,
        status=JobStatus.QUEUED,
        file_path=file_path,
        original_filename=file.filename,
        file_hash=file_hash,
        partner_id=partner_id,
        created_by=current_user.id,
    )
    db.add(new_job)
    
    # 감사로그
    trace_id = uuid4()
    audit_log = AuditLog(
        trace_id=trace_id,
        user_id=current_user.id,
        action=AuditAction.UPLOAD_START,
        target_type="upload_job",
        target_id=job_id,
        after_data={
            "job_type": job_type.value,
            "partner_id": str(partner_id),
            "partner_name": partner.name,
            "filename": file.filename,
        },
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(new_job)
    
    # Redis Queue에 작업 추가
    queue_name = "high" if job_type == JobType.PARTNER_EXCEL else "default"
    redis_client.rpush(queue_name, str(job_id))
    
    return SuccessResponse(data=UploadJobResponse.model_validate(new_job))


@router.get("/{job_id}", response_model=SuccessResponse[UploadJobResponse])
async def get_upload_job(
    job_id: UUID,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """업로드 작업 상태 조회 (폴링용)"""
    result = await db.execute(select(UploadJob).where(UploadJob.id == job_id))
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "작업을 찾을 수 없습니다"}
        )
    
    return SuccessResponse(data=UploadJobResponse.model_validate(job))


@router.post("/{job_id}/confirm", response_model=SuccessResponse[UploadJobResponse])
async def confirm_upload_job(
    job_id: UUID,
    exclude_unmatched: bool = Query(default=True),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """업로드 검수 결과 확정 (관리자 전용)"""
    result = await db.execute(select(UploadJob).where(UploadJob.id == job_id))
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "작업을 찾을 수 없습니다"}
        )
    
    if job.status != JobStatus.SUCCEEDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "JOB_NOT_COMPLETED", "message": "작업이 완료되지 않았습니다"}
        )
    
    if job.is_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ALREADY_CONFIRMED", "message": "이미 확정된 작업입니다"}
        )
    
    # 확정 처리
    job.is_confirmed = True
    job.confirmed_at = datetime.utcnow()
    
    # 감사로그
    audit_log = AuditLog(
        user_id=current_user.id,
        action=AuditAction.UPLOAD_CONFIRM,
        target_type="upload_job",
        target_id=job_id,
        after_data={
            "exclude_unmatched": exclude_unmatched,
            "confirmed_at": job.confirmed_at.isoformat(),
        },
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(job)
    
    return SuccessResponse(data=UploadJobResponse.model_validate(job))


@router.post("/{job_id}/apply", response_model=SuccessResponse[UploadJobResponse])
async def apply_upload_job(
    job_id: UUID,
    memo: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """본사 단가표 적용 (관리자 전용) - Apply Lock 적용"""
    result = await db.execute(select(UploadJob).where(UploadJob.id == job_id))
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "작업을 찾을 수 없습니다"}
        )
    
    if job.job_type != JobType.HQ_EXCEL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_JOB_TYPE", "message": "본사 엑셀 업로드만 적용 가능합니다"}
        )
    
    if not job.is_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NOT_CONFIRMED", "message": "먼저 확정을 완료해주세요"}
        )
    
    if job.is_applied:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ALREADY_APPLIED", "message": "이미 적용된 작업입니다"}
        )
    
    # Apply Lock 확인 (Redis 사용)
    lock_key = "hq_price_apply_lock"
    lock_acquired = redis_client.set(lock_key, str(current_user.id), nx=True, ex=300)
    
    if not lock_acquired:
        locked_by = redis_client.get(lock_key)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "APPLY_LOCKED", "message": "다른 사용자가 적용 중입니다. 잠시 후 다시 시도해주세요."}
        )
    
    try:
        # 적용 처리
        job.is_applied = True
        job.applied_at = datetime.utcnow()
        
        # TODO: 실제 가격 업데이트 로직 구현
        # - job.result_summary에서 매핑된 데이터 읽기
        # - GradePrice 테이블 업데이트
        
        # 감사로그
        audit_log = AuditLog(
            user_id=current_user.id,
            action=AuditAction.UPLOAD_APPLY,
            target_type="upload_job",
            target_id=job_id,
            after_data={
                "applied_at": job.applied_at.isoformat(),
                "memo": memo,
            },
        )
        db.add(audit_log)
        
        await db.commit()
        await db.refresh(job)
        
    finally:
        # Lock 해제
        redis_client.delete(lock_key)
    
    return SuccessResponse(data=UploadJobResponse.model_validate(job))
