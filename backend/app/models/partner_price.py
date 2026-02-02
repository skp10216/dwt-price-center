"""
단가표 통합 관리 시스템 - PartnerPrice 모델
거래처별 SSOT 모델 매핑 단가
"""

import uuid
from datetime import datetime

from sqlalchemy import Integer, Float, String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PartnerPrice(Base):
    """거래처 단가 테이블"""
    
    __tablename__ = "partner_prices"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 외래 키
    partner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("partners.id", ondelete="CASCADE"),
        nullable=False,
        comment="거래처 ID"
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ssot_models.id", ondelete="CASCADE"),
        nullable=False,
        comment="SSOT 모델 ID"
    )
    grade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("grades.id", ondelete="RESTRICT"),
        nullable=False,
        comment="등급 ID"
    )
    
    # 가격 정보
    price: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="거래처 단가 (원)"
    )
    
    # 업로드 정보
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="업로드 일시"
    )
    upload_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("upload_jobs.id", ondelete="SET NULL"),
        nullable=True,
        comment="업로드 작업 ID"
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
    partner = relationship("Partner", back_populates="prices")
    model = relationship("SSOTModel", back_populates="partner_prices")
    grade = relationship("Grade", back_populates="partner_prices")
    
    # 인덱스 (복합 유니크: 거래처+모델+등급 조합당 1개 가격)
    __table_args__ = (
        Index("ix_partner_prices_partner_model_grade", "partner_id", "model_id", "grade_id", unique=True),
        Index("ix_partner_prices_model", "model_id"),
    )
    
    def __repr__(self) -> str:
        return f"<PartnerPrice(partner_id={self.partner_id}, model_id={self.model_id}, price={self.price})>"


class PartnerMapping(Base):
    """거래처 표기 매핑 테이블 (거래처 표기 → SSOT 모델 연결)"""
    
    __tablename__ = "partner_mappings"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 외래 키
    partner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("partners.id", ondelete="CASCADE"),
        nullable=False,
        comment="거래처 ID"
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ssot_models.id", ondelete="CASCADE"),
        nullable=False,
        comment="SSOT 모델 ID"
    )
    
    # 매핑 정보
    partner_expression: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="거래처 원본 표기 (예: 아이폰15프로맥스 256)"
    )
    confidence: Mapped[float] = mapped_column(
        Float,
        default=1.0,
        nullable=False,
        comment="매핑 신뢰도 (0.0 ~ 1.0, 수동 매핑은 1.0)"
    )
    is_manual: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
        comment="수동 매핑 여부"
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
    partner = relationship("Partner", back_populates="mappings")
    model = relationship("SSOTModel", back_populates="partner_mappings")
    
    # 인덱스 (복합 유니크: 거래처+표기 조합)
    __table_args__ = (
        Index("ix_partner_mappings_partner_expression", "partner_id", "partner_expression", unique=True),
    )
    
    def __repr__(self) -> str:
        return f"<PartnerMapping(partner_id={self.partner_id}, expression={self.partner_expression})>"
