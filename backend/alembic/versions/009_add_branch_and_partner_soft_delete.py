"""add branch table and partner soft delete fields

Revision ID: 009_add_branch_and_partner_soft_delete
Revises: 008_add_user_counterparty_favorites
Create Date: 2026-02-23

지사(Branch) 테이블 생성 및 거래처(Partner)에 branch_id FK, 소프트 삭제 필드 추가
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '009_add_branch_and_partner_soft_delete'
down_revision: Union[str, None] = '008_add_user_counterparty_favorites'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. branches 테이블 생성
    op.create_table(
        'branches',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), unique=True, nullable=False, comment='지사명'),
        sa.Column('region', sa.String(100), nullable=True, comment='지역'),
        sa.Column('contact_info', sa.String(200), nullable=True, comment='연락처 정보'),
        sa.Column('memo', sa.Text, nullable=True, comment='운영 메모'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true', comment='활성 상태'),
        sa.Column('deleted_at', sa.DateTime, nullable=True, comment='삭제 일시'),
        sa.Column('deleted_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, comment='삭제한 사용자'),
        sa.Column('delete_reason', sa.String(500), nullable=True, comment='삭제 사유'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()'), comment='생성 일시'),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('now()'), comment='수정 일시'),
    )

    # 2. partners 테이블에 branch_id FK 추가
    op.add_column('partners', sa.Column(
        'branch_id', postgresql.UUID(as_uuid=True),
        sa.ForeignKey('branches.id', ondelete='SET NULL'),
        nullable=True, comment='소속 지사 ID'
    ))

    # 3. partners 테이블에 소프트 삭제 필드 추가
    op.add_column('partners', sa.Column(
        'deleted_at', sa.DateTime, nullable=True, comment='삭제 일시'
    ))
    op.add_column('partners', sa.Column(
        'deleted_by', postgresql.UUID(as_uuid=True),
        sa.ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True, comment='삭제한 사용자'
    ))
    op.add_column('partners', sa.Column(
        'delete_reason', sa.String(500), nullable=True, comment='삭제 사유'
    ))

    # 4. audit_action enum에 새 값 추가
    conn = op.get_bind()
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'partner_delete'"))
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'partner_restore'"))
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'partner_move'"))
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'branch_create'"))
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'branch_update'"))
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'branch_delete'"))
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'branch_restore'"))

    # 5. 인덱스
    op.create_index('ix_partners_branch_id', 'partners', ['branch_id'])


def downgrade() -> None:
    op.drop_index('ix_partners_branch_id', table_name='partners')
    op.drop_column('partners', 'delete_reason')
    op.drop_column('partners', 'deleted_by')
    op.drop_column('partners', 'deleted_at')
    op.drop_column('partners', 'branch_id')
    op.drop_table('branches')
