"""seed period_locks from existing voucher lock states

Revision ID: 013_seed_period_locks
Revises: 012_migrate_receipts_payments_to_transactions
Create Date: 2026-02-24

기존 전표의 settlement_status=LOCKED 상태를 기반으로 PeriodLock 레코드 시딩:
- 전표를 year_month 그룹으로 묶어 해당 월의 모든 전표가 LOCKED이면 PeriodLock(LOCKED) 생성
- 전표가 존재하지만 일부만 LOCKED이면 PeriodLock(OPEN) 생성
- 감사 로그에서 마감자/마감일 정보 추출
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "013_seed_period_locks"
down_revision: Union[str, None] = "012_migrate_receipts_payments_to_transactions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 전표를 year_month 그룹으로 묶어 total/locked 집계
    monthly_stats = conn.execute(sa.text("""
        SELECT
            TO_CHAR(trade_date, 'YYYY-MM') AS year_month,
            COUNT(*) AS total_vouchers,
            COUNT(*) FILTER (WHERE settlement_status = 'LOCKED') AS locked_vouchers
        FROM vouchers
        GROUP BY TO_CHAR(trade_date, 'YYYY-MM')
        ORDER BY year_month
    """)).fetchall()

    for stat in monthly_stats:
        year_month = stat.year_month
        total = stat.total_vouchers
        locked = stat.locked_vouchers

        # 이미 period_locks에 있으면 건너뛰기
        exists = conn.execute(sa.text(
            "SELECT 1 FROM period_locks WHERE year_month = :ym"
        ), {"ym": year_month}).fetchone()
        if exists:
            continue

        if total > 0 and locked == total:
            # 모두 마감됨 → LOCKED
            # 감사 로그에서 가장 최근 마감 정보 추출 시도
            lock_info = conn.execute(sa.text("""
                SELECT user_id, created_at
                FROM audit_logs
                WHERE action IN ('VOUCHER_BATCH_LOCK', 'VOUCHER_LOCK')
                  AND (description ILIKE :pattern OR
                       (after_data->>'year_month') = :ym)
                ORDER BY created_at DESC
                LIMIT 1
            """), {"pattern": f"%{year_month}%", "ym": year_month}).fetchone()

            locked_by = lock_info.user_id if lock_info else None
            locked_at = lock_info.created_at if lock_info else None

            conn.execute(sa.text("""
                INSERT INTO period_locks
                    (id, year_month, status, locked_voucher_count,
                     locked_at, locked_by, memo, created_at, updated_at)
                VALUES
                    (gen_random_uuid(), :year_month, 'LOCKED', :locked_count,
                     :locked_at, :locked_by, :memo, now(), now())
            """), {
                "year_month": year_month,
                "locked_count": locked,
                "locked_at": locked_at,
                "locked_by": locked_by,
                "memo": "[마이그레이션] 기존 전표 마감 상태에서 시딩",
            })
        else:
            # 일부만 마감 또는 전부 미마감 → OPEN
            conn.execute(sa.text("""
                INSERT INTO period_locks
                    (id, year_month, status, locked_voucher_count,
                     memo, created_at, updated_at)
                VALUES
                    (gen_random_uuid(), :year_month, 'OPEN', :locked_count,
                     :memo, now(), now())
            """), {
                "year_month": year_month,
                "locked_count": locked,
                "memo": "[마이그레이션] 기존 전표 상태에서 시딩",
            })


def downgrade() -> None:
    conn = op.get_bind()
    # 마이그레이션으로 생성된 PeriodLock만 삭제
    conn.execute(sa.text("""
        DELETE FROM period_locks
        WHERE memo LIKE '[마이그레이션]%'
    """))
