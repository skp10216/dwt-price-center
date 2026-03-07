"""
정산 관리자 - 기간 마감 일괄 관리 API
마감 현황 조회 + 일괄 마감/해제 + 마감 이력
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Body
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User

router = APIRouter()


@router.get("/status")
async def get_period_lock_status(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """전체 기간 마감 현황"""

    locks = (await db.execute(text("""
        SELECT
            pl.id,
            pl.year_month,
            pl.status::text AS status,
            pl.locked_at,
            pl.locked_by,
            u.name AS locked_by_name,
            u.email AS locked_by_email,
            pl.created_at,
            pl.updated_at
        FROM period_locks pl
        LEFT JOIN users u ON u.id = pl.locked_by
        ORDER BY pl.year_month DESC
        LIMIT 24
    """))).mappings().all()

    items = [
        {
            "id": str(row["id"]),
            "year_month": row["year_month"],
            "status": row["status"],
            "locked_at": row["locked_at"].isoformat() if row["locked_at"] else None,
            "locked_by_name": row["locked_by_name"],
            "locked_by_email": row["locked_by_email"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        for row in locks
    ]

    # 상태별 카운트
    status_counts = {}
    for item in items:
        s = item["status"]
        status_counts[s] = status_counts.get(s, 0) + 1

    # 마감 관련 감사 이력 (최근 20건)
    history = (await db.execute(text("""
        SELECT
            al.id,
            al.action::text AS action,
            al.description,
            al.created_at,
            u.name AS user_name,
            u.email AS user_email
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.action::text IN ('PERIOD_LOCK', 'PERIOD_UNLOCK', 'PERIOD_ADJUST')
        ORDER BY al.created_at DESC
        LIMIT 20
    """))).mappings().all()

    audit_history = [
        {
            "id": str(row["id"]),
            "action": row["action"],
            "description": row["description"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "user_name": row["user_name"],
            "user_email": row["user_email"],
        }
        for row in history
    ]

    return {
        "periods": items,
        "status_counts": status_counts,
        "history": audit_history,
    }
