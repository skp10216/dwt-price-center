"""
정산 관리자 - 시스템 헬스 API (고도화)
PostgreSQL, Redis, Worker, 서버 리소스 상태 + 메트릭 히스토리
"""

import os
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, text, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User
from app.models.system_metric import SystemMetric

router = APIRouter()

# 메트릭 저장 최소 간격 (초)
METRIC_SAVE_INTERVAL = 300  # 5분


def _read_proc_meminfo() -> dict:
    """Parse /proc/meminfo"""
    meminfo = {}
    with open("/proc/meminfo") as f:
        for line in f:
            parts = line.split(":")
            if len(parts) == 2:
                meminfo[parts[0].strip()] = int(parts[1].strip().split()[0])
    return meminfo


def _get_server_metrics() -> dict:
    """서버 리소스 수집 (/proc 기반)"""
    meminfo = _read_proc_meminfo()

    mem_total = meminfo.get("MemTotal", 0) / 1024
    mem_available = meminfo.get("MemAvailable", 0) / 1024
    mem_used = mem_total - mem_available
    mem_percent = round(mem_used / mem_total * 100, 1) if mem_total > 0 else 0

    swap_total = meminfo.get("SwapTotal", 0) / 1024
    swap_free = meminfo.get("SwapFree", 0) / 1024
    swap_used = swap_total - swap_free
    swap_percent = round(swap_used / swap_total * 100, 1) if swap_total > 0 else 0

    statvfs = os.statvfs("/")
    disk_total = statvfs.f_frsize * statvfs.f_blocks / (1024 ** 3)
    disk_free = statvfs.f_frsize * statvfs.f_bavail / (1024 ** 3)
    disk_used = disk_total - disk_free
    disk_percent = round(disk_used / disk_total * 100, 1) if disk_total > 0 else 0

    with open("/proc/loadavg") as f:
        loadavg = f.read().split()[:3]

    # CPU 코어 수
    cpu_cores = 0
    with open("/proc/cpuinfo") as f:
        for line in f:
            if line.startswith("processor"):
                cpu_cores += 1

    with open("/proc/uptime") as f:
        uptime_secs = float(f.read().split()[0])
        days = int(uptime_secs // 86400)
        hours = int((uptime_secs % 86400) // 3600)

    return {
        "status": "healthy",
        "memory": {
            "total_mb": round(mem_total),
            "used_mb": round(mem_used),
            "percent": mem_percent,
        },
        "swap": {
            "total_mb": round(swap_total),
            "used_mb": round(swap_used),
            "percent": swap_percent,
        },
        "disk": {
            "total_gb": round(disk_total, 1),
            "used_gb": round(disk_used, 1),
            "percent": disk_percent,
        },
        "cpu_loadavg": [float(x) for x in loadavg],
        "cpu_cores": cpu_cores or 1,
        "uptime": f"{days}d {hours}h",
        "uptime_seconds": int(uptime_secs),
    }


async def _get_pg_metrics(db: AsyncSession) -> dict:
    """PostgreSQL 메트릭 수집"""
    start = time.time()
    pg_version = (await db.execute(text("SELECT version()"))).scalar()
    pg_time = round((time.time() - start) * 1000, 1)

    # 활성/전체 연결
    conn_stats = (await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE state = 'active') AS active,
            COUNT(*) FILTER (WHERE state = 'idle') AS idle,
            COUNT(*) AS total
        FROM pg_stat_activity
        WHERE backend_type = 'client backend'
    """))).mappings().first()

    # DB 크기
    db_size = (await db.execute(text(
        "SELECT pg_size_pretty(pg_database_size(current_database()))"
    ))).scalar()

    # 주요 테이블 행 수 + 크기 (pg_total_relation_size)
    table_stats = {}
    for table in [
        "vouchers", "counterparty_transactions", "counterparties",
        "audit_logs", "upload_jobs", "netting_records",
        "return_items", "intake_items", "users", "system_metrics",
    ]:
        try:
            row = (await db.execute(text(f"""
                SELECT
                    (SELECT COUNT(*) FROM {table}) AS row_count,
                    pg_size_pretty(pg_total_relation_size('{table}')) AS size
            """))).mappings().first()
            table_stats[table] = {
                "rows": row["row_count"],
                "size": row["size"],
            }
        except Exception:
            table_stats[table] = {"rows": -1, "size": "N/A"}

    # 최근 1시간 에러 로그 수 + 최근 3건
    error_count = (await db.execute(text("""
        SELECT COUNT(*) FROM audit_logs
        WHERE created_at > NOW() - INTERVAL '1 hour'
          AND (action::text ILIKE '%error%' OR action::text ILIKE '%fail%')
    """))).scalar() or 0

    recent_errors = (await db.execute(text("""
        SELECT action::text, description, created_at
        FROM audit_logs
        WHERE action::text ILIKE '%fail%'
           OR action::text ILIKE '%error%'
           OR description ILIKE '%실패%'
           OR description ILIKE '%에러%'
        ORDER BY created_at DESC
        LIMIT 3
    """))).mappings().all()

    error_list = [
        {
            "action": row["action"],
            "description": (row["description"] or "")[:100],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in recent_errors
    ]

    return {
        "status": "healthy",
        "response_ms": pg_time,
        "version": pg_version[:60] if pg_version else None,
        "connections": {
            "active": conn_stats["active"] if conn_stats else 0,
            "idle": conn_stats["idle"] if conn_stats else 0,
            "total": conn_stats["total"] if conn_stats else 0,
        },
        "active_connections": conn_stats["active"] if conn_stats else 0,
        "database_size": db_size,
        "table_stats": table_stats,
        "table_counts": {k: v["rows"] for k, v in table_stats.items()},
        "error_summary": {
            "last_hour_count": error_count,
            "recent": error_list,
        },
    }


def _get_redis_metrics() -> dict:
    """Redis 메트릭 수집"""
    import redis as redis_lib
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = redis_lib.from_url(redis_url, socket_timeout=3)

    start = time.time()
    r.ping()
    redis_time = round((time.time() - start) * 1000, 1)

    info = r.info(section="memory")
    memory_used = info.get("used_memory_human", "N/A")
    memory_used_bytes = info.get("used_memory", 0)
    memory_peak = info.get("used_memory_peak_human", "N/A")

    key_count = r.dbsize()

    queues = {}
    for q_name in ["high", "default", "low"]:
        queues[q_name] = r.llen(f"rq:queue:{q_name}")

    worker_keys = r.keys("rq:worker:*")
    worker_count = len(worker_keys)
    failed_count = r.llen("rq:queue:failed")

    r.close()

    return {
        "status": "healthy",
        "response_ms": redis_time,
        "memory_used": memory_used,
        "memory_used_bytes": memory_used_bytes,
        "memory_peak": memory_peak,
        "key_count": key_count,
        "queues": queues,
        "workers": worker_count,
        "failed_jobs": failed_count,
    }


async def _save_metric_snapshot(db: AsyncSession, services: dict) -> bool:
    """메트릭 스냅샷 저장 (최소 간격 이내면 스킵)"""
    cutoff = datetime.utcnow() - timedelta(seconds=METRIC_SAVE_INTERVAL)
    latest = (await db.execute(
        select(SystemMetric.checked_at)
        .where(SystemMetric.metric_type == "health_snapshot")
        .order_by(SystemMetric.checked_at.desc())
        .limit(1)
    )).scalar()

    if latest and latest > cutoff:
        return False  # 간격 미달, 스킵

    pg = services.get("postgresql", {})
    rd = services.get("redis", {})
    sv = services.get("server", {})

    snapshot = {
        "memory_percent": sv.get("memory", {}).get("percent", 0),
        "swap_percent": sv.get("swap", {}).get("percent", 0),
        "disk_percent": sv.get("disk", {}).get("percent", 0),
        "cpu_load_1m": sv.get("cpu_loadavg", [0])[0] if sv.get("cpu_loadavg") else 0,
        "cpu_cores": sv.get("cpu_cores", 1),
        "pg_response_ms": pg.get("response_ms", 0),
        "pg_connections_active": pg.get("connections", {}).get("active", 0),
        "pg_connections_total": pg.get("connections", {}).get("total", 0),
        "redis_response_ms": rd.get("response_ms", 0),
        "redis_memory_bytes": rd.get("memory_used_bytes", 0),
        "redis_workers": rd.get("workers", 0),
        "queue_total": sum(rd.get("queues", {}).values()),
        "failed_jobs": rd.get("failed_jobs", 0),
        "table_counts": pg.get("table_counts", {}),
    }

    db.add(SystemMetric(
        checked_at=datetime.utcnow(),
        metric_type="health_snapshot",
        data=snapshot,
    ))

    # 30일 이상 오래된 메트릭 정리
    old_cutoff = datetime.utcnow() - timedelta(days=30)
    await db.execute(
        delete(SystemMetric).where(SystemMetric.checked_at < old_cutoff)
    )

    await db.flush()
    return True


@router.get("/health")
async def get_system_health(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """시스템 전체 헬스 체크 + 메트릭 스냅샷 저장"""

    services = {}

    # 1. PostgreSQL
    try:
        services["postgresql"] = await _get_pg_metrics(db)
    except Exception as e:
        services["postgresql"] = {"status": "unhealthy", "error": str(e)[:200]}

    # 2. Redis
    try:
        services["redis"] = _get_redis_metrics()
    except Exception as e:
        services["redis"] = {"status": "unhealthy", "error": str(e)[:200]}

    # 3. 서버 리소스
    try:
        services["server"] = _get_server_metrics()
    except Exception as e:
        services["server"] = {"status": "unknown", "error": str(e)[:200]}

    # 전체 상태
    all_healthy = all(s.get("status") == "healthy" for s in services.values())

    # 임계치 경고 생성
    alerts = _generate_alerts(services)

    # 메트릭 스냅샷 저장 (5분 간격)
    try:
        await _save_metric_snapshot(db, services)
    except Exception:
        pass  # 저장 실패해도 헬스 응답에 영향 없음

    return {
        "overall": "healthy" if all_healthy else "degraded",
        "checked_at": datetime.utcnow().isoformat(),
        "services": services,
        "alerts": alerts,
    }


def _generate_alerts(services: dict) -> list[dict]:
    """임계치 기반 경고 생성"""
    alerts = []
    sv = services.get("server", {})
    rd = services.get("redis", {})
    pg = services.get("postgresql", {})

    # 메모리
    mem_pct = sv.get("memory", {}).get("percent", 0)
    if mem_pct > 90:
        alerts.append({"level": "critical", "service": "server", "message": f"메모리 사용률 {mem_pct}% — 즉시 점검 필요"})
    elif mem_pct > 80:
        alerts.append({"level": "warning", "service": "server", "message": f"메모리 사용률 {mem_pct}% — 모니터링 필요"})

    # Swap
    swap_pct = sv.get("swap", {}).get("percent", 0)
    if swap_pct > 50:
        alerts.append({"level": "warning", "service": "server", "message": f"Swap 사용률 {swap_pct}% — 메모리 부족 징후"})

    # 디스크
    disk_pct = sv.get("disk", {}).get("percent", 0)
    if disk_pct > 90:
        alerts.append({"level": "critical", "service": "server", "message": f"디스크 사용률 {disk_pct}% — 즉시 정리 필요"})
    elif disk_pct > 80:
        alerts.append({"level": "warning", "service": "server", "message": f"디스크 사용률 {disk_pct}% — 모니터링 필요"})

    # CPU 로드
    loadavg = sv.get("cpu_loadavg", [0, 0, 0])
    cores = sv.get("cpu_cores", 1)
    if loadavg and loadavg[0] > cores * 2:
        alerts.append({"level": "critical", "service": "server", "message": f"CPU 로드 {loadavg[0]:.1f} (코어: {cores}) — 과부하"})
    elif loadavg and loadavg[0] > cores * 1.5:
        alerts.append({"level": "warning", "service": "server", "message": f"CPU 로드 {loadavg[0]:.1f} (코어: {cores}) — 주의"})

    # Redis workers
    workers = rd.get("workers", 0)
    if rd.get("status") == "healthy" and workers == 0:
        alerts.append({"level": "critical", "service": "redis", "message": "Worker 프로세스가 0개 — 작업 처리 불가"})

    # 큐 적체
    queue_total = sum(rd.get("queues", {}).values())
    if queue_total > 100:
        alerts.append({"level": "warning", "service": "redis", "message": f"큐 적체 {queue_total}건 — Worker 확인 필요"})

    # 실패 작업
    failed = rd.get("failed_jobs", 0)
    if failed > 10:
        alerts.append({"level": "warning", "service": "redis", "message": f"실패 작업 {failed}건 — 재시도 검토 필요"})

    # DB 연결
    pg_total = pg.get("connections", {}).get("total", 0)
    if pg_total > 80:
        alerts.append({"level": "warning", "service": "postgresql", "message": f"DB 연결 {pg_total}개 — 연결 풀 점검 필요"})

    # 서비스 장애
    for svc_name, svc in services.items():
        if svc.get("status") not in ("healthy", "unknown"):
            alerts.append({"level": "critical", "service": svc_name, "message": f"{svc_name} 서비스 응답 없음"})

    return alerts


@router.get("/health/history")
async def get_health_history(
    range: str = Query("24h", description="조회 범위: 24h, 7d, 30d"),
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """메트릭 히스토리 조회 — 추세 차트용"""

    range_map = {
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }
    delta = range_map.get(range, timedelta(hours=24))
    since = datetime.utcnow() - delta

    rows = (await db.execute(
        select(SystemMetric)
        .where(
            SystemMetric.metric_type == "health_snapshot",
            SystemMetric.checked_at >= since,
        )
        .order_by(SystemMetric.checked_at.asc())
    )).scalars().all()

    # 데이터 포인트가 너무 많으면 간격별로 샘플링
    max_points = 200
    if len(rows) > max_points:
        step = len(rows) // max_points
        rows = rows[::step]

    points = []
    for row in rows:
        d = row.data or {}
        points.append({
            "t": row.checked_at.isoformat(),
            "mem": d.get("memory_percent", 0),
            "swap": d.get("swap_percent", 0),
            "disk": d.get("disk_percent", 0),
            "cpu": d.get("cpu_load_1m", 0),
            "cpu_cores": d.get("cpu_cores", 1),
            "pg_ms": d.get("pg_response_ms", 0),
            "pg_conn": d.get("pg_connections_active", 0),
            "redis_ms": d.get("redis_response_ms", 0),
            "redis_mem": d.get("redis_memory_bytes", 0),
            "workers": d.get("redis_workers", 0),
            "queue": d.get("queue_total", 0),
            "failed": d.get("failed_jobs", 0),
        })

    # 테이블 증가 추세 (첫 vs 마지막 스냅샷)
    table_growth = {}
    if len(rows) >= 2:
        first_data = rows[0].data or {}
        last_data = rows[-1].data or {}
        first_counts = first_data.get("table_counts", {})
        last_counts = last_data.get("table_counts", {})
        for table in last_counts:
            before = first_counts.get(table, 0)
            after = last_counts.get(table, 0)
            if isinstance(before, int) and isinstance(after, int):
                table_growth[table] = {
                    "before": before,
                    "after": after,
                    "change": after - before,
                }

    return {
        "range": range,
        "points": points,
        "point_count": len(points),
        "table_growth": table_growth,
    }
