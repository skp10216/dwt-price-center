"""
단가표 통합 관리 시스템 - Grade 모델 (등급)
중고 기기 상태 등급 관리 (A+, A, A-, B+ 등)
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Grade(Base):
    """등급 테이블"""
    
    __tablename__ = "grades"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 등급 정보
    name: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
        comment="등급명 (예: A+, A, A-, B+, 수출, 기타)"
    )
    description: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="등급 설명"
    )
    
    # 정렬 순서
    sort_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="정렬 순서 (낮을수록 상위)"
    )
    
    # 상태
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="활성 상태 (사용 중인 등급은 삭제 금지, 비활성화로 운영)"
    )
    
    # 기본값 여부
    is_default: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="기본 등급 여부 (비교 화면 기본 선택)"
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
    grade_prices = relationship("GradePrice", back_populates="grade")
    partner_prices = relationship("PartnerPrice", back_populates="grade")
    
    def __repr__(self) -> str:
        return f"<Grade(id={self.id}, name={self.name}, active={self.is_active})>"
