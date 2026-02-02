"""
단가표 통합 관리 시스템 - Deduction 모델 (정액 차감)
상태 이슈별 고정 금액 차감 관리
최종가 = 등급별 기본가 - Σ(선택된 차감 금액 합)
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DeductionItem(Base):
    """차감 항목 테이블"""
    
    __tablename__ = "deduction_items"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 항목 정보
    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        comment="차감 항목명 (예: 내부 잔상, 서브 잔상, 줄감, 외관 찍힘, 카메라 불량)"
    )
    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="항목 설명"
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
        comment="활성 상태 (사용 중인 항목은 삭제 금지, 비활성화로 운영)"
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
    levels = relationship(
        "DeductionLevel",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="DeductionLevel.sort_order"
    )
    
    def __repr__(self) -> str:
        return f"<DeductionItem(id={self.id}, name={self.name})>"


class DeductionLevel(Base):
    """차감 레벨 테이블 (항목별 단계별 금액)"""
    
    __tablename__ = "deduction_levels"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 외래 키
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("deduction_items.id", ondelete="CASCADE"),
        nullable=False,
        comment="차감 항목 ID"
    )
    
    # 레벨 정보
    name: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="레벨명 (예: L1, L2, L3, L4 또는 중상, 상, 대잔상)"
    )
    amount: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="차감 금액 (원)"
    )
    
    # 정렬 순서
    sort_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="정렬 순서 (낮을수록 상위, 보통 차감 금액 순)"
    )
    
    # 상태
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="활성 상태 (사용 중인 레벨은 삭제 금지, 비활성화로 운영)"
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
    item = relationship("DeductionItem", back_populates="levels")
    
    # 인덱스
    __table_args__ = (
        Index("ix_deduction_levels_item_name", "item_id", "name", unique=True),
    )
    
    def __repr__(self) -> str:
        return f"<DeductionLevel(item_id={self.item_id}, name={self.name}, amount={self.amount})>"
