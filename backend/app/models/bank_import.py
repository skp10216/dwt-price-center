"""
정산 관리 시스템 - BankImportJob + BankImportLine 모델
은행 파일 가져오기 작업 및 원장 개별 라인 관리
원본 보관 → 매칭/검수 → 확정 파이프라인
"""

import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    String, Integer, Date, DateTime, Text, Numeric, Boolean,
    ForeignKey, Enum as SQLEnum, Index,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import BankImportJobStatus, BankImportLineStatus


class BankImportJob(Base):
    """은행 파일 가져오기 작업"""

    __tablename__ = "bank_import_jobs"

    # ==================== 기본 키 ====================
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ==================== 파일 정보 ====================
    file_path: Mapped[str] = mapped_column(
        String(500), nullable=False, comment="파일 저장 경로"
    )
    original_filename: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="원본 파일명"
    )
    file_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="파일 해시 (중복 방지)"
    )

    # ==================== 은행 정보 ====================
    bank_name: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="은행명"
    )
    account_number: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="계좌번호"
    )
    import_date_from: Mapped[date | None] = mapped_column(
        Date, nullable=True, comment="가져오기 기간 시작"
    )
    import_date_to: Mapped[date | None] = mapped_column(
        Date, nullable=True, comment="가져오기 기간 끝"
    )

    # ==================== 상태 / 진행률 ====================
    status: Mapped[BankImportJobStatus] = mapped_column(
        SQLEnum(BankImportJobStatus, name="bank_import_job_status"),
        default=BankImportJobStatus.UPLOADED,
        nullable=False,
        comment="작업 상태",
    )
    total_lines: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, comment="전체 라인 수"
    )
    matched_lines: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, comment="매칭된 라인 수"
    )
    confirmed_lines: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, comment="확정된 라인 수"
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="에러 메시지"
    )

    # ==================== 시스템 관리 ====================
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        comment="등록자 ID",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="파싱 완료 일시"
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="확정 일시"
    )

    # ==================== 관계 ====================
    lines = relationship(
        "BankImportLine",
        back_populates="import_job",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_bij_status", "status"),
        Index("ix_bij_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<BankImportJob(id={self.id}, file={self.original_filename}, "
            f"status={self.status})>"
        )


class BankImportLine(Base):
    """은행 원장 개별 라인"""

    __tablename__ = "bank_import_lines"

    # ==================== 기본 키 ====================
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ==================== 작업 연결 ====================
    import_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bank_import_jobs.id", ondelete="CASCADE"),
        nullable=False,
        comment="임포트 작업 ID",
    )
    line_number: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="파일 내 행 번호"
    )

    # ==================== 원본 데이터 ====================
    transaction_date: Mapped[date] = mapped_column(
        Date, nullable=False, comment="거래일"
    )
    description: Mapped[str] = mapped_column(
        String(500), nullable=False, comment="적요/설명"
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, comment="금액 (양수=입금, 음수=출금)"
    )
    balance_after: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True, comment="거래 후 잔액"
    )
    counterparty_name_raw: Mapped[str | None] = mapped_column(
        String(200), nullable=True, comment="원본 거래처명"
    )

    # ==================== 매칭 정보 ====================
    counterparty_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("counterparties.id", ondelete="SET NULL"),
        nullable=True,
        comment="매칭된 거래처 ID",
    )
    status: Mapped[BankImportLineStatus] = mapped_column(
        SQLEnum(BankImportLineStatus, name="bank_import_line_status"),
        default=BankImportLineStatus.UNMATCHED,
        nullable=False,
        comment="라인 상태",
    )
    match_confidence: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True, comment="매칭 신뢰도 (0-100%)"
    )

    # ==================== 중복 감지 ====================
    duplicate_key: Mapped[str | None] = mapped_column(
        String(128), nullable=True,
        comment="중복 감지 키: hash(date+amount+description+bank_ref)",
    )
    bank_reference: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="은행 참조번호"
    )

    # ==================== 확정 연결 ====================
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("counterparty_transactions.id", ondelete="SET NULL"),
        nullable=True,
        comment="확정 후 연결된 Transaction ID",
    )

    # ==================== 원본 보존 ====================
    raw_data: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, comment="원본 행 전체 (JSON)"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    # ==================== 관계 ====================
    import_job = relationship("BankImportJob", back_populates="lines")
    counterparty = relationship("Counterparty")
    transaction = relationship(
        "CounterpartyTransaction", foreign_keys=[transaction_id]
    )

    __table_args__ = (
        Index("ix_bil_import_job", "import_job_id"),
        Index("ix_bil_status", "status"),
        Index("ix_bil_duplicate_key", "duplicate_key"),
        Index("ix_bil_counterparty", "counterparty_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<BankImportLine(job={self.import_job_id}, line={self.line_number}, "
            f"amount={self.amount}, status={self.status})>"
        )
