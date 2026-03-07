"""add system_metrics table for health history

Revision ID: 021
Revises: 020
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_metrics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("checked_at", sa.DateTime, nullable=False, index=True),
        sa.Column("metric_type", sa.String(30), nullable=False, server_default="health_snapshot"),
        sa.Column("data", JSONB, nullable=False),
    )
    # 오래된 메트릭 자동 정리용 인덱스
    op.create_index("ix_system_metrics_checked_at", "system_metrics", ["checked_at"])


def downgrade() -> None:
    op.drop_table("system_metrics")
