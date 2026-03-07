"""
정산 관리자 - 감사 확장 API
비정상 활동 감지 + 로그인 이력
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User

router = APIRouter()


@router.get("/anomalies")
async def get_anomalies(
    period: str = Query("7d", description="감지 기간 (24h, 7d, 30d)"),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """비정상 활동 감지"""

    period_map = {"24h": 1, "7d": 7, "30d": 30}
    days = period_map.get(period, 7)
    threshold = datetime.utcnow() - timedelta(days=days)

    anomalies = []

    # 1. 대량 삭제 (1시간 내 동일 사용자 DELETE 10건+)
    bulk_deletes = (await db.execute(text("""
        SELECT
            al.user_id,
            u.name AS user_name,
            u.email AS user_email,
            COUNT(*) AS cnt,
            MIN(al.created_at) AS first_at,
            MAX(al.created_at) AS last_at
        FROM audit_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.action::text LIKE '%DELETE%'
          AND al.created_at >= :threshold
        GROUP BY al.user_id, u.name, u.email,
                 date_trunc('hour', al.created_at)
        HAVING COUNT(*) >= 10
        ORDER BY cnt DESC
    """), {"threshold": threshold})).mappings().all()

    for row in bulk_deletes:
        anomalies.append({
            "type": "bulk_delete",
            "severity": "high",
            "title": f"대량 삭제: {row['user_name']} ({row['cnt']}건)",
            "description": f"{row['user_email']}이(가) 1시간 내 {row['cnt']}건의 삭제 작업 수행",
            "user_email": row["user_email"],
            "count": row["cnt"],
            "first_at": row["first_at"].isoformat() if row["first_at"] else None,
            "last_at": row["last_at"].isoformat() if row["last_at"] else None,
        })

    # 2. 비정상 시간 활동 (22:00~06:00 데이터 변경)
    night_actions = (await db.execute(text("""
        SELECT
            al.user_id,
            u.name AS user_name,
            u.email AS user_email,
            al.action::text AS action,
            al.created_at,
            al.ip_address,
            al.description
        FROM audit_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.created_at >= :threshold
          AND al.action::text NOT IN ('USER_LOGIN', 'USER_LOGOUT')
          AND (EXTRACT(HOUR FROM al.created_at + INTERVAL '9 hours') >= 22
               OR EXTRACT(HOUR FROM al.created_at + INTERVAL '9 hours') < 6)
        ORDER BY al.created_at DESC
        LIMIT 20
    """), {"threshold": threshold})).mappings().all()

    for row in night_actions:
        anomalies.append({
            "type": "night_activity",
            "severity": "medium",
            "title": f"야간 활동: {row['user_name']}",
            "description": f"{row['action']} - {row['description'] or ''}",
            "user_email": row["user_email"],
            "action": row["action"],
            "ip_address": row["ip_address"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        })

    # 3. 대량 금액 변경 (1억 이상 전표 수정)
    large_changes = (await db.execute(text("""
        SELECT
            al.user_id,
            u.name AS user_name,
            u.email AS user_email,
            al.action::text AS action,
            al.target_id,
            al.created_at,
            al.before_data->>'total_amount' AS before_amount,
            al.after_data->>'total_amount' AS after_amount,
            al.description
        FROM audit_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.created_at >= :threshold
          AND al.action::text IN ('VOUCHER_UPDATE', 'VOUCHER_CREATE')
          AND (
            COALESCE((al.after_data->>'total_amount')::numeric, 0) >= 100000000
            OR COALESCE((al.before_data->>'total_amount')::numeric, 0) >= 100000000
          )
        ORDER BY al.created_at DESC
        LIMIT 10
    """), {"threshold": threshold})).mappings().all()

    for row in large_changes:
        anomalies.append({
            "type": "large_amount",
            "severity": "high",
            "title": f"대량 금액: {row['user_name']}",
            "description": f"{row['action']} - {row['before_amount'] or '0'} → {row['after_amount'] or '0'}",
            "user_email": row["user_email"],
            "target_id": str(row["target_id"]) if row["target_id"] else None,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        })

    # 4. 마감 후 수정 시도
    lock_violations = (await db.execute(text("""
        SELECT
            al.user_id,
            u.name AS user_name,
            u.email AS user_email,
            al.action::text AS action,
            al.created_at,
            al.description
        FROM audit_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.created_at >= :threshold
          AND al.action::text IN ('PERIOD_UNLOCK', 'PERIOD_ADJUST')
        ORDER BY al.created_at DESC
        LIMIT 10
    """), {"threshold": threshold})).mappings().all()

    for row in lock_violations:
        anomalies.append({
            "type": "lock_change",
            "severity": "medium",
            "title": f"마감 변경: {row['user_name']}",
            "description": f"{row['action']} - {row['description'] or ''}",
            "user_email": row["user_email"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        })

    # severity 순 정렬
    severity_order = {"high": 0, "medium": 1, "low": 2}
    anomalies.sort(key=lambda a: severity_order.get(a["severity"], 9))

    return {"anomalies": anomalies, "total": len(anomalies), "period": period}


@router.get("/login-history")
async def get_login_history(
    user_id: str = Query("", description="특정 사용자 필터"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """로그인/로그아웃 이력"""

    offset = (page - 1) * page_size

    where_clause = "WHERE al.action::text IN ('USER_LOGIN', 'USER_LOGOUT')"
    params: dict = {"limit": page_size, "offset": offset}

    if user_id:
        where_clause += " AND al.user_id = :user_id::uuid"
        params["user_id"] = user_id

    # 총 건수
    total = (await db.execute(text(f"""
        SELECT COUNT(*) FROM audit_logs al {where_clause}
    """), params)).scalar() or 0

    # 이력 조회
    rows = (await db.execute(text(f"""
        SELECT
            al.id,
            al.user_id,
            u.name AS user_name,
            u.email AS user_email,
            al.action::text AS action,
            al.ip_address,
            al.user_agent,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        {where_clause}
        ORDER BY al.created_at DESC
        LIMIT :limit OFFSET :offset
    """), params)).mappings().all()

    sessions = []
    for row in rows:
        sessions.append({
            "id": str(row["id"]),
            "user_id": str(row["user_id"]) if row["user_id"] else None,
            "user_name": row["user_name"],
            "user_email": row["user_email"],
            "action": row["action"],
            "ip_address": row["ip_address"],
            "user_agent": row["user_agent"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        })

    # 사용자별 최근 로그인 통계
    user_stats = (await db.execute(text("""
        SELECT
            u.id,
            u.name,
            u.email,
            u.last_login_at,
            COUNT(*) FILTER (WHERE al.action::text = 'USER_LOGIN') AS login_count,
            COUNT(DISTINCT al.ip_address) AS ip_count
        FROM users u
        LEFT JOIN audit_logs al ON al.user_id = u.id
            AND al.action::text IN ('USER_LOGIN', 'USER_LOGOUT')
            AND al.created_at >= NOW() - INTERVAL '30 days'
        WHERE u.is_active = true
        GROUP BY u.id, u.name, u.email, u.last_login_at
        ORDER BY u.last_login_at DESC NULLS LAST
    """))).mappings().all()

    users = [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "email": row["email"],
            "last_login_at": row["last_login_at"].isoformat() if row["last_login_at"] else None,
            "login_count_30d": row["login_count"],
            "ip_count_30d": row["ip_count"],
        }
        for row in user_stats
    ]

    return {
        "sessions": sessions,
        "total": total,
        "page": page,
        "page_size": page_size,
        "user_stats": users,
    }
