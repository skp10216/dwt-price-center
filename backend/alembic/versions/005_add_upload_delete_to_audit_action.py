"""add UPLOAD_DELETE to audit_action enum

Revision ID: 005_add_upload_delete
Revises: 004_add_settlement_domain
Create Date: 2026-02-19

업로드 작업 삭제 시 감사 로그 기록을 위해
audit_action enum에 UPLOAD_DELETE 값 추가
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '005_add_upload_delete'
down_revision: Union[str, None] = '004_add_settlement_domain'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """audit_action enum에 UPLOAD_DELETE 값 추가"""
    conn = op.get_bind()
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'UPLOAD_DELETE'"))


def downgrade() -> None:
    # PostgreSQL enum 값 제거는 복잡하므로 생략
    pass
