"""AuditAction enum 확장 - Phase 3 관리자 조작 액션 추가

Revision ID: 020
Revises: 019
"""
from alembic import op

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None

# PostgreSQL enum에 새 값을 추가하려면 트랜잭션 외부에서 실행해야 함
NEW_VALUES = [
    "job_retry",
    "job_cancel",
    "job_delete",
    "integrity_fix",
    "balance_adjustment",
]


def upgrade() -> None:
    for value in NEW_VALUES:
        op.execute(f"ALTER TYPE auditaction ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    # PostgreSQL enum에서 값을 제거하는 것은 직접적으로 불가능
    # 필요 시 새 enum을 만들고 교체하는 방식으로 처리해야 함
    pass
