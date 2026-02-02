"""
단가표 통합 관리 시스템 - GradePrice 모델
SSOT 모델별 등급 기본가 (본사 기준)
"""

import uuid
from datetime import datetime

from sqlalchemy import Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class GradePrice(Base):
    """등급별 기본가 테이블 (본사 기준)"""
    
    __tablename__ = "grade_prices"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 외래 키
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
        comment="등급별 기본가 (원)"
    )
    
    # 적용 정보
    applied_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="적용 일시"
    )
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
        comment="버전 (업로드/적용 시 증가)"
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
    model = relationship("SSOTModel", back_populates="grade_prices")
    grade = relationship("Grade", back_populates="grade_prices")
    
    # 인덱스 (복합 유니크)
    __table_args__ = (
        Index("ix_grade_prices_model_grade", "model_id", "grade_id", unique=True),
    )
    
    def __repr__(self) -> str:
        return f"<GradePrice(model_id={self.model_id}, grade_id={self.grade_id}, price={self.price})>"
