"""
단가표 통합 관리 시스템 - UserList 모델
사용자 개인 리스트 (즐겨찾기/컬렉션)
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserList(Base):
    """사용자 리스트 테이블 (컬렉션)"""
    
    __tablename__ = "user_lists"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 외래 키
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="사용자 ID"
    )
    
    # 리스트 정보
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="리스트 이름 (예: 아이폰 라인업, 갤럭시 A급)"
    )
    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="리스트 설명"
    )
    
    # 기본값 여부
    is_default: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="기본 리스트 여부 (로그인 시 기본으로 열릴 리스트)"
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
    user = relationship("User", back_populates="user_lists")
    items = relationship("UserListItem", back_populates="list", cascade="all, delete-orphan")
    
    # 인덱스
    __table_args__ = (
        Index("ix_user_lists_user", "user_id"),
        Index("ix_user_lists_user_name", "user_id", "name", unique=True),
    )
    
    def __repr__(self) -> str:
        return f"<UserList(id={self.id}, name={self.name})>"


class UserListItem(Base):
    """사용자 리스트 항목 테이블"""
    
    __tablename__ = "user_list_items"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 외래 키
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_lists.id", ondelete="CASCADE"),
        nullable=False,
        comment="리스트 ID"
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ssot_models.id", ondelete="CASCADE"),
        nullable=False,
        comment="SSOT 모델 ID"
    )
    
    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="추가 일시"
    )
    
    # 관계
    list = relationship("UserList", back_populates="items")
    model = relationship("SSOTModel", back_populates="user_list_items")
    
    # 인덱스 (복합 유니크)
    __table_args__ = (
        Index("ix_user_list_items_list_model", "list_id", "model_id", unique=True),
    )
    
    def __repr__(self) -> str:
        return f"<UserListItem(list_id={self.list_id}, model_id={self.model_id})>"


class UserFavorite(Base):
    """사용자 즐겨찾기 테이블 (빠른 별표 토글)"""
    
    __tablename__ = "user_favorites"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 외래 키
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="사용자 ID"
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ssot_models.id", ondelete="CASCADE"),
        nullable=False,
        comment="SSOT 모델 ID"
    )
    
    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="즐겨찾기 추가 일시"
    )
    
    # 관계
    user = relationship("User", back_populates="favorites")
    model = relationship("SSOTModel", back_populates="favorites")
    
    # 인덱스 (복합 유니크)
    __table_args__ = (
        Index("ix_user_favorites_user_model", "user_id", "model_id", unique=True),
    )
    
    def __repr__(self) -> str:
        return f"<UserFavorite(user_id={self.user_id}, model_id={self.model_id})>"
