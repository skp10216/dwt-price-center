"""
정산 관리 시스템 - CorporateEntity 모델 (법인)
회사가 보유한 법인 단위 관리. 은행 임포트 시 어느 법인 계좌에서 입출금이 이루어졌는지 추적.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CorporateEntity(Base):
    """법인 (Corporate Entity) 마스터"""

    __tablename__ = "corporate_entities"

    # ==================== 기본 키 ====================
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ==================== 법인 정보 ====================
    name: Mapped[str] = mapped_column(
        String(200), unique=True, nullable=False, comment="법인명"
    )
    code: Mapped[str | None] = mapped_column(
        String(50), unique=True, nullable=True, comment="법인 코드"
    )
    business_number: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="사업자등록번호"
    )
    memo: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="메모"
    )

    # ==================== 상태 ====================
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, comment="활성 상태"
    )

    # ==================== 타임스탬프 ====================
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # ==================== 관계 ====================
    bank_import_jobs = relationship("BankImportJob", back_populates="corporate_entity")

    def __repr__(self) -> str:
        return f"<CorporateEntity(id={self.id}, name={self.name})>"
