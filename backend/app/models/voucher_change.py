"""
정산 관리 시스템 - VoucherChangeRequest(전표 변경 요청) 모델
재업로드 시 기존 전표와 diff가 발생할 때 승인/거부를 관리
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import ChangeRequestStatus


class VoucherChangeRequest(Base):
    """전표 변경 요청 테이블"""

    __tablename__ = "voucher_change_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    voucher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="변경 대상 전표 ID",
    )

    upload_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("upload_jobs.id", ondelete="SET NULL"),
        nullable=True,
        comment="재업로드 Job ID",
    )

    # 변경 내용 (스냅샷)
    before_data: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, comment="변경 전 데이터 스냅샷"
    )
    after_data: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, comment="변경 후 데이터 스냅샷"
    )
    diff_summary: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, comment="변경된 필드 요약 [{field, old, new}, ...]"
    )

    # 승인 상태
    status: Mapped[ChangeRequestStatus] = mapped_column(
        SQLEnum(ChangeRequestStatus, name="change_request_status"),
        default=ChangeRequestStatus.PENDING,
        nullable=False,
        comment="승인 상태: pending/approved/rejected",
    )

    # 검토 정보
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="검토자 ID",
    )
    review_memo: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="검토 메모"
    )

    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="검토 일시"
    )

    # 관계
    voucher = relationship("Voucher", back_populates="change_requests")

    def __repr__(self) -> str:
        return f"<VoucherChangeRequest(id={self.id}, voucher={self.voucher_id}, status={self.status})>"
