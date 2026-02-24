"""
정산 관리 시스템 - NettingRecord(상계 기록) + NettingVoucherLink 모델
같은 거래처의 매출(AR)/매입(AP) 전표를 선택하여 상계 처리
"""

import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    Date, DateTime, Text, Numeric,
    ForeignKey, Enum as SQLEnum, UniqueConstraint, Index, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import NettingStatus


class NettingRecord(Base):
    """거래처 매출/매입 상계 기록"""

    __tablename__ = "netting_records"

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

    # ==================== 상계 정보 ====================
    netting_date: Mapped[date] = mapped_column(
        Date, nullable=False, comment="상계일"
    )
    netting_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, comment="상계 금액"
    )
    status: Mapped[NettingStatus] = mapped_column(
        SQLEnum(NettingStatus, name="netting_status"),
        default=NettingStatus.DRAFT,
        nullable=False,
        comment="DRAFT→CONFIRMED / CANCELLED",
    )
    memo: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="메모"
    )

    # ==================== 시스템 관리 ====================
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        comment="생성자 ID",
    )
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="확정자 ID",
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="확정 일시"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # ==================== 관계 ====================
    counterparty = relationship("Counterparty", back_populates="netting_records")
    voucher_links = relationship(
        "NettingVoucherLink",
        back_populates="netting_record",
        cascade="all, delete-orphan",
    )
    generated_transactions = relationship(
        "CounterpartyTransaction", back_populates="netting_record"
    )

    # ==================== 제약 조건 / 인덱스 ====================
    __table_args__ = (
        CheckConstraint("netting_amount > 0", name="ck_nr_amount_positive"),
        Index("ix_nr_counterparty", "counterparty_id"),
        Index("ix_nr_status", "status"),
        Index("ix_nr_date", "netting_date"),
    )

    def __repr__(self) -> str:
        return (
            f"<NettingRecord(id={self.id}, amount={self.netting_amount}, "
            f"status={self.status})>"
        )


class NettingVoucherLink(Base):
    """상계에 참여하는 전표 링크"""

    __tablename__ = "netting_voucher_links"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    netting_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("netting_records.id", ondelete="CASCADE"),
        nullable=False,
        comment="상계 레코드 ID",
    )
    voucher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id", ondelete="RESTRICT"),
        nullable=False,
        comment="전표 ID",
    )
    netted_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, comment="상계 적용 금액"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    # 관계
    netting_record = relationship("NettingRecord", back_populates="voucher_links")
    voucher = relationship("Voucher", back_populates="netting_links")

    __table_args__ = (
        CheckConstraint("netted_amount > 0", name="ck_nvl_amount_positive"),
        UniqueConstraint(
            "netting_record_id", "voucher_id",
            name="uq_nvl_netting_voucher",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<NettingVoucherLink(netting={self.netting_record_id}, "
            f"voucher={self.voucher_id}, amount={self.netted_amount})>"
        )
