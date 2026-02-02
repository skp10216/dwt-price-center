"""
단가표 통합 관리 시스템 - UploadJob 모델
업로드 작업 상태 및 결과 관리
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import JobType, JobStatus


class UploadJob(Base):
    """업로드 작업 테이블"""
    
    __tablename__ = "upload_jobs"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 작업 타입
    job_type: Mapped[JobType] = mapped_column(
        SQLEnum(JobType, name="job_type"),
        nullable=False,
        comment="작업 타입: hq_excel, partner_excel, partner_image"
    )
    
    # 작업 상태
    status: Mapped[JobStatus] = mapped_column(
        SQLEnum(JobStatus, name="job_status"),
        default=JobStatus.QUEUED,
        nullable=False,
        comment="작업 상태: queued, running, succeeded, failed"
    )
    progress: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="진행률 (0-100, 단계 기반: 0/25/50/75/100)"
    )
    
    # 파일 정보
    file_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        comment="업로드 파일 경로"
    )
    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="원본 파일명"
    )
    file_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        comment="파일 해시 (중복 방지용)"
    )
    
    # 거래처 정보 (거래처 업로드 시)
    partner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("partners.id", ondelete="SET NULL"),
        nullable=True,
        comment="거래처 ID (거래처 업로드 시)"
    )
    
    # 생성자 정보
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        comment="생성자 ID"
    )
    
    # 결과 정보
    result_summary: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="결과 요약 (매핑/미매핑 개수, 오류 등)"
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="오류 메시지 (실패 시)"
    )
    
    # 검수/확정/적용 상태
    is_reviewed: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
        comment="검수 완료 여부"
    )
    is_confirmed: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
        comment="확정 여부"
    )
    is_applied: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
        comment="적용 여부 (본사 단가표)"
    )
    
    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="생성 일시"
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="시작 일시"
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="완료 일시"
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="확정 일시"
    )
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="적용 일시"
    )
    
    # 관계
    created_by_user = relationship("User", back_populates="upload_jobs")
    
    def __repr__(self) -> str:
        return f"<UploadJob(id={self.id}, type={self.job_type}, status={self.status})>"
