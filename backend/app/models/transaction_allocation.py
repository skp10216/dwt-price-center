"""
정산 관리 시스템 - TransactionAllocation(배분) 모델
거래처 입출금 이벤트를 개별 전표에 배분하는 매핑 테이블
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Integer, DateTime, Text, Numeric,
    ForeignKey, UniqueConstraint, Index, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TransactionAllocation(Base):
    """입출금 → 전표 배분 매핑 테이블"""

    __tablename__ = "transaction_allocations"

    # ==================== 기본 키 ====================
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ==================== 연결 ====================
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("counterparty_transactions.id", ondelete="CASCADE"),
        nullable=False,
        comment="입출금 이벤트 ID",
    )
    voucher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id", ondelete="RESTRICT"),
        nullable=False,
        comment="전표 ID",
    )

    # ==================== 배분 정보 ====================
    allocated_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, comment="배분 금액"
    )
    allocation_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, comment="배분 순서 (FIFO 순서 기록)"
    )
    memo: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="메모"
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

    # ==================== 관계 ====================
    transaction = relationship("CounterpartyTransaction", back_populates="allocations")
    voucher = relationship("Voucher", back_populates="allocations")

    # ==================== 제약 조건 / 인덱스 ====================
    __table_args__ = (
        CheckConstraint("allocated_amount > 0", name="ck_ta_amount_positive"),
        UniqueConstraint(
            "transaction_id", "voucher_id",
            name="uq_ta_transaction_voucher",
        ),
        Index("ix_ta_transaction", "transaction_id"),
        Index("ix_ta_voucher", "voucher_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<TransactionAllocation(txn={self.transaction_id}, "
            f"voucher={self.voucher_id}, amount={self.allocated_amount})>"
        )
