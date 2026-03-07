"""
정산 관리자 - Worker Job 현황 API
업로드 작업 + RQ 큐 상태 통합 관리
"""

import os

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User

router = APIRouter()


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
