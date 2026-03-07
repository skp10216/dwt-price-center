"""반품 내역(return_items) 테이블 추가 + JobType에 voucher_return_excel 추가

Revision ID: 018
Revises: 017
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # JobType enum에 voucher_return_excel 값 추가
    op.execute("ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'voucher_return_excel'")

    # AuditAction enum에 반품 관련 값 추가
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'return_item_create'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'return_item_update'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'return_item_delete'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'return_item_upsert'")

    # return_items 테이블 생성
    op.create_table(
        "return_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                   server_default=sa.text("gen_random_uuid()")),
        # 반품 기본 정보
        sa.Column("return_date", sa.Date, nullable=False, comment="반품일"),
        sa.Column("slip_number", sa.String(50), nullable=False, comment="전표번호"),
        sa.Column("counterparty_id", UUID(as_uuid=True),
                   sa.ForeignKey("counterparties.id", ondelete="RESTRICT"),
                   nullable=False, comment="반품처"),
        # 기기 정보
        sa.Column("pg_no", sa.String(50), nullable=True, comment="P/G No"),
        sa.Column("model_name", sa.String(200), nullable=True, comment="모델명"),
        sa.Column("serial_number", sa.String(100), nullable=True, comment="일련번호"),
        sa.Column("imei", sa.String(50), nullable=True, comment="IMEI"),
        sa.Column("color", sa.String(50), nullable=True, comment="색상"),
        # 금액 정보
        sa.Column("purchase_cost", sa.Numeric(18, 2), nullable=False,
                   server_default="0", comment="매입원가"),
        sa.Column("purchase_deduction", sa.Numeric(18, 2), nullable=False,
                   server_default="0", comment="매입차감"),
        sa.Column("return_amount", sa.Numeric(18, 2), nullable=False,
                   server_default="0", comment="반품금액"),
        sa.Column("as_cost", sa.Numeric(18, 2), nullable=False,
                   server_default="0", comment="A/S금액"),
        # 상태/비고
        sa.Column("remarks", sa.Text, nullable=True, comment="특이사항"),
        sa.Column("memo", sa.Text, nullable=True, comment="비고"),
        # 중복 감지 / 잠금 / 원전표
        sa.Column("dedupe_key", sa.String(500), nullable=False,
                   comment="중복 감지 키"),
        sa.Column("is_locked", sa.Boolean, nullable=False,
                   server_default="false", comment="기간 마감 잠금"),
        sa.Column("source_voucher_id", UUID(as_uuid=True),
                   sa.ForeignKey("vouchers.id", ondelete="SET NULL"),
                   nullable=True, comment="원매입전표"),
        # 시스템 관리
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

    # 인덱스 & 유니크
    op.create_unique_constraint(
        "uq_return_item_dedupe_key", "return_items", ["dedupe_key"]
    )
    op.create_index("ix_return_items_date", "return_items", ["return_date"])
    op.create_index("ix_return_items_counterparty", "return_items", ["counterparty_id"])
    op.create_index("ix_return_items_imei", "return_items", ["imei"])
    op.create_index("ix_return_items_slip_number", "return_items", ["slip_number"])
    op.create_index("ix_return_items_locked", "return_items", ["is_locked"])


def downgrade() -> None:
    op.drop_table("return_items")
