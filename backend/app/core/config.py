"""
단가표 통합 관리 시스템 - 설정 관리
환경 변수를 기반으로 애플리케이션 설정을 관리합니다.
"""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """애플리케이션 설정"""
    
    # 앱 기본 정보
    APP_NAME: str = "단가표 통합 관리 시스템"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # 데이터베이스 설정
    DATABASE_URL: str = "postgresql+asyncpg://dwt_user:dwt_password@localhost:5432/dwt_price_center"
    
    # Redis 설정
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # JWT 인증 설정
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24시간 (기본)
    REMEMBER_ME_EXPIRE_DAYS: int = 30  # 아이디 저장 시 30일
    
    # CORS 설정 - 두 도메인 화이트리스트
    # 사용자 도메인: dwt.price, 관리자 도메인: admin.dwt.price
    CORS_ORIGINS: str = "http://localhost:3000,https://dwt.price,https://admin.dwt.price"
    
    # 도메인 설정
    USER_DOMAIN: str = "dwt.price"
    ADMIN_DOMAIN: str = "admin.dwt.price"
    SETTLEMENT_DOMAIN: str = "settlement.dwt.price"
    
    # 초기 관리자 계정
    ADMIN_EMAIL: str = "admin@example.com"
    ADMIN_PASSWORD: str = "admin_password"
    
    # 파일 업로드 설정
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50MB
    
    @property
    def cors_origins_list(self) -> List[str]:
        """CORS 허용 도메인 리스트 반환"""
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
        # 개발 환경 추가
        dev_origins = [
            "http://localhost:3000",
            "http://admin.localhost:3000",
            "http://settlement.localhost:3000",
            "http://127.0.0.1:3000",
        ]
        return list(set(origins + dev_origins))
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """설정 싱글톤 인스턴스 반환 (캐시됨)"""
    return Settings()


settings = get_settings()
