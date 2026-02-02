"""
단가표 통합 관리 시스템 - SSOT Model (단일 기준 모델)
모든 가격/비교/업로드/매핑의 기준이 되는 모델
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime, Enum as SQLEnum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import DeviceType, Manufacturer, Connectivity


class SSOTModel(Base):
    """SSOT 모델 테이블 - 단일 기준 모델"""
    
    __tablename__ = "ssot_models"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 모델 코드 (본사 업로드 1차 매칭 키) - 고유값
    model_code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
        comment="모델 코드 (본사 업로드 매칭 키)"
    )
    
    # 분류 정보
    device_type: Mapped[DeviceType] = mapped_column(
        SQLEnum(DeviceType, name="device_type"),
        nullable=False,
        comment="기기 타입: smartphone, tablet, wearable"
    )
    manufacturer: Mapped[Manufacturer] = mapped_column(
        SQLEnum(Manufacturer, name="manufacturer"),
        nullable=False,
        comment="제조사: apple, samsung, other"
    )
    
    # 모델 정보
    series: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="시리즈 (예: iPhone 15, Galaxy S24)"
    )
    model_name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="모델명 (예: iPhone 15 Pro Max)"
    )
    storage_gb: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="스토리지 용량 (GB 단위, 1TB=1024)"
    )
    
    # 연결성 (기기 타입에 따라 고정 또는 선택)
    connectivity: Mapped[Connectivity] = mapped_column(
        SQLEnum(Connectivity, name="connectivity"),
        nullable=False,
        comment="연결성: lte(스마트폰), wifi/wifi_cellular(태블릿), standard(웨어러블)"
    )
    
    # 상태
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="활성 상태 (비활성화 시 Viewer 화면에서 숨김)"
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
        comment="수정 일시"
    )
    
    # 관계
    grade_prices = relationship("GradePrice", back_populates="model", cascade="all, delete-orphan")
    partner_prices = relationship("PartnerPrice", back_populates="model")
    partner_mappings = relationship("PartnerMapping", back_populates="model")
    user_list_items = relationship("UserListItem", back_populates="model")
    favorites = relationship("UserFavorite", back_populates="model")
    compare_list_models = relationship("CompareListModel", back_populates="model")
    
    # 인덱스 (복합)
    __table_args__ = (
        Index("ix_ssot_models_type_manufacturer", "device_type", "manufacturer"),
        Index("ix_ssot_models_series", "series"),
    )
    
    @property
    def storage_display(self) -> str:
        """스토리지 표시용 문자열 (예: 256GB, 1TB)"""
        if self.storage_gb >= 1024:
            return f"{self.storage_gb // 1024}TB"
        return f"{self.storage_gb}GB"
    
    @property
    def full_name(self) -> str:
        """전체 모델명 (예: iPhone 15 Pro Max 256GB)"""
        return f"{self.model_name} {self.storage_display}"
    
    def __repr__(self) -> str:
        return f"<SSOTModel(id={self.id}, code={self.model_code}, name={self.full_name})>"
