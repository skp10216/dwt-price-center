"""
단가표 통합 관리 시스템 - AuditLog 모델
감사로그: 누가/언제/무엇을/어떻게 + 변경 전/후
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Text, ForeignKey, Enum as SQLEnum, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AuditAction


class AuditLog(Base):
    """감사로그 테이블"""
    
    __tablename__ = "audit_logs"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 추적 ID (동일 작업 단위 묶음)
    trace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
        comment="추적 ID (업로드 작업 등 동일 작업 단위로 묶음)"
    )
    
    # 사용자 정보
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        comment="사용자 ID"
    )
    
    # 액션 정보
    action: Mapped[AuditAction] = mapped_column(
        SQLEnum(AuditAction, name="audit_action"),
        nullable=False,
        comment="액션 타입"
    )
    
    # 대상 정보
    target_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="대상 타입 (예: ssot_model, grade, deduction, upload_job)"
    )
    target_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        comment="대상 ID"
    )
    
    # 변경 내용
    before_data: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="변경 전 데이터"
    )
    after_data: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="변경 후 데이터"
    )
    
    # 추가 정보
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="변경 설명"
    )
    ip_address: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
        comment="IP 주소"
    )
    user_agent: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="User Agent"
    )
    
    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
        comment="생성 일시"
    )
    
    # 관계
    user = relationship("User", back_populates="audit_logs")
    
    # 인덱스
    __table_args__ = (
        Index("ix_audit_logs_user_created", "user_id", "created_at"),
        Index("ix_audit_logs_action_created", "action", "created_at"),
        Index("ix_audit_logs_target", "target_type", "target_id"),
    )
    
    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, action={self.action}, target={self.target_type})>"
