"""
audit_action enum에 model_bulk_create 값 추가

Python enum에 MODEL_BULK_CREATE가 정의되어 있지만,
PostgreSQL의 audit_action enum 타입에는 해당 값이 없어서 추가합니다.

Revision ID: 002_add_model_bulk_create
Revises: 001_add_model_key
Create Date: 2026-02-02
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = '002_add_model_bulk_create'
down_revision = '001_add_model_key'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """audit_action enum에 MODEL_BULK_CREATE 값 추가"""
    # PostgreSQL에서 enum에 새 값을 추가하는 방법
    # 주의: 기존 enum 값들이 대문자(NAME)로 저장되어 있으므로 대문자로 추가해야 함
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'MODEL_BULK_CREATE'")


def downgrade() -> None:
    """
    PostgreSQL에서는 enum 값을 직접 삭제할 수 없음.
    필요시 enum 재생성 필요하지만, 일반적으로 enum 값 추가는 롤백하지 않음.
    """
    # enum 값 삭제는 복잡한 작업이므로 pass 처리
    # 필요시 수동으로 enum 타입 재생성 필요
    pass
