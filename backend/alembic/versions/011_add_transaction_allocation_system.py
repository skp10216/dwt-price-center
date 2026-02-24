"""add transaction allocation system

Revision ID: 011_add_transaction_allocation_system
Revises: 010_add_branch_id_to_counterparties
Create Date: 2026-02-24

거래처 입출금 이벤트 + 자동 배분 + 상계 + 은행 임포트 + 기간 마감 시스템:
- 8개 새 enum 타입 생성
- audit_action enum 확장 (~15개 값)
- 9개 새 테이블 생성
- vouchers 테이블에 조정 전표 필드 4개 추가
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "011_add_transaction_allocation_system"
down_revision: Union[str, None] = "010_add_branch_id_to_counterparties"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# =========================================================================
# Enum 객체 (create_type=False — 컬럼 정의 시 재사용)
# =========================================================================
transaction_type_enum = postgresql.ENUM(
    'DEPOSIT', 'WITHDRAWAL',
    name='transaction_type', create_type=False
)
transaction_source_enum = postgresql.ENUM(
    'MANUAL', 'BANK_IMPORT', 'NETTING',
    name='transaction_source', create_type=False
)
transaction_status_enum = postgresql.ENUM(
    'PENDING', 'PARTIAL', 'ALLOCATED', 'CANCELLED',
    name='transaction_status', create_type=False
)
netting_status_enum = postgresql.ENUM(
    'DRAFT', 'CONFIRMED', 'CANCELLED',
    name='netting_status', create_type=False
)
adjustment_type_enum = postgresql.ENUM(
    'CORRECTION', 'RETURN_', 'WRITE_OFF', 'DISCOUNT',
    name='adjustment_type', create_type=False
)
bank_import_line_status_enum = postgresql.ENUM(
    'UNMATCHED', 'MATCHED', 'CONFIRMED', 'DUPLICATE', 'EXCLUDED',
    name='bank_import_line_status', create_type=False
)
bank_import_job_status_enum = postgresql.ENUM(
    'UPLOADED', 'PARSED', 'REVIEWING', 'CONFIRMED', 'FAILED',
    name='bank_import_job_status', create_type=False
)
period_lock_status_enum = postgresql.ENUM(
    'OPEN', 'LOCKED', 'ADJUSTING',
    name='period_lock_status', create_type=False
)


def upgrade() -> None:
    conn = op.get_bind()

    # ── 헬퍼 ───────────────────────────────────────────────────────────
    def table_exists(name: str) -> bool:
        return conn.execute(sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name=:name"
        ), {"name": name}).fetchone() is not None

    def index_exists(name: str) -> bool:
        return conn.execute(sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname=:name"
        ), {"name": name}).fetchone() is not None

    def fk_exists(name: str) -> bool:
        return conn.execute(sa.text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE constraint_name=:name AND constraint_type='FOREIGN KEY'"
        ), {"name": name}).fetchone() is not None

    # =========================================================================
    # 1. 새 Enum 타입 생성
    # =========================================================================
    for name, values in [
        ('transaction_type', ['DEPOSIT', 'WITHDRAWAL']),
        ('transaction_source', ['MANUAL', 'BANK_IMPORT', 'NETTING']),
        ('transaction_status', ['PENDING', 'PARTIAL', 'ALLOCATED', 'CANCELLED']),
        ('netting_status', ['DRAFT', 'CONFIRMED', 'CANCELLED']),
        ('adjustment_type', ['CORRECTION', 'RETURN_', 'WRITE_OFF', 'DISCOUNT']),
        ('bank_import_line_status', ['UNMATCHED', 'MATCHED', 'CONFIRMED', 'DUPLICATE', 'EXCLUDED']),
        ('bank_import_job_status', ['UPLOADED', 'PARSED', 'REVIEWING', 'CONFIRMED', 'FAILED']),
        ('period_lock_status', ['OPEN', 'LOCKED', 'ADJUSTING']),
    ]:
        exists = conn.execute(sa.text(
            "SELECT 1 FROM pg_type WHERE typname = :name"
        ), {"name": name}).fetchone()
        if not exists:
            vals = ", ".join(f"'{v}'" for v in values)
            conn.execute(sa.text(f"CREATE TYPE {name} AS ENUM ({vals})"))

    # =========================================================================
    # 2. audit_action enum 확장
    # =========================================================================
    new_audit_actions = [
        'TRANSACTION_CREATE', 'TRANSACTION_UPDATE', 'TRANSACTION_CANCEL',
        'ALLOCATION_CREATE', 'ALLOCATION_DELETE', 'ALLOCATION_AUTO',
        'NETTING_CREATE', 'NETTING_CONFIRM', 'NETTING_CANCEL',
        'ADJUSTMENT_VOUCHER_CREATE',
        'BANK_IMPORT_UPLOAD', 'BANK_IMPORT_CONFIRM',
        'PERIOD_LOCK', 'PERIOD_UNLOCK', 'PERIOD_ADJUST',
    ]
    for action in new_audit_actions:
        conn.execute(sa.text(
            f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'"
        ))

    # =========================================================================
    # 3. period_locks 테이블
    # =========================================================================
    if not table_exists("period_locks"):
        op.create_table(
            "period_locks",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("year_month", sa.String(7), nullable=False, comment="마감 기간 (YYYY-MM)"),
            sa.Column("status", period_lock_status_enum, nullable=False, server_default="OPEN", comment="OPEN/LOCKED/ADJUSTING"),
            sa.Column("locked_voucher_count", sa.Integer, nullable=False, server_default="0"),
            sa.Column("locked_at", sa.DateTime, nullable=True),
            sa.Column("locked_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("unlocked_at", sa.DateTime, nullable=True),
            sa.Column("unlocked_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("memo", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
            sa.UniqueConstraint("year_month", name="uq_period_lock_year_month"),
        )

    # =========================================================================
    # 4. netting_records 테이블
    # =========================================================================
    if not table_exists("netting_records"):
        op.create_table(
            "netting_records",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("counterparty_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("counterparties.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("netting_date", sa.Date, nullable=False),
            sa.Column("netting_amount", sa.Numeric(18, 2), nullable=False),
            sa.Column("status", netting_status_enum, nullable=False, server_default="DRAFT"),
            sa.Column("memo", sa.Text, nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=False),
            sa.Column("confirmed_by", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("confirmed_at", sa.DateTime, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
            sa.CheckConstraint("netting_amount > 0", name="ck_nr_amount_positive"),
        )
    if not index_exists("ix_nr_counterparty"):
        op.create_index("ix_nr_counterparty", "netting_records", ["counterparty_id"])
    if not index_exists("ix_nr_status"):
        op.create_index("ix_nr_status", "netting_records", ["status"])
    if not index_exists("ix_nr_date"):
        op.create_index("ix_nr_date", "netting_records", ["netting_date"])

    # =========================================================================
    # 5. bank_import_jobs 테이블
    # =========================================================================
    if not table_exists("bank_import_jobs"):
        op.create_table(
            "bank_import_jobs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("file_path", sa.String(500), nullable=False),
            sa.Column("original_filename", sa.String(255), nullable=False),
            sa.Column("file_hash", sa.String(64), nullable=True),
            sa.Column("bank_name", sa.String(100), nullable=True),
            sa.Column("account_number", sa.String(50), nullable=True),
            sa.Column("import_date_from", sa.Date, nullable=True),
            sa.Column("import_date_to", sa.Date, nullable=True),
            sa.Column("status", bank_import_job_status_enum, nullable=False, server_default="UPLOADED"),
            sa.Column("total_lines", sa.Integer, nullable=False, server_default="0"),
            sa.Column("matched_lines", sa.Integer, nullable=False, server_default="0"),
            sa.Column("confirmed_lines", sa.Integer, nullable=False, server_default="0"),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=False),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
            sa.Column("completed_at", sa.DateTime, nullable=True),
            sa.Column("confirmed_at", sa.DateTime, nullable=True),
        )
    if not index_exists("ix_bij_status"):
        op.create_index("ix_bij_status", "bank_import_jobs", ["status"])
    if not index_exists("ix_bij_created_at"):
        op.create_index("ix_bij_created_at", "bank_import_jobs", ["created_at"])

    # =========================================================================
    # 6. bank_import_lines 테이블
    # =========================================================================
    if not table_exists("bank_import_lines"):
        op.create_table(
            "bank_import_lines",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("import_job_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("bank_import_jobs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("line_number", sa.Integer, nullable=False),
            sa.Column("transaction_date", sa.Date, nullable=False),
            sa.Column("description", sa.String(500), nullable=False),
            sa.Column("amount", sa.Numeric(18, 2), nullable=False),
            sa.Column("balance_after", sa.Numeric(18, 2), nullable=True),
            sa.Column("counterparty_name_raw", sa.String(200), nullable=True),
            sa.Column("counterparty_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("counterparties.id", ondelete="SET NULL"), nullable=True),
            sa.Column("status", bank_import_line_status_enum, nullable=False, server_default="UNMATCHED"),
            sa.Column("match_confidence", sa.Numeric(5, 2), nullable=True),
            sa.Column("duplicate_key", sa.String(128), nullable=True),
            sa.Column("bank_reference", sa.String(100), nullable=True),
            sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("raw_data", postgresql.JSONB, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
        )
    if not index_exists("ix_bil_import_job"):
        op.create_index("ix_bil_import_job", "bank_import_lines", ["import_job_id"])
    if not index_exists("ix_bil_status"):
        op.create_index("ix_bil_status", "bank_import_lines", ["status"])
    if not index_exists("ix_bil_duplicate_key"):
        op.create_index("ix_bil_duplicate_key", "bank_import_lines", ["duplicate_key"])
    if not index_exists("ix_bil_counterparty"):
        op.create_index("ix_bil_counterparty", "bank_import_lines", ["counterparty_id"])

    # =========================================================================
    # 7. counterparty_transactions 테이블
    # =========================================================================
    if not table_exists("counterparty_transactions"):
        op.create_table(
            "counterparty_transactions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("counterparty_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("counterparties.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("transaction_type", transaction_type_enum, nullable=False),
            sa.Column("transaction_date", sa.Date, nullable=False),
            sa.Column("amount", sa.Numeric(18, 2), nullable=False),
            sa.Column("allocated_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
            sa.Column("memo", sa.Text, nullable=True),
            sa.Column("source", transaction_source_enum, nullable=False, server_default="MANUAL"),
            sa.Column("bank_reference", sa.String(100), nullable=True, unique=True),
            sa.Column("bank_import_line_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("bank_import_lines.id", ondelete="SET NULL"), nullable=True),
            sa.Column("netting_record_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("netting_records.id", ondelete="SET NULL"), nullable=True),
            sa.Column("status", transaction_status_enum, nullable=False, server_default="PENDING"),
            sa.Column("created_by", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=False),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
            sa.CheckConstraint("amount > 0", name="ck_ct_amount_positive"),
            sa.CheckConstraint("allocated_amount >= 0", name="ck_ct_allocated_nonneg"),
            sa.CheckConstraint("allocated_amount <= amount", name="ck_ct_allocated_lte_amount"),
        )
    if not index_exists("ix_ct_counterparty_date"):
        op.create_index("ix_ct_counterparty_date", "counterparty_transactions", ["counterparty_id", "transaction_date"])
    if not index_exists("ix_ct_status"):
        op.create_index("ix_ct_status", "counterparty_transactions", ["status"])
    if not index_exists("ix_ct_source"):
        op.create_index("ix_ct_source", "counterparty_transactions", ["source"])

    # bank_import_lines.transaction_id FK 추가
    if not fk_exists("fk_bil_transaction_id"):
        op.create_foreign_key(
            "fk_bil_transaction_id",
            "bank_import_lines", "counterparty_transactions",
            ["transaction_id"], ["id"],
            ondelete="SET NULL",
        )

    # =========================================================================
    # 8. transaction_allocations 테이블
    # =========================================================================
    if not table_exists("transaction_allocations"):
        op.create_table(
            "transaction_allocations",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("transaction_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("counterparty_transactions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("voucher_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("vouchers.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("allocated_amount", sa.Numeric(18, 2), nullable=False),
            sa.Column("allocation_order", sa.Integer, nullable=False, server_default="1"),
            sa.Column("memo", sa.Text, nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=False),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
            sa.CheckConstraint("allocated_amount > 0", name="ck_ta_amount_positive"),
            sa.UniqueConstraint("transaction_id", "voucher_id", name="uq_ta_transaction_voucher"),
        )
    if not index_exists("ix_ta_transaction"):
        op.create_index("ix_ta_transaction", "transaction_allocations", ["transaction_id"])
    if not index_exists("ix_ta_voucher"):
        op.create_index("ix_ta_voucher", "transaction_allocations", ["voucher_id"])

    # =========================================================================
    # 9. netting_voucher_links 테이블
    # =========================================================================
    if not table_exists("netting_voucher_links"):
        op.create_table(
            "netting_voucher_links",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("netting_record_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("netting_records.id", ondelete="CASCADE"), nullable=False),
            sa.Column("voucher_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("vouchers.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("netted_amount", sa.Numeric(18, 2), nullable=False),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
            sa.CheckConstraint("netted_amount > 0", name="ck_nvl_amount_positive"),
            sa.UniqueConstraint("netting_record_id", "voucher_id", name="uq_nvl_netting_voucher"),
        )

    # =========================================================================
    # 10. vouchers 테이블에 조정 전표 컬럼 추가
    # =========================================================================
    for col_name, col_def in [
        ("is_adjustment", sa.Column("is_adjustment", sa.Boolean, nullable=False, server_default="false", comment="조정 전표 여부")),
        ("adjustment_type", sa.Column("adjustment_type", adjustment_type_enum, nullable=True, comment="조정 유형")),
        ("original_voucher_id", sa.Column("original_voucher_id", postgresql.UUID(as_uuid=True), nullable=True, comment="원본 전표 ID")),
        ("adjustment_reason", sa.Column("adjustment_reason", sa.Text, nullable=True, comment="조정 사유")),
    ]:
        exists = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns WHERE table_name='vouchers' AND column_name=:col"
        ), {"col": col_name}).fetchone()
        if not exists:
            op.add_column("vouchers", col_def)

    # original_voucher_id FK
    if not fk_exists("fk_voucher_original_voucher"):
        op.create_foreign_key(
            "fk_voucher_original_voucher",
            "vouchers", "vouchers",
            ["original_voucher_id"], ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    # 조정 전표 필드 제거
    op.drop_constraint("fk_voucher_original_voucher", "vouchers", type_="foreignkey")
    op.drop_column("vouchers", "adjustment_reason")
    op.drop_column("vouchers", "original_voucher_id")
    op.drop_column("vouchers", "adjustment_type")
    op.drop_column("vouchers", "is_adjustment")

    # 테이블 삭제 (역순)
    op.drop_table("netting_voucher_links")
    op.drop_table("transaction_allocations")

    op.drop_constraint("fk_bil_transaction_id", "bank_import_lines", type_="foreignkey")
    op.drop_table("counterparty_transactions")
    op.drop_table("bank_import_lines")
    op.drop_table("bank_import_jobs")
    op.drop_table("netting_records")
    op.drop_table("period_locks")

    # Enum 타입 삭제
    for name in [
        'period_lock_status', 'bank_import_job_status', 'bank_import_line_status',
        'adjustment_type', 'netting_status', 'transaction_status',
        'transaction_source', 'transaction_type',
    ]:
        op.execute(sa.text(f"DROP TYPE IF EXISTS {name}"))
