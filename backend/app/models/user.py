"""
단가표 통합 관리 시스템 - User 모델
사용자 계정 및 인증 정보
"""

import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import UserRole


class User(Base):
    """사용자 테이블"""
    
    __tablename__ = "users"
    
    # 기본 키
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    # 인증 정보
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
        comment="이메일 (로그인 ID)"
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="해시된 비밀번호"
    )
    
    # 프로필 정보
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="사용자 이름"
    )
    
    # 권한
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, name="user_role"),
        default=UserRole.VIEWER,
        nullable=False,
        comment="역할: admin(관리자), viewer(조회자)"
    )
    
    # 상태
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="활성 상태 (비활성화 시 로그인 불가)"
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
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="마지막 로그인 일시"
    )
    
    # 관계
    audit_logs = relationship("AuditLog", back_populates="user")
    user_lists = relationship("UserList", back_populates="user")
    favorites = relationship("UserFavorite", back_populates="user")
    upload_jobs = relationship("UploadJob", back_populates="created_by_user")
    partner_favorites = relationship("UserPartnerFavorite", back_populates="user")
    counterparty_favorites = relationship("UserCounterpartyFavorite", back_populates="user")
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"
