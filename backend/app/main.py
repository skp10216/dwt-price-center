"""
단가표 통합 관리 시스템 - FastAPI 메인 애플리케이션
"""

import json
import logging
from contextlib import asynccontextmanager
from decimal import Decimal
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.core.config import settings
from app.core.database import init_db, AsyncSessionLocal
from app.core.errors import AppError, classify_exception, ErrorCode
from app.api.v1.router import api_router

logger = logging.getLogger(__name__)


def _convert_decimals(obj: Any) -> Any:
    """재귀적으로 Decimal을 float로 변환"""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _convert_decimals(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_convert_decimals(i) for i in obj]
    return obj


class DecimalJSONResponse(JSONResponse):
    """Decimal 안전 JSON 응답 — Pydantic 직렬화 후에도 문자열 Decimal을 float 변환"""
    def render(self, content: Any) -> bytes:
        content = _convert_decimals(content)
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 시작/종료 이벤트"""
    # 시작 시
    await init_db()

    # PostgreSQL enum 동기화 (Python enum에 추가된 값을 DB에 자동 반영)
    await sync_pg_enums()

    # 초기 관리자 계정 생성
    await create_initial_admin()

    # 기본 등급 생성
    await create_default_grades()

    yield

    # 종료 시
    pass


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="본사 판매 단가표를 SSOT 기반으로 통합 관리하고, 거래처별 단가표를 비교하는 시스템",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    default_response_class=DecimalJSONResponse,
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 예외 핸들러 ──

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    """구조화된 AppError 핸들러 — 에러 코드 + 사용자 친화 메시지 반환"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.error_code.value,
                "message": exc.error_message,
                "details": exc.error_details,
            }
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """
    기존 HTTPException 호환 핸들러.
    detail이 구조화된 dict면 그대로, 문자열이면 감싸서 반환.
    """
    detail = exc.detail

    # 이미 구조화된 에러 (code/message 포함)
    if isinstance(detail, dict) and "code" in detail and "message" in detail:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": detail}
        )

    # 문자열 detail — 기존 한국어 메시지는 그대로 사용
    message = detail if isinstance(detail, str) else str(detail)
    code = _status_to_error_code(exc.status_code)

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": None,
            }
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """유효성 검증 예외 핸들러"""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
        })

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": ErrorCode.VALIDATION_ERROR.value,
                "message": "입력값 검증에 실패했습니다.",
                "details": {"errors": errors}
            }
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """
    모든 미처리 예외 핸들러.
    DB 에러(serialization, deadlock, integrity)를 자동으로 사용자 친화 메시지로 변환.
    원본 에러는 서버 로그에만 기록.
    """
    # 서버 로그에 원본 에러 기록 (디버깅/모니터링용)
    logger.error(
        f"[{request.method} {request.url.path}] Unhandled exception: {type(exc).__name__}: {exc}",
        exc_info=True,
    )

    # DB/시스템 에러를 사용자 친화 에러로 자동 변환
    app_error = classify_exception(exc)

    return JSONResponse(
        status_code=app_error.status_code,
        content={
            "error": {
                "code": app_error.error_code.value,
                "message": app_error.error_message,
                # DEBUG 모드에서도 시스템 에러 원문은 노출하지 않음
                "details": None,
            }
        }
    )


def _status_to_error_code(status_code: int) -> str:
    """HTTP 상태 코드 → 에러 코드 문자열"""
    mapping = {
        400: ErrorCode.VALIDATION_ERROR.value,
        401: ErrorCode.UNAUTHORIZED.value,
        403: ErrorCode.FORBIDDEN.value,
        404: ErrorCode.NOT_FOUND.value,
        409: ErrorCode.CONCURRENT_MODIFICATION.value,
        413: ErrorCode.FILE_TOO_LARGE.value,
        422: ErrorCode.VALIDATION_ERROR.value,
        423: ErrorCode.RESOURCE_LOCKED.value,
    }
    return mapping.get(status_code, ErrorCode.INTERNAL_ERROR.value)


# API 라우터 등록
app.include_router(api_router, prefix="/api/v1")


# 헬스 체크
@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {"status": "healthy", "version": settings.APP_VERSION}


async def sync_pg_enums():
    """
    Python enum에 정의된 값 중 PostgreSQL enum 타입에 없는 값을 자동 추가.
    앱 시작마다 실행되어, enums.py 수정 후 DB 수동 ALTER를 잊는 문제를 방지.
    """
    from sqlalchemy import text
    from app.core.database import engine

    # SQLAlchemy model에서 사용하는 (PythonEnum, pg_enum_name) 매핑
    # models/ 디렉터리의 SQLEnum(..., name="xxx") 선언과 일치해야 함
    from app.models import enums as E
    enum_map: dict[str, type] = {
        "audit_action": E.AuditAction,
        "voucher_type": E.VoucherType,
        "settlement_status": E.SettlementStatus,
        "payment_status": E.PaymentStatus,
        "transaction_type": E.TransactionType,
        "transaction_source": E.TransactionSource,
        "transaction_status": E.TransactionStatus,
        "netting_status": E.NettingStatus,
        "counterparty_type": E.CounterpartyType,
        "user_role": E.UserRole,
        "job_type": E.JobType,
        "job_status": E.JobStatus,
        "period_lock_status": E.PeriodLockStatus,
        "bank_import_job_status": E.BankImportJobStatus,
        "bank_import_line_status": E.BankImportLineStatus,
        "change_request_status": E.ChangeRequestStatus,
        "adjustment_type": E.AdjustmentType,
        "device_type": E.DeviceType,
        "manufacturer": E.Manufacturer,
        "connectivity": E.Connectivity,
    }

    async with engine.connect() as conn:
        # 현재 DB에 존재하는 enum 값 조회
        result = await conn.execute(text(
            "SELECT t.typname, e.enumlabel "
            "FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid "
            "ORDER BY t.typname, e.enumsortorder"
        ))
        db_values: dict[str, set[str]] = {}
        for row in result:
            db_values.setdefault(row[0], set()).add(row[1])

        added = []
        for pg_name, py_enum in enum_map.items():
            existing = db_values.get(pg_name, set())
            if not existing:
                continue  # DB에 enum 타입 자체가 없으면 건너뜀 (create_all에서 생성)
            for member in py_enum:
                # SQLAlchemy는 기본적으로 enum의 .name (대문자)을 DB에 저장
                if member.name not in existing:
                    await conn.execute(text(
                        f"ALTER TYPE {pg_name} ADD VALUE IF NOT EXISTS :val"
                    ), {"val": member.name})
                    added.append(f"{pg_name}.{member.name}")

        await conn.commit()

        if added:
            logger.info(f"[sync_pg_enums] DB enum에 {len(added)}개 값 추가: {', '.join(added)}")
        else:
            logger.debug("[sync_pg_enums] 모든 enum 동기화 완료 — 추가 없음")


async def create_initial_admin():
    """초기 관리자 계정 생성"""
    from sqlalchemy import select
    from app.models.user import User
    from app.models.enums import UserRole
    from app.core.security import get_password_hash
    
    async with AsyncSessionLocal() as session:
        # 이미 관리자가 있는지 확인
        result = await session.execute(
            select(User).where(User.role == UserRole.ADMIN).limit(1)
        )
        if result.scalar_one_or_none():
            return
        
        # 초기 관리자 생성
        admin_user = User(
            email=settings.ADMIN_EMAIL,
            password_hash=get_password_hash(settings.ADMIN_PASSWORD),
            name="관리자",
            role=UserRole.ADMIN,
        )
        session.add(admin_user)
        await session.commit()
        print(f"초기 관리자 계정 생성: {settings.ADMIN_EMAIL}")


async def create_default_grades():
    """기본 등급 생성"""
    from sqlalchemy import select
    from app.models.grade import Grade
    
    default_grades = [
        {"name": "A+", "sort_order": 1, "is_default": True},
        {"name": "A", "sort_order": 2, "is_default": False},
        {"name": "A-", "sort_order": 3, "is_default": False},
        {"name": "B+", "sort_order": 4, "is_default": False},
        {"name": "B", "sort_order": 5, "is_default": False},
        {"name": "B-", "sort_order": 6, "is_default": False},
        {"name": "C", "sort_order": 7, "is_default": False},
        {"name": "수출", "sort_order": 8, "is_default": False},
        {"name": "기타", "sort_order": 9, "is_default": False},
    ]
    
    async with AsyncSessionLocal() as session:
        # 이미 등급이 있는지 확인
        result = await session.execute(select(Grade).limit(1))
        if result.scalar_one_or_none():
            return
        
        # 기본 등급 생성
        for grade_data in default_grades:
            grade = Grade(**grade_data)
            session.add(grade)
        
        await session.commit()
        print(f"기본 등급 {len(default_grades)}개 생성")
