"""
정산 관리 시스템 - PeriodLock(기간 마감) 모델
월별 마감 상태를 명시적으로 관리하는 SSOT 테이블
기존 전표 상태 스캔 방식에서 전환
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    String, Integer, DateTime, Text,
    ForeignKey, Enum as SQLEnum, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import PeriodLockStatus


class PeriodLock(Base):
    """기간(월별) 마감 레코드"""

    __tablename__ = "period_locks"

    # ==================== 기본 키 ====================
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ==================== 기간 정보 ====================
    year_month: Mapped[str] = mapped_column(
        String(7), nullable=False, comment="마감 기간 (YYYY-MM)"
    )

    # ==================== 상태 ====================
    status: Mapped[PeriodLockStatus] = mapped_column(
        SQLEnum(PeriodLockStatus, name="period_lock_status"),
        default=PeriodLockStatus.OPEN,
        nullable=False,
        comment="OPEN/LOCKED/ADJUSTING",
    )
    locked_voucher_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, comment="마감된 전표 수"
    )

    # ==================== 마감 정보 ====================
    locked_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="마감 일시"
    )
    locked_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="마감 담당자 ID",
    )

    # ==================== 해제 정보 ====================
    unlocked_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="해제 일시"
    )
    unlocked_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="해제 담당자 ID",
    )

    # ==================== 기타 ====================
    memo: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="메모"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # ==================== 제약 조건 ====================
    __table_args__ = (
        UniqueConstraint("year_month", name="uq_period_lock_year_month"),
    )

    def __repr__(self) -> str:
        return f"<PeriodLock(year_month={self.year_month}, status={self.status})>"
