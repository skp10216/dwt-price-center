"""
단가표 통합 관리 시스템 - HQPriceApply 모델
본사 단가표 적용 이력 및 락 관리
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class HQPriceApply(Base):
    """본사 단가표 적용 이력 테이블"""
    
    __tablename__ = "hq_price_applies"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 업로드 작업 참조
    upload_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("upload_jobs.id", ondelete="SET NULL"),
        nullable=False,
        comment="업로드 작업 ID"
    )
    
    # 적용 정보
    version: Mapped[int] = mapped_column(
        nullable=False,
        comment="적용 버전"
    )
    memo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="적용 메모"
    )
    
    # 적용 결과 요약
    applied_count: Mapped[int] = mapped_column(
        default=0,
        nullable=False,
        comment="적용된 모델 수"
    )
    price_changes: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="가격 변경 요약"
    )
    
    # 적용자 정보
    applied_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        comment="적용자 ID"
    )
    applied_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="적용 일시"
    )
    
    # 현재 적용 여부
    is_current: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="현재 적용 중 여부"
    )
    
    def __repr__(self) -> str:
        return f"<HQPriceApply(id={self.id}, version={self.version}, is_current={self.is_current})>"


class HQPriceApplyLock(Base):
    """본사 단가표 적용 락 테이블 (동시 적용 방지)"""
    
    __tablename__ = "hq_price_apply_locks"
    
    # 기본 키 (항상 1개의 레코드만 존재)
    id: Mapped[int] = mapped_column(
        primary_key=True,
        default=1,
        comment="락 ID (항상 1)"
    )
    
    # 락 정보
    is_locked: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="락 상태"
    )
    locked_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="락 소유자 ID"
    )
    locked_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="락 시작 일시"
    )
    lock_reason: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="락 사유"
    )
    
    def __repr__(self) -> str:
        return f"<HQPriceApplyLock(is_locked={self.is_locked}, locked_by={self.locked_by})>"
