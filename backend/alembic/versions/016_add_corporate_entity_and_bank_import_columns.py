"""법인(CorporateEntity) 테이블 추가 및 은행 임포트 컬럼 확장

- corporate_entities 테이블 생성
- bank_import_jobs에 corporate_entity_id FK 추가
- bank_import_lines에 거래내역조회 양식 추가 컬럼 5개 추가
- counterparty_transactions에 corporate_entity_id FK 추가
- AuditAction enum에 법인 관련 값 추가

Revision ID: 016
Revises: 015
Create Date: 2026-03-04
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "016_add_corporate_entity_and_bank_import_columns"
down_revision = "015_add_missing_voucher_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. corporate_entities 테이블 생성 ──
    op.create_table(
        "corporate_entities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), unique=True, nullable=False, comment="법인명"),
        sa.Column("code", sa.String(50), unique=True, nullable=True, comment="법인 코드"),
        sa.Column("business_number", sa.String(20), nullable=True, comment="사업자등록번호"),
        sa.Column("memo", sa.Text, nullable=True, comment="메모"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true"), comment="활성 상태"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # ── 2. bank_import_jobs에 corporate_entity_id FK 추가 ──
    op.add_column(
        "bank_import_jobs",
        sa.Column("corporate_entity_id", UUID(as_uuid=True), nullable=True, comment="법인 ID"),
    )
    op.create_foreign_key(
        "fk_bij_corporate_entity",
        "bank_import_jobs",
        "corporate_entities",
        ["corporate_entity_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_bij_corporate_entity", "bank_import_jobs", ["corporate_entity_id"])

    # ── 3. bank_import_lines에 거래내역조회 추가 컬럼 ──
    op.add_column(
        "bank_import_lines",
        sa.Column("sender_receiver", sa.String(200), nullable=True, comment="의뢰인/수취인"),
    )
    op.add_column(
        "bank_import_lines",
        sa.Column("additional_memo", sa.String(500), nullable=True, comment="추가메모"),
    )
    op.add_column(
        "bank_import_lines",
        sa.Column("transaction_type_raw", sa.String(100), nullable=True, comment="구분 (타행이체, 당행송금 등)"),
    )
    op.add_column(
        "bank_import_lines",
        sa.Column("bank_branch", sa.String(200), nullable=True, comment="거래점"),
    )
    op.add_column(
        "bank_import_lines",
        sa.Column("special_notes", sa.String(500), nullable=True, comment="거래특이사항"),
    )

    # ── 4. counterparty_transactions에 corporate_entity_id FK 추가 ──
    op.add_column(
        "counterparty_transactions",
        sa.Column("corporate_entity_id", UUID(as_uuid=True), nullable=True, comment="법인 ID"),
    )
    op.create_foreign_key(
        "fk_ct_corporate_entity",
        "counterparty_transactions",
        "corporate_entities",
        ["corporate_entity_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ── 5. AuditAction enum에 법인 관련 값 추가 ──
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'corporate_entity_create'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'corporate_entity_update'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'corporate_entity_delete'")


def downgrade() -> None:
    # counterparty_transactions
    op.drop_constraint("fk_ct_corporate_entity", "counterparty_transactions", type_="foreignkey")
    op.drop_column("counterparty_transactions", "corporate_entity_id")

    # bank_import_lines
    op.drop_column("bank_import_lines", "special_notes")
    op.drop_column("bank_import_lines", "bank_branch")
    op.drop_column("bank_import_lines", "transaction_type_raw")
    op.drop_column("bank_import_lines", "additional_memo")
    op.drop_column("bank_import_lines", "sender_receiver")

    # bank_import_jobs
    op.drop_index("ix_bij_corporate_entity", "bank_import_jobs")
    op.drop_constraint("fk_bij_corporate_entity", "bank_import_jobs", type_="foreignkey")
    op.drop_column("bank_import_jobs", "corporate_entity_id")

    # corporate_entities
    op.drop_table("corporate_entities")
