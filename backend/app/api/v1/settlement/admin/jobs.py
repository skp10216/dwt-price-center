"""
정산 관리자 - Worker Job 현황 API
업로드 작업 + RQ 큐 상태 통합 관리 + 재시도/취소/삭제
"""

import os
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User
from app.models.upload_job import UploadJob
from app.models.enums import JobStatus, AuditAction
from app.models.audit_log import AuditLog

router = APIRouter()


def _get_redis_conn():
    """동기 Redis 연결 (RQ 큐 조작용)"""
    import redis as redis_lib
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    return redis_lib.from_url(redis_url, socket_timeout=3)


def _get_task_func(job_type_str: str) -> str:
    """job_type에 따른 task 함수 경로 반환"""
    mapping = {
        "voucher_return_excel": "tasks.return_parser.parse_return_excel",
        "voucher_intake_excel": "tasks.intake_parser.parse_intake_excel",
    }
    return mapping.get(job_type_str, "tasks.voucher_parser.parse_voucher_excel")


@router.get("/status")
async def get_job_status(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Worker Job 통합 현황 (DB + RQ)"""

    # DB: upload_jobs 상태 분포
    job_stats = (await db.execute(text("""
        SELECT status::text, COUNT(*) AS cnt
        FROM upload_jobs
        GROUP BY status
    """))).mappings().all()
    job_dist = {row["status"]: row["cnt"] for row in job_stats}

    # DB: 최근 실패 Job
    failed_jobs = (await db.execute(text("""
        SELECT
            uj.id,
            uj.job_type::text AS job_type,
            uj.status::text AS status,
            uj.original_filename,
            uj.file_path,
            uj.error_message,
            uj.progress,
            uj.result_summary,
            uj.created_at,
            uj.started_at,
            uj.completed_at,
            u.name AS user_name,
            u.email AS user_email
        FROM upload_jobs uj
        LEFT JOIN users u ON u.id = uj.created_by
        WHERE uj.status = 'FAILED'
        ORDER BY uj.created_at DESC
        LIMIT 20
    """))).mappings().all()

    failed_list = [
        {
            "id": str(row["id"]),
            "job_type": row["job_type"],
            "status": row["status"],
            "file_name": row["original_filename"] or row["file_path"],
            "error_message": row["error_message"],
            "progress": row["progress"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "started_at": row["started_at"].isoformat() if row["started_at"] else None,
            "completed_at": row["completed_at"].isoformat() if row["completed_at"] else None,
            "user_name": row["user_name"],
            "user_email": row["user_email"],
        }
        for row in failed_jobs
    ]

    # RQ 큐 상태
    rq_status = {}
    try:
        import redis as redis_lib
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = redis_lib.from_url(redis_url, socket_timeout=3)

        for q_name in ["high", "default", "low"]:
            rq_status[q_name] = r.llen(f"rq:queue:{q_name}")

        worker_keys = r.keys("rq:worker:*")
        rq_status["workers"] = len(worker_keys)
        rq_status["failed"] = r.llen("rq:queue:failed")
        r.close()
    except Exception:
        rq_status = {"error": "Redis 연결 실패"}

    return {
        "job_distribution": job_dist,
        "failed_jobs": failed_list,
        "rq_queues": rq_status,
    }


@router.get("/list")
async def get_job_list(
    status: str = Query("", description="상태 필터 (QUEUED, RUNNING, SUCCEEDED, FAILED)"),
    job_type: str = Query("", description="작업 타입 필터"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=10, le=100),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """업로드 작업 목록 (페이지네이션)"""

    offset = (page - 1) * page_size
    where_parts = []
    params: dict = {"limit": page_size, "offset": offset}

    if status:
        where_parts.append("uj.status = :status::job_status")
        params["status"] = status
    if job_type:
        where_parts.append("uj.job_type::text = :job_type")
        params["job_type"] = job_type

    where_clause = "WHERE " + " AND ".join(where_parts) if where_parts else ""

    total = (await db.execute(text(f"""
        SELECT COUNT(*) FROM upload_jobs uj {where_clause}
    """), params)).scalar() or 0

    rows = (await db.execute(text(f"""
        SELECT
            uj.id,
            uj.job_type::text AS job_type,
            uj.status::text AS status,
            uj.original_filename,
            uj.file_path,
            uj.progress,
            uj.result_summary,
            uj.error_message,
            uj.is_confirmed,
            uj.is_reviewed,
            uj.is_applied,
            uj.created_at,
            uj.started_at,
            uj.completed_at,
            u.name AS user_name,
            u.email AS user_email
        FROM upload_jobs uj
        LEFT JOIN users u ON u.id = uj.created_by
        {where_clause}
        ORDER BY uj.created_at DESC
        LIMIT :limit OFFSET :offset
    """), params)).mappings().all()

    jobs = [
        {
            "id": str(row["id"]),
            "job_type": row["job_type"],
            "status": row["status"],
            "file_name": row["original_filename"] or row["file_path"],
            "progress": row["progress"],
            "result_summary": row["result_summary"],
            "error_message": row["error_message"],
            "is_confirmed": row["is_confirmed"],
            "is_reviewed": row["is_reviewed"],
            "is_applied": row["is_applied"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "started_at": row["started_at"].isoformat() if row["started_at"] else None,
            "completed_at": row["completed_at"].isoformat() if row["completed_at"] else None,
            "user_name": row["user_name"],
            "user_email": row["user_email"],
        }
        for row in rows
    ]

    return {"jobs": jobs, "total": total, "page": page, "page_size": page_size}


# ─── 작업 조작 API ─────────────────────────────────────────────────

@router.post("/{job_id}/retry")
async def retry_job(
    job_id: UUID,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """실패 작업 재시도 — FAILED→QUEUED 리셋 + RQ 큐 재등록"""
    job = await db.get(UploadJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status != JobStatus.FAILED:
        raise HTTPException(status_code=400, detail=f"FAILED 상태만 재시도 가능합니다 (현재: {job.status.value})")

    previous_error = job.error_message
    job.status = JobStatus.QUEUED
    job.progress = 0
    job.error_message = None
    job.started_at = None
    job.completed_at = None

    # RQ 큐에 재등록
    try:
        from rq import Queue
        conn = _get_redis_conn()
        q = Queue("default", connection=conn)
        task_func = _get_task_func(job.job_type.value if hasattr(job.job_type, 'value') else str(job.job_type))
        q.enqueue(task_func, str(job.id), job_timeout="10m")
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"큐 서비스 연결 실패: {str(e)}")

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.JOB_RETRY,
        target_type="upload_job",
        target_id=job.id,
        description=f"작업 재시도: {job.original_filename}",
        before_data={"error_message": previous_error},
        after_data={"status": "QUEUED"},
    ))
    await db.flush()
    return {"message": "작업 재시도 등록", "job_id": str(job.id), "new_status": "QUEUED"}


@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: UUID,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """작업 취소 — QUEUED/RUNNING→FAILED"""
    job = await db.get(UploadJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status not in (JobStatus.QUEUED, JobStatus.RUNNING):
        raise HTTPException(status_code=400, detail=f"QUEUED 또는 RUNNING 상태만 취소 가능합니다 (현재: {job.status.value})")

    previous_status = job.status.value
    job.status = JobStatus.FAILED
    job.error_message = "관리자에 의해 취소됨"

    # RUNNING인 경우 RQ에서도 취소 시도
    if previous_status == "running":
        try:
            from rq import cancel_job as rq_cancel
            conn = _get_redis_conn()
            rq_cancel(str(job.id), connection=conn)
            conn.close()
        except Exception:
            pass  # RQ 취소 실패해도 DB 상태는 변경

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.JOB_CANCEL,
        target_type="upload_job",
        target_id=job.id,
        description=f"작업 취소: {job.original_filename}",
        before_data={"status": previous_status},
        after_data={"status": "FAILED"},
    ))
    await db.flush()
    return {"message": "작업 취소", "job_id": str(job.id), "previous_status": previous_status}


@router.delete("/{job_id}")
async def delete_job(
    job_id: UUID,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """작업 삭제 — SUCCEEDED/FAILED만 삭제 가능"""
    job = await db.get(UploadJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status not in (JobStatus.SUCCEEDED, JobStatus.FAILED):
        raise HTTPException(status_code=400, detail="완료/실패 상태만 삭제 가능합니다. 먼저 취소해주세요")

    file_name = job.original_filename
    file_path = job.file_path

    # 파일 삭제
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.JOB_DELETE,
        target_type="upload_job",
        target_id=job.id,
        description=f"작업 삭제: {file_name}",
        before_data={"status": job.status.value, "file_name": file_name},
    ))

    await db.delete(job)
    await db.flush()
    return {"message": "작업 삭제", "job_id": str(job_id)}


class BatchRetryRequest(BaseModel):
    job_ids: Optional[list[str]] = None
    all_failed: bool = False


@router.post("/batch-retry")
async def batch_retry_jobs(
    body: BatchRetryRequest,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """실패 작업 일괄 재시도"""
    if body.all_failed:
        result = await db.execute(
            select(UploadJob).where(UploadJob.status == JobStatus.FAILED)
        )
        jobs = list(result.scalars().all())
    elif body.job_ids:
        jobs = []
        for jid in body.job_ids:
            job = await db.get(UploadJob, jid)
            if job and job.status == JobStatus.FAILED:
                jobs.append(job)
    else:
        raise HTTPException(status_code=400, detail="job_ids 또는 all_failed=true를 지정하세요")

    if not jobs:
        return {"retried_count": 0, "skipped_count": 0}

    # RQ 연결
    try:
        from rq import Queue
        conn = _get_redis_conn()
        q = Queue("default", connection=conn)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"큐 서비스 연결 실패: {str(e)}")

    retried = 0
    for job in jobs:
        job.status = JobStatus.QUEUED
        job.progress = 0
        job.error_message = None
        job.started_at = None
        job.completed_at = None
        task_func = _get_task_func(job.job_type.value if hasattr(job.job_type, 'value') else str(job.job_type))
        try:
            q.enqueue(task_func, str(job.id), job_timeout="10m")
            retried += 1
        except Exception:
            job.status = JobStatus.FAILED
            job.error_message = "재시도 큐 등록 실패"

    conn.close()

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.JOB_RETRY,
        target_type="upload_job",
        description=f"일괄 재시도: {retried}건",
        after_data={"retried_count": retried, "total_target": len(jobs)},
    ))
    await db.flush()
    return {"retried_count": retried, "skipped_count": len(jobs) - retried}
