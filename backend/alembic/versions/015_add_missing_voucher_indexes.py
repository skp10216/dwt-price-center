"""add missing voucher indexes for upload_job_id and original_voucher_id

Revision ID: 015
Revises: 014
Create Date: 2026-03-02
"""
from alembic import op

revision = "015_add_missing_voucher_indexes"
down_revision = "014_add_transaction_status_enum_values"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_vouchers_upload_job_id", "vouchers", ["upload_job_id"])
    op.create_index("ix_vouchers_original_voucher_id", "vouchers", ["original_voucher_id"])


def downgrade() -> None:
    op.drop_index("ix_vouchers_original_voucher_id", table_name="vouchers")
    op.drop_index("ix_vouchers_upload_job_id", table_name="vouchers")
