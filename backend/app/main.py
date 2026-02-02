"""
단가표 통합 관리 시스템 - FastAPI 메인 애플리케이션
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.core.config import settings
from app.core.database import init_db, AsyncSessionLocal
from app.api.v1.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 시작/종료 이벤트"""
    # 시작 시
    await init_db()
    
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
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 예외 핸들러
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
                "code": "VALIDATION_ERROR",
                "message": "입력값 검증에 실패했습니다",
                "details": {"errors": errors}
            }
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """일반 예외 핸들러"""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "서버 내부 오류가 발생했습니다",
                "details": {"error": str(exc)} if settings.DEBUG else None
            }
        }
    )


# API 라우터 등록
app.include_router(api_router, prefix="/api/v1")


# 헬스 체크
@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {"status": "healthy", "version": settings.APP_VERSION}


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
