"""시나리오 테스트 데이터 레지스트리 테이블 추가

테스트에서 생성한 루트 엔티티 ID를 추적하여
초기화 시 테스트 데이터만 선별 삭제

Revision ID: 017_add_scenario_test_registry
Revises: 016_add_corporate_entity_and_bank_import_columns
Create Date: 2026-03-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision = "017_add_scenario_test_registry"
down_revision = "016_add_corporate_entity_and_bank_import_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scenario_test_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("table_name", sa.String(100), nullable=False, comment="테이블명"),
        sa.Column("record_id", UUID(as_uuid=True), nullable=False, comment="레코드 ID"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), comment="등록 시각"),
    )
    op.create_index("ix_scenario_test_records_table_name", "scenario_test_records", ["table_name"])


def downgrade() -> None:
    op.drop_index("ix_scenario_test_records_table_name", table_name="scenario_test_records")
    op.drop_table("scenario_test_records")
