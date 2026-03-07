"""
정산 관리자 - 시스템 헬스 API
PostgreSQL, Redis, Worker, 서버 리소스 상태 조회
"""

import os
import time
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User

router = APIRouter()


@router.get("/health")
async def get_system_health(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """시스템 전체 헬스 체크"""

    services = {}

    # 1. PostgreSQL
    try:
        start = time.time()
        pg_version = (await db.execute(text("SELECT version()"))).scalar()
        pg_time = round((time.time() - start) * 1000, 1)

        # 활성 연결 수
        active_conns = (await db.execute(text(
            "SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active'"
        ))).scalar() or 0

        # DB 크기
        db_size = (await db.execute(text(
            "SELECT pg_size_pretty(pg_database_size(current_database()))"
        ))).scalar()

        # 주요 테이블 행 수
        table_counts = {}
        for table in ["vouchers", "counterparty_transactions", "counterparties",
                       "audit_logs", "upload_jobs", "netting_records",
                       "return_items", "intake_items", "users"]:
            try:
                cnt = (await db.execute(text(f"SELECT COUNT(*) FROM {table}"))).scalar()
                table_counts[table] = cnt
            except Exception:
                table_counts[table] = -1

        services["postgresql"] = {
            "status": "healthy",
            "response_ms": pg_time,
            "version": pg_version[:60] if pg_version else None,
            "active_connections": active_conns,
            "database_size": db_size,
            "table_counts": table_counts,
        }
    except Exception as e:
        services["postgresql"] = {
            "status": "unhealthy",
            "error": str(e)[:200],
        }

    # 2. Redis
    try:
        import redis as redis_lib
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = redis_lib.from_url(redis_url, socket_timeout=3)
        start = time.time()
        r.ping()
        redis_time = round((time.time() - start) * 1000, 1)

        info = r.info(section="memory")
        memory_used = info.get("used_memory_human", "N/A")

        key_count = r.dbsize()

        # RQ 큐 상태
        queues = {}
        for q_name in ["high", "default", "low"]:
            q_key = f"rq:queue:{q_name}"
            queues[q_name] = r.llen(q_key)

        # 워커 상태
        worker_keys = r.keys("rq:worker:*")
        worker_count = len(worker_keys)

        # 실패 큐
        failed_count = r.llen("rq:queue:failed")

        services["redis"] = {
            "status": "healthy",
            "response_ms": redis_time,
            "memory_used": memory_used,
            "key_count": key_count,
            "queues": queues,
            "workers": worker_count,
            "failed_jobs": failed_count,
        }
        r.close()
    except Exception as e:
        services["redis"] = {
            "status": "unhealthy",
            "error": str(e)[:200],
        }

    # 3. 서버 리소스
    try:
        # 메모리
        with open("/proc/meminfo") as f:
            meminfo = {}
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    key = parts[0].strip()
                    val = parts[1].strip().split()[0]
                    meminfo[key] = int(val)

        mem_total = meminfo.get("MemTotal", 0) / 1024  # MB
        mem_available = meminfo.get("MemAvailable", 0) / 1024
        mem_used = mem_total - mem_available
        mem_percent = round(mem_used / mem_total * 100, 1) if mem_total > 0 else 0

        swap_total = meminfo.get("SwapTotal", 0) / 1024
        swap_free = meminfo.get("SwapFree", 0) / 1024
        swap_used = swap_total - swap_free
        swap_percent = round(swap_used / swap_total * 100, 1) if swap_total > 0 else 0

        # 디스크
        statvfs = os.statvfs("/")
        disk_total = statvfs.f_frsize * statvfs.f_blocks / (1024 ** 3)  # GB
        disk_free = statvfs.f_frsize * statvfs.f_bavail / (1024 ** 3)
        disk_used = disk_total - disk_free
        disk_percent = round(disk_used / disk_total * 100, 1) if disk_total > 0 else 0

        # CPU (loadavg)
        with open("/proc/loadavg") as f:
            loadavg = f.read().split()[:3]

        # 업타임
        with open("/proc/uptime") as f:
            uptime_secs = float(f.read().split()[0])
            days = int(uptime_secs // 86400)
            hours = int((uptime_secs % 86400) // 3600)

        services["server"] = {
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
            "uptime": f"{days}d {hours}h",
        }
    except Exception as e:
        services["server"] = {
            "status": "unknown",
            "error": str(e)[:200],
        }

    all_healthy = all(
        s.get("status") == "healthy"
        for s in services.values()
    )

    return {
        "overall": "healthy" if all_healthy else "degraded",
        "checked_at": datetime.utcnow().isoformat(),
        "services": services,
    }
