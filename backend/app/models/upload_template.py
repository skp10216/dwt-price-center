"""
정산 관리 시스템 - UploadTemplate(업로드 템플릿) 모델
UPM 엑셀 파일의 컬럼 매핑 설정 관리
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import VoucherType


class UploadTemplate(Base):
    """업로드 템플릿 테이블"""

    __tablename__ = "upload_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    name: Mapped[str] = mapped_column(
        String(100), nullable=False, comment="템플릿명"
    )

    voucher_type: Mapped[VoucherType] = mapped_column(
        SQLEnum(VoucherType, name="voucher_type", create_type=False),
        nullable=False,
        comment="전표 타입: SALES/PURCHASE",
    )

    # 컬럼 매핑 설정 JSON
    # {"trade_date": "매입일", "counterparty_name": "매입처", ...}
    column_mapping: Mapped[dict] = mapped_column(
        JSONB, nullable=False, comment="DB 필드 → 엑셀 헤더 매핑"
    )

    # 스킵할 컬럼 목록
    skip_columns: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, comment="파싱 시 무시할 컬럼 목록"
    )

    is_default: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="기본 템플릿 여부"
    )

    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        comment="생성자 ID",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<UploadTemplate(id={self.id}, name={self.name}, type={self.voucher_type})>"
