"""
정산 관리 시스템 - Voucher(전표) 모델
매입/판매 통합 단일 테이블 (STI 패턴)
Unique Key: (counterparty_id, trade_date, voucher_number)
"""

import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    String, Integer, Date, DateTime, Text, Numeric,
    ForeignKey, Enum as SQLEnum, UniqueConstraint, Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import VoucherType, SettlementStatus, PaymentStatus


class Voucher(Base):
    """전표 테이블 (매입/판매 통합 SSOT)"""

    __tablename__ = "vouchers"

    # ==================== 기본 키 ====================
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ==================== UNIQUE KEY (매입일/판매일 + 매입처/판매처 + 번호) ====================
    trade_date: Mapped[date] = mapped_column(
        Date, nullable=False, index=True, comment="매입일/판매일"
    )
    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("counterparties.id", ondelete="RESTRICT"),
        nullable=False,
        comment="매입처/판매처 → Counterparty",
    )
    voucher_number: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="UPM 전표 번호"
    )

    # ==================== 공통 필드 ====================
    voucher_type: Mapped[VoucherType] = mapped_column(
        SQLEnum(VoucherType, name="voucher_type"),
        nullable=False,
        comment="SALES(판매)/PURCHASE(매입)",
    )
    quantity: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="수량"
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=0,
        comment="정산 기준 금액 (매입:실매입가, 판매:실판매가)",
    )

    # ==================== 매입 원가 (공통) ====================
    purchase_cost: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="매입원가"
    )
    actual_purchase_price: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="실매입가"
    )

    # ==================== 매입 전표 전용 ====================
    deduction_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="차감금액 (매입 전용)"
    )
    avg_unit_price: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="평균가 (매입 전용)"
    )
    upm_settlement_status: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="UPM 원본 정산현황 (검수대기/정산완료 등)"
    )
    payment_info: Mapped[str | None] = mapped_column(
        String(500), nullable=True, comment="송금정보 (매입 전용)"
    )

    # ==================== 판매 전표 전용 ====================
    purchase_deduction: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="매입차감 (판매 전용)"
    )
    as_cost: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="A/S비용 (판매 전용)"
    )
    sale_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="판매금액 (판매 전용)"
    )
    sale_deduction: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="판매차감 (판매 전용)"
    )
    actual_sale_price: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="실판매가 (판매 전용)"
    )
    profit: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="손익 (판매 전용)"
    )
    profit_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 2), nullable=True, comment="수익율 % (판매 전용)"
    )
    avg_margin: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="평균마진 (판매 전용)"
    )

    # ==================== 시스템 관리 필드 ====================
    settlement_status: Mapped[SettlementStatus] = mapped_column(
        SQLEnum(SettlementStatus, name="settlement_status"),
        default=SettlementStatus.OPEN,
        nullable=False,
        comment="시스템 정산 상태",
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SQLEnum(PaymentStatus, name="payment_status"),
        default=PaymentStatus.UNPAID,
        nullable=False,
        comment="시스템 지급 상태",
    )
    memo: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="비고"
    )
    upload_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("upload_jobs.id", ondelete="SET NULL"),
        nullable=True,
        comment="업로드 Job ID",
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        comment="생성자 ID",
    )

    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # ==================== 관계 ====================
    counterparty = relationship("Counterparty", back_populates="vouchers")
    receipts = relationship("Receipt", back_populates="voucher", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="voucher", cascade="all, delete-orphan")
    change_requests = relationship("VoucherChangeRequest", back_populates="voucher")

    # ==================== 제약 조건 / 인덱스 ====================
    __table_args__ = (
        UniqueConstraint(
            "counterparty_id", "trade_date", "voucher_number",
            name="uq_voucher_counterparty_date_number",
        ),
        Index("ix_vouchers_type_status", "voucher_type", "settlement_status"),
        Index("ix_vouchers_trade_date", "trade_date"),
        Index("ix_vouchers_counterparty", "counterparty_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<Voucher(id={self.id}, type={self.voucher_type}, "
            f"date={self.trade_date}, number={self.voucher_number})>"
        )
