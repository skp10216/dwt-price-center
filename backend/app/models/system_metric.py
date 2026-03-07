"""
시스템 메트릭 히스토리 모델
시스템 헬스 체크 시 수집된 메트릭을 저장하여 추세 분석에 활용
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SystemMetric(Base):
    """시스템 메트릭 스냅샷"""

    __tablename__ = "system_metrics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    checked_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, index=True,
        comment="수집 시각"
    )
    metric_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="health_snapshot",
        comment="메트릭 유형"
    )
    data: Mapped[dict] = mapped_column(
        JSONB, nullable=False, comment="수집된 메트릭 데이터"
    )

    def __repr__(self) -> str:
        return f"<SystemMetric(checked_at={self.checked_at}, type={self.metric_type})>"
