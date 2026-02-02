"""
단가표 통합 관리 시스템 - CompareList 모델
관리자 지정 비교 모델 리스트
"""

import uuid
from datetime import datetime

from sqlalchemy import Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CompareListModel(Base):
    """관리자 지정 비교 모델 리스트 테이블"""
    
    __tablename__ = "compare_list_models"
    
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
        unique=True,
        nullable=False,
        comment="SSOT 모델 ID"
    )
    
    # 정렬 순서
    sort_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="정렬 순서 (낮을수록 상위)"
    )
    
    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="추가 일시"
    )
    added_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="추가한 관리자 ID"
    )
    
    # 관계
    model = relationship("SSOTModel", back_populates="compare_list_models")
    
    # 인덱스
    __table_args__ = (
        Index("ix_compare_list_models_sort", "sort_order"),
    )
    
    def __repr__(self) -> str:
        return f"<CompareListModel(model_id={self.model_id}, sort_order={self.sort_order})>"
