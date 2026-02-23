"""
단가표 통합 관리 시스템 - API v1 라우터
모든 v1 엔드포인트를 여기서 통합
"""

from fastapi import APIRouter

from app.api.v1 import (
    auth,
    users,
    ssot_models,
    grades,
    deductions,
    partners,
    branches,
    uploads,
    hq_prices,
    compare,
    my_lists,
    audit,
)
from app.api.v1.settlement.router import settlement_router

api_router = APIRouter()

# 인증
api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["인증"]
)

# 사용자 관리
api_router.include_router(
    users.router,
    prefix="/users",
    tags=["사용자 관리"]
)

# SSOT 모델 관리
api_router.include_router(
    ssot_models.router,
    prefix="/ssot-models",
    tags=["SSOT 모델"]
)

# 등급 관리
api_router.include_router(
    grades.router,
    prefix="/grades",
    tags=["등급"]
)

# 차감 관리
api_router.include_router(
    deductions.router,
    prefix="/deductions",
    tags=["차감"]
)

# 지사 관리
api_router.include_router(
    branches.router,
    prefix="/branches",
    tags=["지사"]
)

# 거래처 관리
api_router.include_router(
    partners.router,
    prefix="/partners",
    tags=["거래처"]
)

# 업로드 관리
api_router.include_router(
    uploads.router,
    prefix="/uploads",
    tags=["업로드"]
)

# 본사 단가
api_router.include_router(
    hq_prices.router,
    prefix="/hq-prices",
    tags=["본사 단가"]
)

# 비교
api_router.include_router(
    compare.router,
    prefix="/compare",
    tags=["비교"]
)

# 내 리스트
api_router.include_router(
    my_lists.router,
    prefix="/my-lists",
    tags=["내 리스트"]
)

# 감사로그
api_router.include_router(
    audit.router,
    prefix="/audit-logs",
    tags=["감사로그"]
)

# ============================================================================
# 정산 도메인 (settlement.dwt.price 전용)
# ============================================================================
api_router.include_router(
    settlement_router,
    prefix="/settlement",
    tags=["정산"]
)
