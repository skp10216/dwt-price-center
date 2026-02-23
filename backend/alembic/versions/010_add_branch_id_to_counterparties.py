"""add branch_id to counterparties

Revision ID: 010_add_branch_id_to_counterparties
Revises: 009_add_branch_and_partner_soft_delete
Create Date: 2026-02-23

거래처(Counterparty)에 소속 지사(branch_id) FK 추가
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "010_add_branch_id_to_counterparties"
down_revision: Union[str, None] = "009_add_branch_and_partner_soft_delete"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "counterparties",
        sa.Column(
            "branch_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
            comment="소속 지사 ID",
        ),
    )
    op.create_index("ix_counterparties_branch_id", "counterparties", ["branch_id"])


def downgrade() -> None:
    op.drop_index("ix_counterparties_branch_id", table_name="counterparties")
    op.drop_column("counterparties", "branch_id")
