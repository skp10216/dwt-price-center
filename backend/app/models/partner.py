"""
단가표 통합 관리 시스템 - Partner 모델 (거래처)
지역/업체 단위의 단가표 제공 주체
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Partner(Base):
    """거래처 테이블"""
    
    __tablename__ = "partners"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 거래처 정보
    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        comment="거래처명 (예: 부천, 광명, 서울, 부산, 대전)"
    )
    region: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="지역"
    )
    contact_info: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="연락처 정보"
    )
    memo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="운영 메모"
    )
    
    # 상태
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="활성 상태"
    )
    
    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="생성 일시"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        comment="수정 일시"
    )
    
    # 관계
    prices = relationship("PartnerPrice", back_populates="partner", cascade="all, delete-orphan")
    mappings = relationship("PartnerMapping", back_populates="partner", cascade="all, delete-orphan")
    favorited_by = relationship("UserPartnerFavorite", back_populates="partner", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Partner(id={self.id}, name={self.name})>"


class UserPartnerFavorite(Base):
    """사용자 거래처 즐겨찾기"""
    __tablename__ = "user_partner_favorites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("partners.id", ondelete="CASCADE"),
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="partner_favorites")
    partner = relationship("Partner", back_populates="favorited_by")

    __table_args__ = (
        UniqueConstraint("user_id", "partner_id", name="uq_user_partner_favorite"),
        Index("ix_user_partner_favorites_user_id", "user_id"),
    )
