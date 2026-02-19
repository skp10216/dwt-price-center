"""add settlement domain tables and enums

Revision ID: 004_add_settlement_domain
Revises: 003_add_model_delete
Create Date: 2026-02-19

정산 도메인 테이블 7개 + enum 타입 추가:
- counterparties (거래처 SSOT)
- counterparty_aliases (거래처 별칭)
- vouchers (전표 SSOT)
- receipts (입금 이력)
- payments (송금 이력)
- voucher_change_requests (변경 요청)
- upload_templates (업로드 템플릿)
+ user_role, counterparty_type, voucher_type, settlement_status,
  payment_status, change_request_status enum 신규/확장
+ job_type enum에 VOUCHER_SALES_EXCEL, VOUCHER_PURCHASE_EXCEL 추가
+ audit_action enum에 정산 관련 액션 추가
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '004_add_settlement_domain'
down_revision: Union[str, None] = '003_add_model_delete'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# =========================================================================
# 재사용 가능한 postgresql.ENUM 객체 (create_type=False)
# create_table 내 컬럼에서 사용하되, 직접 CREATE TYPE 하지 않음
# =========================================================================
counterparty_type_enum = postgresql.ENUM(
    'SELLER', 'BUYER', 'BOTH',
    name='counterparty_type', create_type=False
)
voucher_type_enum = postgresql.ENUM(
    'SALES', 'PURCHASE',
    name='voucher_type', create_type=False
)
settlement_status_enum = postgresql.ENUM(
    'OPEN', 'SETTLING', 'SETTLED', 'LOCKED',
    name='settlement_status', create_type=False
)
payment_status_enum = postgresql.ENUM(
    'UNPAID', 'PARTIAL', 'PAID', 'LOCKED',
    name='payment_status', create_type=False
)
change_request_status_enum = postgresql.ENUM(
    'PENDING', 'APPROVED', 'REJECTED',
    name='change_request_status', create_type=False
)


def upgrade() -> None:
    conn = op.get_bind()

    # =========================================================================
    # 1. 기존 Enum 타입 확장 (ALTER TYPE ADD VALUE는 트랜잭션 밖에서 실행됨)
    #    DB는 Python Enum의 NAME(대문자)을 저장함
    # =========================================================================

    # user_role에 settlement 추가
    conn.execute(sa.text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SETTLEMENT'"))

    # job_type에 정산 업로드 타입 추가
    conn.execute(sa.text("ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VOUCHER_SALES_EXCEL'"))
    conn.execute(sa.text("ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'VOUCHER_PURCHASE_EXCEL'"))

    # audit_action에 정산 관련 액션 추가
    settlement_audit_actions = [
        'VOUCHER_CREATE', 'VOUCHER_UPDATE', 'VOUCHER_UPSERT',
        'VOUCHER_LOCK', 'VOUCHER_UNLOCK',
        'VOUCHER_BATCH_LOCK', 'VOUCHER_BATCH_UNLOCK',
        'RECEIPT_CREATE', 'RECEIPT_DELETE',
        'PAYMENT_CREATE', 'PAYMENT_DELETE',
        'COUNTERPARTY_CREATE', 'COUNTERPARTY_UPDATE',
        'COUNTERPARTY_ALIAS_CREATE', 'COUNTERPARTY_ALIAS_DELETE',
        'VOUCHER_CHANGE_DETECTED', 'VOUCHER_CHANGE_APPROVED', 'VOUCHER_CHANGE_REJECTED',
        'UPLOAD_TEMPLATE_CREATE', 'UPLOAD_TEMPLATE_UPDATE',
    ]
    for action in settlement_audit_actions:
        conn.execute(sa.text(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'"))

    # =========================================================================
    # 2. 새 Enum 타입 생성 (raw SQL → 트랜잭션 안에서 롤백 가능)
    # =========================================================================
    op.execute("CREATE TYPE counterparty_type AS ENUM ('SELLER', 'BUYER', 'BOTH')")
    op.execute("CREATE TYPE voucher_type AS ENUM ('SALES', 'PURCHASE')")
    op.execute("CREATE TYPE settlement_status AS ENUM ('OPEN', 'SETTLING', 'SETTLED', 'LOCKED')")
    op.execute("CREATE TYPE payment_status AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'LOCKED')")
    op.execute("CREATE TYPE change_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED')")

    # =========================================================================
    # 3. counterparties 테이블
    # =========================================================================
    op.create_table(
        'counterparties',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(200), nullable=False, unique=True, comment='시스템 표준 거래처명 (SSOT)'),
        sa.Column('code', sa.String(50), nullable=True, unique=True, comment='거래처 고유코드 (선택)'),
        sa.Column('counterparty_type', counterparty_type_enum,
                   nullable=False, server_default='BOTH', comment='거래처 타입'),
        sa.Column('contact_info', sa.String(500), nullable=True, comment='연락처 정보'),
        sa.Column('memo', sa.Text, nullable=True, comment='메모'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true', comment='활성 상태'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )

    # =========================================================================
    # 4. counterparty_aliases 테이블
    # =========================================================================
    op.create_table(
        'counterparty_aliases',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('counterparty_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('counterparties.id', ondelete='CASCADE'), nullable=False, comment='연결된 거래처 ID'),
        sa.Column('alias_name', sa.String(200), nullable=False, comment='UPM 표기명 (별칭)'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False, comment='등록자 ID'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('alias_name', name='uq_counterparty_alias_name'),
    )
    op.create_index('ix_counterparty_aliases_counterparty_id', 'counterparty_aliases', ['counterparty_id'])

    # =========================================================================
    # 5. vouchers 테이블
    # =========================================================================
    op.create_table(
        'vouchers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        # UNIQUE KEY 구성요소
        sa.Column('trade_date', sa.Date, nullable=False, index=True, comment='매입일/판매일'),
        sa.Column('counterparty_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('counterparties.id', ondelete='RESTRICT'), nullable=False, comment='매입처/판매처'),
        sa.Column('voucher_number', sa.String(50), nullable=False, comment='UPM 전표 번호'),
        # 공통 필드
        sa.Column('voucher_type', voucher_type_enum,
                   nullable=False, comment='SALES/PURCHASE'),
        sa.Column('quantity', sa.Integer, nullable=False, server_default='0', comment='수량'),
        sa.Column('total_amount', sa.Numeric(18, 2), nullable=False, server_default='0', comment='정산 기준 금액'),
        # 매입 원가 (공통)
        sa.Column('purchase_cost', sa.Numeric(18, 2), nullable=True, comment='매입원가'),
        sa.Column('actual_purchase_price', sa.Numeric(18, 2), nullable=True, comment='실매입가'),
        # 매입 전표 전용
        sa.Column('deduction_amount', sa.Numeric(18, 2), nullable=True, comment='차감금액'),
        sa.Column('avg_unit_price', sa.Numeric(18, 2), nullable=True, comment='평균가'),
        sa.Column('upm_settlement_status', sa.String(50), nullable=True, comment='UPM 원본 정산현황'),
        sa.Column('payment_info', sa.String(500), nullable=True, comment='송금정보'),
        # 판매 전표 전용
        sa.Column('purchase_deduction', sa.Numeric(18, 2), nullable=True, comment='매입차감'),
        sa.Column('as_cost', sa.Numeric(18, 2), nullable=True, comment='A/S비용'),
        sa.Column('sale_amount', sa.Numeric(18, 2), nullable=True, comment='판매금액'),
        sa.Column('sale_deduction', sa.Numeric(18, 2), nullable=True, comment='판매차감'),
        sa.Column('actual_sale_price', sa.Numeric(18, 2), nullable=True, comment='실판매가'),
        sa.Column('profit', sa.Numeric(18, 2), nullable=True, comment='손익'),
        sa.Column('profit_rate', sa.Numeric(8, 2), nullable=True, comment='수익율 %'),
        sa.Column('avg_margin', sa.Numeric(18, 2), nullable=True, comment='평균마진'),
        # 시스템 관리 필드
        sa.Column('settlement_status', settlement_status_enum,
                   nullable=False, server_default='OPEN', comment='시스템 정산 상태'),
        sa.Column('payment_status', payment_status_enum,
                   nullable=False, server_default='UNPAID', comment='시스템 지급 상태'),
        sa.Column('memo', sa.Text, nullable=True, comment='비고'),
        sa.Column('upload_job_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('upload_jobs.id', ondelete='SET NULL'), nullable=True, comment='업로드 Job ID'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False, comment='생성자 ID'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        # UNIQUE 제약
        sa.UniqueConstraint('counterparty_id', 'trade_date', 'voucher_number',
                            name='uq_voucher_counterparty_date_number'),
    )
    # trade_date는 index=True로 자동 생성되므로, 복합 인덱스와 counterparty만 추가
    op.create_index('ix_vouchers_type_status', 'vouchers', ['voucher_type', 'settlement_status'])
    op.create_index('ix_vouchers_counterparty', 'vouchers', ['counterparty_id'])

    # =========================================================================
    # 6. receipts 테이블
    # =========================================================================
    op.create_table(
        'receipts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('voucher_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('vouchers.id', ondelete='CASCADE'), nullable=False, index=True, comment='전표 ID'),
        sa.Column('receipt_date', sa.Date, nullable=False, comment='입금일'),
        sa.Column('amount', sa.Numeric(18, 2), nullable=False, comment='입금액'),
        sa.Column('memo', sa.Text, nullable=True, comment='메모'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False, comment='등록자 ID'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )

    # =========================================================================
    # 7. payments 테이블
    # =========================================================================
    op.create_table(
        'payments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('voucher_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('vouchers.id', ondelete='CASCADE'), nullable=False, index=True, comment='전표 ID'),
        sa.Column('payment_date', sa.Date, nullable=False, comment='송금일'),
        sa.Column('amount', sa.Numeric(18, 2), nullable=False, comment='송금액'),
        sa.Column('memo', sa.Text, nullable=True, comment='메모'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False, comment='등록자 ID'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )

    # =========================================================================
    # 8. voucher_change_requests 테이블
    # =========================================================================
    op.create_table(
        'voucher_change_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('voucher_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('vouchers.id', ondelete='CASCADE'), nullable=False, index=True,
                   comment='변경 대상 전표 ID'),
        sa.Column('upload_job_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('upload_jobs.id', ondelete='SET NULL'), nullable=True, comment='재업로드 Job ID'),
        sa.Column('before_data', postgresql.JSONB, nullable=True, comment='변경 전 데이터 스냅샷'),
        sa.Column('after_data', postgresql.JSONB, nullable=True, comment='변경 후 데이터 스냅샷'),
        sa.Column('diff_summary', postgresql.JSONB, nullable=True, comment='변경된 필드 요약'),
        sa.Column('status', change_request_status_enum,
                   nullable=False, server_default='PENDING', comment='승인 상태'),
        sa.Column('reviewed_by', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, comment='검토자 ID'),
        sa.Column('review_memo', sa.Text, nullable=True, comment='검토 메모'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('reviewed_at', sa.DateTime, nullable=True, comment='검토 일시'),
    )

    # =========================================================================
    # 9. upload_templates 테이블
    # =========================================================================
    op.create_table(
        'upload_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(100), nullable=False, comment='템플릿명'),
        sa.Column('voucher_type', voucher_type_enum,
                   nullable=False, comment='전표 타입'),
        sa.Column('column_mapping', postgresql.JSONB, nullable=False, comment='DB 필드 → 엑셀 헤더 매핑'),
        sa.Column('skip_columns', postgresql.JSONB, nullable=True, comment='파싱 시 무시할 컬럼'),
        sa.Column('is_default', sa.Boolean, nullable=False, server_default='false', comment='기본 템플릿 여부'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False, comment='생성자 ID'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )


def downgrade() -> None:
    # 테이블 삭제 (의존성 역순)
    op.drop_table('upload_templates')
    op.drop_table('voucher_change_requests')
    op.drop_table('payments')
    op.drop_table('receipts')
    op.drop_table('vouchers')
    op.drop_table('counterparty_aliases')
    op.drop_table('counterparties')

    # enum 타입 삭제
    op.execute("DROP TYPE IF EXISTS change_request_status")
    op.execute("DROP TYPE IF EXISTS payment_status")
    op.execute("DROP TYPE IF EXISTS settlement_status")
    op.execute("DROP TYPE IF EXISTS voucher_type")
    op.execute("DROP TYPE IF EXISTS counterparty_type")

    # 참고: user_role, job_type, audit_action의 추가 값은 제거 어려움 (PostgreSQL 제약)
