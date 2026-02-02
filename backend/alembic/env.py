"""
Alembic 마이그레이션 환경 설정
"""

from logging.config import fileConfig

from sqlalchemy import pool, create_engine
from sqlalchemy.engine import Connection

from alembic import context

# 모델 임포트 (메타데이터 인식용)
from app.core.database import Base
from app.models import *  # noqa
from app.core.config import settings

# Alembic Config 객체
config = context.config

# 로깅 설정
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 메타데이터 설정
target_metadata = Base.metadata

# DATABASE_URL 오버라이드 (동기 드라이버 사용)
# asyncpg -> psycopg2로 변환
sync_database_url = settings.DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")


def run_migrations_offline() -> None:
    """오프라인 모드에서 마이그레이션 실행 (SQL 스크립트 생성)"""
    context.configure(
        url=sync_database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """온라인 모드에서 마이그레이션 실행 (동기 방식)"""
    connectable = create_engine(
        sync_database_url,
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
