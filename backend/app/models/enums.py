"""
단가표 통합 관리 시스템 - 공통 Enum 정의
프론트엔드와 백엔드에서 동일한 의미로 사용되어야 함
"""

import enum


class UserRole(str, enum.Enum):
    """사용자 역할"""
    ADMIN = "admin"     # 관리자: 모든 기능 접근 가능
    VIEWER = "viewer"   # 조회자: 조회/비교/개인 리스트만 가능


class DeviceType(str, enum.Enum):
    """기기 타입"""
    SMARTPHONE = "smartphone"   # 스마트폰
    TABLET = "tablet"           # 태블릿
    WEARABLE = "wearable"       # 웨어러블


class Manufacturer(str, enum.Enum):
    """제조사"""
    APPLE = "apple"     # 애플
    SAMSUNG = "samsung" # 삼성
    OTHER = "other"     # 기타


class Connectivity(str, enum.Enum):
    """연결성 - 기기 타입에 따라 고정 또는 선택"""
    LTE = "lte"                     # 스마트폰: LTE 고정
    WIFI = "wifi"                   # 태블릿: WiFi
    WIFI_CELLULAR = "wifi_cellular" # 태블릿: WiFi+Cellular
    STANDARD = "standard"           # 웨어러블: Standard 고정


class JobType(str, enum.Enum):
    """업로드 작업 타입"""
    HQ_EXCEL = "hq_excel"           # 본사 엑셀 업로드
    PARTNER_EXCEL = "partner_excel" # 거래처 엑셀 업로드
    PARTNER_IMAGE = "partner_image" # 거래처 이미지 업로드


class JobStatus(str, enum.Enum):
    """작업 상태"""
    QUEUED = "queued"       # 대기 중
    RUNNING = "running"     # 실행 중
    SUCCEEDED = "succeeded" # 성공
    FAILED = "failed"       # 실패


class AuditAction(str, enum.Enum):
    """감사로그 액션 타입"""
    # 모델 관련
    MODEL_CREATE = "model_create"
    MODEL_UPDATE = "model_update"
    MODEL_DEACTIVATE = "model_deactivate"
    
    # 등급 관련
    GRADE_CREATE = "grade_create"
    GRADE_UPDATE = "grade_update"
    GRADE_DEACTIVATE = "grade_deactivate"
    
    # 가격 관련
    PRICE_UPDATE = "price_update"
    
    # 차감 관련
    DEDUCTION_CREATE = "deduction_create"
    DEDUCTION_UPDATE = "deduction_update"
    DEDUCTION_DEACTIVATE = "deduction_deactivate"
    
    # 업로드 관련
    UPLOAD_START = "upload_start"
    UPLOAD_COMPLETE = "upload_complete"
    UPLOAD_REVIEW = "upload_review"
    UPLOAD_CONFIRM = "upload_confirm"
    UPLOAD_APPLY = "upload_apply"
    
    # 거래처 관련
    PARTNER_CREATE = "partner_create"
    PARTNER_UPDATE = "partner_update"
    PARTNER_DEACTIVATE = "partner_deactivate"
    PARTNER_MAPPING_UPDATE = "partner_mapping_update"
    
    # 사용자 관련
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_DEACTIVATE = "user_deactivate"
    USER_ROLE_CHANGE = "user_role_change"
    
    # 인증 관련
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
