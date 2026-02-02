"""
단가표 통합 관리 시스템 - 인증 API
로그인, 로그아웃, 토큰 갱신
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.config import settings
from app.api.deps import get_current_user
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    TokenResponse,
    UserInfo,
    ChangePasswordRequest,
)
from app.schemas.common import SuccessResponse

router = APIRouter()


@router.post("/login", response_model=SuccessResponse[LoginResponse])
async def login(
    request: Request,
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    로그인
    
    - 이메일/비밀번호로 인증
    - JWT 액세스 토큰 발급
    """
    # 사용자 조회
    result = await db.execute(
        select(User).where(User.email == login_data.email)
    )
    user = result.scalar_one_or_none()
    
    if user is None or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "이메일 또는 비밀번호가 올바르지 않습니다"}
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_INACTIVE", "message": "비활성화된 계정입니다"}
        )
    
    # 토큰 생성
    access_token = create_access_token(
        subject=str(user.id),
        role=user.role.value
    )
    
    # 마지막 로그인 시간 업데이트
    user.last_login_at = datetime.utcnow()
    
    # 감사로그 기록 (선택사항)
    audit_log = AuditLog(
        user_id=user.id,
        action=AuditAction.USER_LOGIN,
        target_type="user",
        target_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(user)
    
    return SuccessResponse(
        data=LoginResponse(
            token=TokenResponse(
                access_token=access_token,
                token_type="bearer",
                expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
            ),
            user=UserInfo.model_validate(user)
        )
    )


@router.post("/logout", response_model=SuccessResponse[dict])
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    로그아웃
    
    - 클라이언트에서 토큰 삭제 필요
    - 서버에서는 감사로그만 기록
    """
    # 감사로그 기록 (선택사항)
    audit_log = AuditLog(
        user_id=current_user.id,
        action=AuditAction.USER_LOGOUT,
        target_type="user",
        target_id=current_user.id,
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit_log)
    await db.commit()
    
    return SuccessResponse(data={"message": "로그아웃되었습니다"})


@router.get("/me", response_model=SuccessResponse[UserInfo])
async def get_me(
    current_user: User = Depends(get_current_user)
):
    """현재 로그인한 사용자 정보 조회"""
    return SuccessResponse(data=UserInfo.model_validate(current_user))


@router.put("/password", response_model=SuccessResponse[dict])
async def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """비밀번호 변경"""
    from app.core.security import get_password_hash
    
    # 현재 비밀번호 확인
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PASSWORD", "message": "현재 비밀번호가 올바르지 않습니다"}
        )
    
    # 새 비밀번호 설정
    current_user.password_hash = get_password_hash(password_data.new_password)
    await db.commit()
    
    return SuccessResponse(data={"message": "비밀번호가 변경되었습니다"})
