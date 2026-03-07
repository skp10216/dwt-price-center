"""
정산 관리 시스템 - IntakeItem(반입 내역) 모델
UPM 반입 내역 엑셀 업로드 데이터를 개별 기기 단위로 관리
margin은 저장하지 않음 — hybrid_property로 서버 계산 (actual_purchase_price - intake_price)
"""

import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    String, Boolean, Date, DateTime, Text, Numeric,
    ForeignKey, Index, UniqueConstraint, Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import IntakeStatus, IntakeType


class IntakeItem(Base):
    """반입 내역 테이블 (개별 기기 단위)"""

    __tablename__ = "intake_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ==================== 반입 기본 정보 ====================
    intake_date: Mapped[date] = mapped_column(
        Date, nullable=False, comment="반입일"
    )
    slip_number: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="전표번호"
    )
    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("counterparties.id", ondelete="RESTRICT"),
        nullable=False,
        comment="반입처 → Counterparty",
    )

    # ==================== 기기 정보 ====================
    pg_no: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="P/G No"
    )
    model_name: Mapped[str | None] = mapped_column(
        String(200), nullable=True, comment="모델명"
    )
    serial_number: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="일련번호"
    )

    # ==================== 매입 이력 ====================
    purchase_date: Mapped[date | None] = mapped_column(
        Date, nullable=True, comment="매입일"
    )
    purchase_counterparty_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("counterparties.id", ondelete="SET NULL"),
        nullable=True,
        comment="매입처 → Counterparty",
    )

    # ==================== 금액 (원본값만 저장, margin은 파생) ====================
    actual_purchase_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=0,
        comment="실매입가",
    )
    intake_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=0,
        comment="반입가",
    )

    # ==================== 상태/분류 (enum) ====================
    intake_type: Mapped[IntakeType] = mapped_column(
        SQLEnum(IntakeType, name="intake_type"),
        default=IntakeType.NORMAL,
        nullable=False,
        comment="반입구분: NORMAL/RETURN_INTAKE/TRANSFER/OTHER",
    )
    current_status: Mapped[IntakeStatus] = mapped_column(
        SQLEnum(IntakeStatus, name="intake_status"),
        default=IntakeStatus.RECEIVED,
        nullable=False,
        comment="현상태: RECEIVED/IN_STOCK/SOLD/HOLD/EXCLUDED",
    )

    # ==================== 비고 ====================
    remarks: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="특이사항"
    )
    memo: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="비고"
    )

    # ==================== 시스템 ====================
    dedupe_key: Mapped[str] = mapped_column(
        String(500), nullable=False, comment="중복 감지 키"
    )
    is_locked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="기간 마감 잠금"
    )
    source_voucher_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id", ondelete="SET NULL"),
        nullable=True,
        comment="원매입전표 ID",
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # ==================== 파생 계산 프로퍼티 ====================
    @hybrid_property
    def margin(self) -> Decimal:
        return (self.actual_purchase_price or Decimal("0")) - (self.intake_price or Decimal("0"))

    @hybrid_property
    def margin_rate(self) -> Decimal:
        app = self.actual_purchase_price or Decimal("0")
        if app == 0:
            return Decimal("0")
        return (app - (self.intake_price or Decimal("0"))) / app * 100

    # ==================== 관계 ====================
    counterparty = relationship("Counterparty", foreign_keys=[counterparty_id])
    purchase_counterparty = relationship("Counterparty", foreign_keys=[purchase_counterparty_id])
    source_voucher = relationship("Voucher", foreign_keys=[source_voucher_id])

    # ==================== 제약 / 인덱스 ====================
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_intake_item_dedupe_key"),
        Index("ix_intake_items_date", "intake_date"),
        Index("ix_intake_items_counterparty", "counterparty_id"),
        Index("ix_intake_items_serial", "serial_number"),
        Index("ix_intake_items_status", "current_status"),
        Index("ix_intake_items_locked", "is_locked"),
    )

    def __repr__(self) -> str:
        return (
            f"<IntakeItem(id={self.id}, date={self.intake_date}, "
            f"slip={self.slip_number}, serial={self.serial_number})>"
        )
