"""add counterparty audit actions to audit_action enum

Revision ID: 006_add_counterparty_audit_actions
Revises: 005_add_upload_delete
Create Date: 2026-02-20

거래처 삭제/일괄삭제/일괄등록 감사 로그를 위해
audit_action enum에 COUNTERPARTY_DELETE, COUNTERPARTY_BATCH_DELETE, COUNTERPARTY_BATCH_CREATE 추가
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '006_add_counterparty_audit_actions'
down_revision: Union[str, None] = '005_add_upload_delete'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """audit_action enum에 거래처 관련 값 추가"""
    conn = op.get_bind()
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'COUNTERPARTY_DELETE'"))
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'COUNTERPARTY_BATCH_DELETE'"))
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'COUNTERPARTY_BATCH_CREATE'"))


def downgrade() -> None:
    # PostgreSQL enum 값 제거는 복잡하므로 생략
    pass
