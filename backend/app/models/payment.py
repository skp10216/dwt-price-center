"""
정산 관리 시스템 - Payment(송금/지급) 모델
매입 전표에 대한 송금 이력 관리 (다회 지급 지원)
"""

import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import Date, DateTime, Text, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Payment(Base):
    """송금(지급) 이력 테이블"""

    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    voucher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="전표 ID",
    )

    payment_date: Mapped[date] = mapped_column(
        Date, nullable=False, comment="송금일"
    )

    amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, comment="송금액"
    )

    memo: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="메모"
    )

    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        comment="등록자 ID",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    # 관계
    voucher = relationship("Voucher", back_populates="payments")

    def __repr__(self) -> str:
        return f"<Payment(id={self.id}, amount={self.amount}, date={self.payment_date})>"
