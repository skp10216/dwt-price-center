"""Add ON_HOLD and HIDDEN to transaction_status enum

Revision ID: 014_add_transaction_status_enum_values
Revises: 013_seed_period_locks
Create Date: 2026-02-28
"""
from alembic import op

revision = "014_add_transaction_status_enum_values"
down_revision = "013_seed_period_locks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'ON_HOLD'")
    op.execute("ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'HIDDEN'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values; no-op
    pass
