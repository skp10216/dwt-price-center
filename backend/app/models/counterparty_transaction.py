"""
정산 관리 시스템 - CounterpartyTransaction(거래처 입출금 이벤트) 모델
전표와 무관하게 거래처 수준에서 입출금을 기록하고, 이후 전표에 배분(Allocation)
"""

import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    String, Date, DateTime, Text, Numeric,
    ForeignKey, Enum as SQLEnum, Index, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import TransactionType, TransactionSource, TransactionStatus


class CounterpartyTransaction(Base):
    """거래처 입출금 이벤트 테이블"""

    __tablename__ = "counterparty_transactions"

    # ==================== 기본 키 ====================
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ==================== 거래처 연결 ====================
    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("counterparties.id", ondelete="RESTRICT"),
        nullable=False,
        comment="거래처 ID",
    )

    # ==================== 거래 정보 ====================
    transaction_type: Mapped[TransactionType] = mapped_column(
        SQLEnum(TransactionType, name="transaction_type"),
        nullable=False,
        comment="DEPOSIT(입금)/WITHDRAWAL(출금)",
    )
    transaction_date: Mapped[date] = mapped_column(
        Date, nullable=False, comment="입출금일"
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, comment="금액 (양수만)"
    )
    allocated_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=0,
        comment="배분 누적액 (비정규화)",
    )
    memo: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="메모"
    )

    # ==================== 발생 소스 ====================
    source: Mapped[TransactionSource] = mapped_column(
        SQLEnum(TransactionSource, name="transaction_source"),
        nullable=False,
        default=TransactionSource.MANUAL,
        comment="발생 소스: MANUAL/BANK_IMPORT/NETTING",
    )
    bank_reference: Mapped[str | None] = mapped_column(
        String(100), nullable=True, unique=True,
        comment="은행 참조번호 (중복 방지)",
    )
    bank_import_line_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bank_import_lines.id", ondelete="SET NULL"),
        nullable=True,
        comment="은행 임포트 라인 ID",
    )
    netting_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("netting_records.id", ondelete="SET NULL"),
        nullable=True,
        comment="상계 레코드 ID",
    )

    # ==================== 상태 ====================
    status: Mapped[TransactionStatus] = mapped_column(
        SQLEnum(TransactionStatus, name="transaction_status"),
        default=TransactionStatus.PENDING,
        nullable=False,
        comment="PENDING→PARTIAL→ALLOCATED / CANCELLED",
    )

    # ==================== 시스템 관리 ====================
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        comment="등록자 ID",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # ==================== 관계 ====================
    counterparty = relationship("Counterparty", back_populates="transactions")
    allocations = relationship(
        "TransactionAllocation",
        back_populates="transaction",
        cascade="all, delete-orphan",
    )
    bank_import_line = relationship(
        "BankImportLine", foreign_keys=[bank_import_line_id]
    )
    netting_record = relationship("NettingRecord", back_populates="generated_transactions")

    # ==================== 제약 조건 / 인덱스 ====================
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_ct_amount_positive"),
        CheckConstraint("allocated_amount >= 0", name="ck_ct_allocated_nonneg"),
        CheckConstraint("allocated_amount <= amount", name="ck_ct_allocated_lte_amount"),
        Index("ix_ct_counterparty_date", "counterparty_id", "transaction_date"),
        Index("ix_ct_status", "status"),
        Index("ix_ct_source", "source"),
    )

    @property
    def unallocated_amount(self) -> Decimal:
        """미배분 잔액"""
        return self.amount - self.allocated_amount

    def __repr__(self) -> str:
        return (
            f"<CounterpartyTransaction(id={self.id}, type={self.transaction_type}, "
            f"amount={self.amount}, status={self.status})>"
        )
