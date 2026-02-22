"""add user_counterparty_favorites table

Revision ID: 008_add_user_counterparty_favorites
Revises: 007_add_user_partner_favorites
Create Date: 2026-02-22
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '008_add_user_counterparty_favorites'
down_revision: Union[str, None] = '007_add_user_partner_favorites'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_counterparty_favorites',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('counterparty_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('counterparties.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime, nullable=False,
                  server_default=sa.text('NOW()')),
        sa.UniqueConstraint('user_id', 'counterparty_id', name='uq_user_counterparty_favorite'),
    )
    op.create_index('ix_user_counterparty_favorites_user_id',
                    'user_counterparty_favorites', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_user_counterparty_favorites_user_id',
                  table_name='user_counterparty_favorites')
    op.drop_table('user_counterparty_favorites')
