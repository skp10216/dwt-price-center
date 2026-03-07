"""
정산 관리 시스템 - ReturnItem(반품 내역) 모델
UPM 반품 내역 엑셀 업로드 데이터를 개별 기기 단위로 관리
Unique Key: dedupe_key (IMEI 기반 또는 복합키 기반 자동 생성)
"""

import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    String, Boolean, Date, DateTime, Text, Numeric,
    ForeignKey, Index, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ReturnItem(Base):
    """반품 내역 테이블 (개별 기기 단위)"""

    __tablename__ = "return_items"

    # ==================== 기본 키 ====================
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ==================== 반품 기본 정보 ====================
    return_date: Mapped[date] = mapped_column(
        Date, nullable=False, comment="반품일"
    )
    slip_number: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="전표번호"
    )
    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("counterparties.id", ondelete="RESTRICT"),
        nullable=False,
        comment="반품처 → Counterparty",
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
    imei: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="IMEI"
    )
    color: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="색상"
    )

    # ==================== 금액 정보 ====================
    purchase_cost: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=0,
        comment="매입원가",
    )
    purchase_deduction: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=0,
        comment="매입차감",
    )
    return_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=0,
        comment="반품금액",
    )
    as_cost: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=0,
        comment="A/S금액",
    )

    # ==================== 상태/비고 ====================
    remarks: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="특이사항 (기기 상태)"
    )
    memo: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="비고"
    )

    # ==================== 중복 감지 / 잠금 / 원전표 ====================
    dedupe_key: Mapped[str] = mapped_column(
        String(500), nullable=False,
        comment="중복 감지 키: IMEI 기반 또는 복합키 기반 자동 생성",
    )
    is_locked: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="기간 마감 잠금 여부",
    )
    source_voucher_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id", ondelete="SET NULL"),
        nullable=True,
        comment="원래 매입 전표 ID (자동 매칭)",
    )

    # ==================== 시스템 관리 필드 ====================
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

    # ==================== 관계 ====================
    counterparty = relationship("Counterparty", foreign_keys=[counterparty_id])
    source_voucher = relationship("Voucher", foreign_keys=[source_voucher_id])

    # ==================== 제약 조건 / 인덱스 ====================
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_return_item_dedupe_key"),
        Index("ix_return_items_date", "return_date"),
        Index("ix_return_items_counterparty", "counterparty_id"),
        Index("ix_return_items_imei", "imei"),
        Index("ix_return_items_slip_number", "slip_number"),
        Index("ix_return_items_locked", "is_locked"),
    )

    def __repr__(self) -> str:
        return (
            f"<ReturnItem(id={self.id}, date={self.return_date}, "
            f"slip={self.slip_number}, imei={self.imei})>"
        )
