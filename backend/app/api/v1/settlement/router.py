"""
정산 도메인 - 통합 라우터
모든 정산 하위 라우터를 하나로 통합
"""

from fastapi import APIRouter

from app.api.v1.settlement import (
    counterparties,
    vouchers,
    receipts,
    payments,
    upload,
    templates,
    verification,
    dashboard,
    lock,
)

settlement_router = APIRouter()

# 거래처
settlement_router.include_router(
    counterparties.router, prefix="/counterparties", tags=["정산-거래처"]
)

# 전표
settlement_router.include_router(
    vouchers.router, prefix="/vouchers", tags=["정산-전표"]
)

# 입금
settlement_router.include_router(
    receipts.router, prefix="/vouchers", tags=["정산-입금"]
)

# 송금
settlement_router.include_router(
    payments.router, prefix="/vouchers", tags=["정산-송금"]
)

# 업로드
settlement_router.include_router(
    upload.router, prefix="/upload", tags=["정산-업로드"]
)

# 템플릿
settlement_router.include_router(
    templates.router, prefix="/upload/templates", tags=["정산-템플릿"]
)

# 검증/승인
settlement_router.include_router(
    verification.router, prefix="/verification", tags=["정산-검증"]
)

# 대시보드
settlement_router.include_router(
    dashboard.router, prefix="/dashboard", tags=["정산-대시보드"]
)

# 마감
settlement_router.include_router(
    lock.router, prefix="/lock", tags=["정산-마감"]
)
