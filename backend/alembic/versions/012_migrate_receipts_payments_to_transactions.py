"""migrate receipts and payments to counterparty_transactions

Revision ID: 012_migrate_receipts_payments_to_transactions
Revises: 011_add_transaction_allocation_system
Create Date: 2026-02-24

기존 Receipt/Payment 데이터를 CounterpartyTransaction + TransactionAllocation으로 변환:
- Receipt → CounterpartyTransaction(DEPOSIT, MANUAL) + TransactionAllocation
- Payment → CounterpartyTransaction(WITHDRAWAL, MANUAL) + TransactionAllocation
- 기존 테이블은 감사 목적으로 보존
- 배치 처리 (500건씩)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "012_migrate_receipts_payments_to_transactions"
down_revision: Union[str, None] = "011_add_transaction_allocation_system"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BATCH_SIZE = 500


def upgrade() -> None:
    conn = op.get_bind()

    # =========================================================================
    # 1. Receipt → CounterpartyTransaction(DEPOSIT) + TransactionAllocation
    # =========================================================================
    # 전체 Receipt 건수 확인
    receipt_count = conn.execute(sa.text(
        "SELECT COUNT(*) FROM receipts"
    )).scalar() or 0

    if receipt_count > 0:
        offset = 0
        alloc_order = 0
        while offset < receipt_count:
            # Receipt JOIN Voucher 로 counterparty_id 가져오기
            rows = conn.execute(sa.text("""
                SELECT
                    r.id AS receipt_id,
                    r.voucher_id,
                    r.receipt_date,
                    r.amount,
                    r.memo,
                    r.created_by,
                    r.created_at,
                    v.counterparty_id
                FROM receipts r
                JOIN vouchers v ON v.id = r.voucher_id
                ORDER BY r.created_at ASC
                LIMIT :limit OFFSET :offset
            """), {"limit": BATCH_SIZE, "offset": offset}).fetchall()

            if not rows:
                break

            for row in rows:
                alloc_order += 1
                txn_id = conn.execute(sa.text("SELECT gen_random_uuid()")).scalar()

                # CounterpartyTransaction 생성
                conn.execute(sa.text("""
                    INSERT INTO counterparty_transactions
                        (id, counterparty_id, transaction_type, transaction_date,
                         amount, allocated_amount, memo, source, status,
                         created_by, created_at, updated_at)
                    VALUES
                        (:id, :counterparty_id, 'DEPOSIT', :transaction_date,
                         :amount, :amount, :memo, 'MANUAL', 'ALLOCATED',
                         :created_by, :created_at, :created_at)
                """), {
                    "id": txn_id,
                    "counterparty_id": row.counterparty_id,
                    "transaction_date": row.receipt_date,
                    "amount": row.amount,
                    "memo": row.memo,
                    "created_by": row.created_by,
                    "created_at": row.created_at,
                })

                # TransactionAllocation 생성
                conn.execute(sa.text("""
                    INSERT INTO transaction_allocations
                        (id, transaction_id, voucher_id, allocated_amount,
                         allocation_order, memo, created_by, created_at)
                    VALUES
                        (gen_random_uuid(), :transaction_id, :voucher_id, :amount,
                         :allocation_order, :memo, :created_by, :created_at)
                """), {
                    "transaction_id": txn_id,
                    "voucher_id": row.voucher_id,
                    "amount": row.amount,
                    "allocation_order": alloc_order,
                    "memo": f"[마이그레이션] Receipt {row.receipt_id} 변환",
                    "created_by": row.created_by,
                    "created_at": row.created_at,
                })

            offset += BATCH_SIZE

    # =========================================================================
    # 2. Payment → CounterpartyTransaction(WITHDRAWAL) + TransactionAllocation
    # =========================================================================
    payment_count = conn.execute(sa.text(
        "SELECT COUNT(*) FROM payments"
    )).scalar() or 0

    if payment_count > 0:
        offset = 0
        alloc_order = 0
        while offset < payment_count:
            rows = conn.execute(sa.text("""
                SELECT
                    p.id AS payment_id,
                    p.voucher_id,
                    p.payment_date,
                    p.amount,
                    p.memo,
                    p.created_by,
                    p.created_at,
                    v.counterparty_id
                FROM payments p
                JOIN vouchers v ON v.id = p.voucher_id
                ORDER BY p.created_at ASC
                LIMIT :limit OFFSET :offset
            """), {"limit": BATCH_SIZE, "offset": offset}).fetchall()

            if not rows:
                break

            for row in rows:
                alloc_order += 1
                txn_id = conn.execute(sa.text("SELECT gen_random_uuid()")).scalar()

                # CounterpartyTransaction 생성
                conn.execute(sa.text("""
                    INSERT INTO counterparty_transactions
                        (id, counterparty_id, transaction_type, transaction_date,
                         amount, allocated_amount, memo, source, status,
                         created_by, created_at, updated_at)
                    VALUES
                        (:id, :counterparty_id, 'WITHDRAWAL', :transaction_date,
                         :amount, :amount, :memo, 'MANUAL', 'ALLOCATED',
                         :created_by, :created_at, :created_at)
                """), {
                    "id": txn_id,
                    "counterparty_id": row.counterparty_id,
                    "transaction_date": row.payment_date,
                    "amount": row.amount,
                    "memo": row.memo,
                    "created_by": row.created_by,
                    "created_at": row.created_at,
                })

                # TransactionAllocation 생성
                conn.execute(sa.text("""
                    INSERT INTO transaction_allocations
                        (id, transaction_id, voucher_id, allocated_amount,
                         allocation_order, memo, created_by, created_at)
                    VALUES
                        (gen_random_uuid(), :transaction_id, :voucher_id, :amount,
                         :allocation_order, :memo, :created_by, :created_at)
                """), {
                    "transaction_id": txn_id,
                    "voucher_id": row.voucher_id,
                    "amount": row.amount,
                    "allocation_order": alloc_order,
                    "memo": f"[마이그레이션] Payment {row.payment_id} 변환",
                    "created_by": row.created_by,
                    "created_at": row.created_at,
                })

            offset += BATCH_SIZE

    # =========================================================================
    # 3. 검증: 전표별 합산 일치 확인
    # =========================================================================
    # Receipt 합산 vs TransactionAllocation(DEPOSIT) 합산 비교
    mismatch = conn.execute(sa.text("""
        WITH old_receipts AS (
            SELECT voucher_id, COALESCE(SUM(amount), 0) AS total
            FROM receipts
            GROUP BY voucher_id
        ),
        new_allocations AS (
            SELECT ta.voucher_id, COALESCE(SUM(ta.allocated_amount), 0) AS total
            FROM transaction_allocations ta
            JOIN counterparty_transactions ct ON ct.id = ta.transaction_id
            WHERE ct.transaction_type = 'DEPOSIT'
              AND ct.source = 'MANUAL'
              AND ta.memo LIKE '[마이그레이션] Receipt%'
            GROUP BY ta.voucher_id
        )
        SELECT o.voucher_id, o.total AS old_total, COALESCE(n.total, 0) AS new_total
        FROM old_receipts o
        LEFT JOIN new_allocations n ON n.voucher_id = o.voucher_id
        WHERE o.total != COALESCE(n.total, 0)
    """)).fetchall()

    if mismatch:
        raise RuntimeError(
            f"Receipt 마이그레이션 검증 실패: {len(mismatch)}건 불일치. "
            f"첫 번째: voucher_id={mismatch[0].voucher_id}, "
            f"old={mismatch[0].old_total}, new={mismatch[0].new_total}"
        )

    # Payment 합산 vs TransactionAllocation(WITHDRAWAL) 합산 비교
    mismatch = conn.execute(sa.text("""
        WITH old_payments AS (
            SELECT voucher_id, COALESCE(SUM(amount), 0) AS total
            FROM payments
            GROUP BY voucher_id
        ),
        new_allocations AS (
            SELECT ta.voucher_id, COALESCE(SUM(ta.allocated_amount), 0) AS total
            FROM transaction_allocations ta
            JOIN counterparty_transactions ct ON ct.id = ta.transaction_id
            WHERE ct.transaction_type = 'WITHDRAWAL'
              AND ct.source = 'MANUAL'
              AND ta.memo LIKE '[마이그레이션] Payment%'
            GROUP BY ta.voucher_id
        )
        SELECT o.voucher_id, o.total AS old_total, COALESCE(n.total, 0) AS new_total
        FROM old_payments o
        LEFT JOIN new_allocations n ON n.voucher_id = o.voucher_id
        WHERE o.total != COALESCE(n.total, 0)
    """)).fetchall()

    if mismatch:
        raise RuntimeError(
            f"Payment 마이그레이션 검증 실패: {len(mismatch)}건 불일치. "
            f"첫 번째: voucher_id={mismatch[0].voucher_id}, "
            f"old={mismatch[0].old_total}, new={mismatch[0].new_total}"
        )


def downgrade() -> None:
    conn = op.get_bind()

    # 마이그레이션으로 생성된 데이터만 삭제 (memo에 '[마이그레이션]' 태그로 식별)
    # TransactionAllocation 먼저 삭제 (FK 의존)
    conn.execute(sa.text("""
        DELETE FROM transaction_allocations
        WHERE memo LIKE '[마이그레이션]%'
    """))

    # CounterpartyTransaction 삭제 (source=MANUAL이고 마이그레이션 시점에 생성된 것)
    # memo로 정확히 식별하기 어려우므로, allocation이 모두 삭제된 후
    # allocated_amount와 연결된 allocation이 없는 MANUAL 트랜잭션 정리
    conn.execute(sa.text("""
        DELETE FROM counterparty_transactions ct
        WHERE ct.source = 'MANUAL'
          AND ct.id NOT IN (
              SELECT DISTINCT transaction_id FROM transaction_allocations
          )
          AND NOT EXISTS (
              SELECT 1 FROM transaction_allocations ta WHERE ta.transaction_id = ct.id
          )
    """))
