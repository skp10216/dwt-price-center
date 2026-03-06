"""
시나리오 테스트 데이터 레지스트리
테스트에서 생성한 루트 엔티티(거래처, 법인, 은행임포트 등)의 ID를 추적하여
초기화 시 테스트 데이터만 선별 삭제할 수 있도록 함
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScenarioTestRecord(Base):
    """시나리오 테스트에서 생성한 엔티티 레지스트리"""

    __tablename__ = "scenario_test_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    table_name: Mapped[str] = mapped_column(
        String(100), nullable=False, comment="테이블명 (counterparties, corporate_entities 등)"
    )
    record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, comment="해당 테이블의 레코드 ID"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, comment="등록 시각"
    )

    __table_args__ = (
        Index("ix_scenario_test_records_table_name", "table_name"),
    )
