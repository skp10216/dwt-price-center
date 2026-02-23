"""
단가표 통합 관리 시스템 - Branch 모델 (지사)
거래처를 소속시키는 지사 단위
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Branch(Base):
    """지사 테이블"""

    __tablename__ = "branches"

    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # 지사 정보
    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        comment="지사명"
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

    # 소프트 삭제
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="삭제 일시 (소프트 삭제)"
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="삭제한 사용자 ID"
    )
    delete_reason: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="삭제 사유"
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
        comment="수정 일시 (낙관적 락 version으로 사용)"
    )

    # 관계
    partners = relationship("Partner", back_populates="branch")
    counterparties = relationship("Counterparty", back_populates="branch")

    def __repr__(self) -> str:
        return f"<Branch(id={self.id}, name={self.name})>"
