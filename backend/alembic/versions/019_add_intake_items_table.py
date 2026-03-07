"""반입 내역(intake_items) 테이블 + IntakeStatus/IntakeType enum + JobType 확장

Revision ID: 019
Revises: 018
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # enum 타입 생성
    op.execute("CREATE TYPE intake_status AS ENUM ('RECEIVED','IN_STOCK','SOLD','HOLD','EXCLUDED')")
    op.execute("CREATE TYPE intake_type AS ENUM ('NORMAL','RETURN_INTAKE','TRANSFER','OTHER')")

    # JobType/AuditAction enum 확장
    op.execute("ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VOUCHER_INTAKE_EXCEL'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'INTAKE_ITEM_CREATE'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'INTAKE_ITEM_UPDATE'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'INTAKE_ITEM_DELETE'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'INTAKE_ITEM_UPSERT'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'INTAKE_ITEM_STATUS_CHANGE'")

    op.create_table(
        "intake_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                   server_default=sa.text("gen_random_uuid()")),
        sa.Column("intake_date", sa.Date, nullable=False, comment="반입일"),
        sa.Column("slip_number", sa.String(50), nullable=False, comment="전표번호"),
        sa.Column("counterparty_id", UUID(as_uuid=True),
                   sa.ForeignKey("counterparties.id", ondelete="RESTRICT"),
                   nullable=False, comment="반입처"),
        sa.Column("pg_no", sa.String(50), nullable=True, comment="P/G No"),
        sa.Column("model_name", sa.String(200), nullable=True, comment="모델명"),
        sa.Column("serial_number", sa.String(100), nullable=True, comment="일련번호"),
        sa.Column("purchase_date", sa.Date, nullable=True, comment="매입일"),
        sa.Column("purchase_counterparty_id", UUID(as_uuid=True),
                   sa.ForeignKey("counterparties.id", ondelete="SET NULL"),
                   nullable=True, comment="매입처"),
        sa.Column("actual_purchase_price", sa.Numeric(18, 2), nullable=False,
                   server_default="0", comment="실매입가"),
        sa.Column("intake_price", sa.Numeric(18, 2), nullable=False,
                   server_default="0", comment="반입가"),
        sa.Column("intake_type", sa.Enum("NORMAL", "RETURN_INTAKE", "TRANSFER", "OTHER",
                                          name="intake_type", create_type=False),
                   nullable=False, server_default="NORMAL", comment="반입구분"),
        sa.Column("current_status", sa.Enum("RECEIVED", "IN_STOCK", "SOLD", "HOLD", "EXCLUDED",
                                             name="intake_status", create_type=False),
                   nullable=False, server_default="RECEIVED", comment="현상태"),
        sa.Column("remarks", sa.Text, nullable=True, comment="특이사항"),
        sa.Column("memo", sa.Text, nullable=True, comment="비고"),
        sa.Column("dedupe_key", sa.String(500), nullable=False, comment="중복 감지 키"),
        sa.Column("is_locked", sa.Boolean, nullable=False,
                   server_default="false", comment="기간 마감 잠금"),
        sa.Column("source_voucher_id", UUID(as_uuid=True),
                   sa.ForeignKey("vouchers.id", ondelete="SET NULL"),
                   nullable=True, comment="원매입전표"),
        sa.Column("upload_job_id", UUID(as_uuid=True),
                   sa.ForeignKey("upload_jobs.id", ondelete="SET NULL"),
                   nullable=True, comment="업로드 Job ID"),
        sa.Column("created_by", UUID(as_uuid=True),
                   sa.ForeignKey("users.id", ondelete="SET NULL"),
                   nullable=False, comment="생성자"),
        sa.Column("created_at", sa.DateTime, nullable=False,
                   server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime, nullable=False,
                   server_default=sa.text("now()")),
    )

    op.create_unique_constraint("uq_intake_item_dedupe_key", "intake_items", ["dedupe_key"])
    op.create_index("ix_intake_items_date", "intake_items", ["intake_date"])
    op.create_index("ix_intake_items_counterparty", "intake_items", ["counterparty_id"])
    op.create_index("ix_intake_items_serial", "intake_items", ["serial_number"])
    op.create_index("ix_intake_items_status", "intake_items", ["current_status"])
    op.create_index("ix_intake_items_locked", "intake_items", ["is_locked"])


def downgrade() -> None:
    op.drop_table("intake_items")
    op.execute("DROP TYPE IF EXISTS intake_status")
    op.execute("DROP TYPE IF EXISTS intake_type")
