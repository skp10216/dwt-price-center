"""
단가표 통합 관리 시스템 - 데이터베이스 연결 설정
SQLAlchemy 비동기 세션, Redis 캐시 및 Base 모델 정의
"""

from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import redis.asyncio as redis

from app.core.config import settings


# 비동기 엔진 생성
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # DEBUG 모드에서만 SQL 로깅
    pool_pre_ping=True,   # 연결 상태 확인
    pool_size=10,         # 커넥션 풀 크기
    max_overflow=20,      # 추가 연결 허용 수
)

# Redis 연결 풀 (싱글톤)
_redis_pool: Optional[redis.ConnectionPool] = None

# 비동기 세션 팩토리
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """SQLAlchemy Base 모델 클래스"""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    데이터베이스 세션 의존성 주입
    FastAPI의 Depends()에서 사용
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """데이터베이스 테이블 초기화 (개발용)"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ============================================================================
# Redis 연결 관리
# ============================================================================

async def get_redis_pool() -> redis.ConnectionPool:
    """Redis 연결 풀 반환 (싱글톤)"""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.ConnectionPool.from_url(settings.REDIS_URL)
    return _redis_pool


async def get_redis() -> AsyncGenerator[redis.Redis, None]:
    """
    Redis 연결 의존성 주입
    FastAPI의 Depends()에서 사용
    """
    pool = await get_redis_pool()
    client = redis.Redis(connection_pool=pool)
    try:
        yield client
    finally:
        await client.aclose()


async def close_redis_pool() -> None:
    """Redis 연결 풀 종료 (앱 종료 시)"""
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.disconnect()
        _redis_pool = None
