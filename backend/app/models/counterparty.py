"""
정산 관리 시스템 - Counterparty(거래처) + CounterpartyAlias(별칭) 모델
거래처 SSOT + UPM 표기명 별칭 매핑
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import CounterpartyType


class Counterparty(Base):
    """거래처 테이블 (정산 도메인 SSOT)"""

    __tablename__ = "counterparties"

    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # 거래처 정보
    name: Mapped[str] = mapped_column(
        String(200),
        unique=True,
        nullable=False,
        comment="시스템 표준 거래처명 (SSOT)",
    )
    code: Mapped[str | None] = mapped_column(
        String(50),
        unique=True,
        nullable=True,
        comment="거래처 고유코드 (선택)",
    )
    counterparty_type: Mapped[CounterpartyType] = mapped_column(
        SQLEnum(CounterpartyType, name="counterparty_type"),
        default=CounterpartyType.BOTH,
        nullable=False,
        comment="거래처 타입: seller(판매처)/buyer(매입처)/both(양쪽)",
    )

    # 소속 지사
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
        comment="소속 지사 ID",
    )

    # 연락처 / 메모
    contact_info: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="연락처 정보",
    )
    memo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="메모",
    )

    # 상태
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="활성 상태",
    )

    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # 관계
    branch = relationship("Branch", back_populates="counterparties")
    aliases = relationship(
        "CounterpartyAlias", back_populates="counterparty", cascade="all, delete-orphan"
    )
    vouchers = relationship("Voucher", back_populates="counterparty")
    favorited_by = relationship("UserCounterpartyFavorite", back_populates="counterparty", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Counterparty(id={self.id}, name={self.name}, type={self.counterparty_type})>"


class CounterpartyAlias(Base):
    """거래처 별칭 테이블 - UPM 표기명 매핑"""

    __tablename__ = "counterparty_aliases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("counterparties.id", ondelete="CASCADE"),
        nullable=False,
        comment="연결된 거래처 ID",
    )

    alias_name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="UPM 표기명 (별칭)",
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
    counterparty = relationship("Counterparty", back_populates="aliases")

    __table_args__ = (
        UniqueConstraint("alias_name", name="uq_counterparty_alias_name"),
    )

    def __repr__(self) -> str:
        return f"<CounterpartyAlias(alias={self.alias_name}, counterparty_id={self.counterparty_id})>"


class UserCounterpartyFavorite(Base):
    """사용자 거래처 즐겨찾기 (정산 도메인)"""
    __tablename__ = "user_counterparty_favorites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("counterparties.id", ondelete="CASCADE"),
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="counterparty_favorites")
    counterparty = relationship("Counterparty", back_populates="favorited_by")

    __table_args__ = (
        UniqueConstraint("user_id", "counterparty_id", name="uq_user_counterparty_favorite"),
        Index("ix_user_counterparty_favorites_user_id", "user_id"),
    )
