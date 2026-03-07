"""
정산 관리자 - 통합 라우터
admin 역할 전용 엔드포인트
"""

from fastapi import APIRouter

from app.api.v1.settlement.admin import (
    dashboard, integrity, system,
    audit_extended, jobs, period_lock,
)

admin_router = APIRouter()

# Phase 1
admin_router.include_router(
    dashboard.router, prefix="/dashboard", tags=["관리-대시보드"]
)
admin_router.include_router(
    integrity.router, prefix="/integrity", tags=["관리-정합성"]
)
admin_router.include_router(
    system.router, prefix="/system", tags=["관리-시스템"]
)

# Phase 2
admin_router.include_router(
    audit_extended.router, prefix="/audit", tags=["관리-감사"]
)
admin_router.include_router(
    jobs.router, prefix="/jobs", tags=["관리-작업"]
)
admin_router.include_router(
    period_lock.router, prefix="/period-lock", tags=["관리-마감"]
)
