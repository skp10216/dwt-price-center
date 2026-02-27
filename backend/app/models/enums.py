"""
단가표 통합 관리 시스템 - 공통 Enum 정의
프론트엔드와 백엔드에서 동일한 의미로 사용되어야 함
"""

import enum


class UserRole(str, enum.Enum):
    """사용자 역할"""
    ADMIN = "admin"           # 관리자: 모든 기능 접근 가능
    VIEWER = "viewer"         # 조회자: 조회/비교/개인 리스트만 가능
    SETTLEMENT = "settlement" # 경영지원본부: 정산 관리 전용


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


# ============================================================================
# 정산 도메인 Enum (settlement.dwt.price)
# ============================================================================

class CounterpartyType(str, enum.Enum):
    """거래처 타입"""
    SELLER = "seller"   # 판매처 (우리가 판매하는 곳 → 미수 발생)
    BUYER = "buyer"     # 매입처 (우리가 매입하는 곳 → 미지급 발생)
    BOTH = "both"       # 양쪽 역할


class VoucherType(str, enum.Enum):
    """전표 타입"""
    SALES = "sales"       # 판매 전표 (우리가 팔았음 → 미수)
    PURCHASE = "purchase" # 매입 전표 (우리가 샀음 → 미지급)


class SettlementStatus(str, enum.Enum):
    """정산 상태 (입금/수금 관점 - 판매 전표)"""
    OPEN = "open"           # 미정산
    SETTLING = "settling"   # 정산중 (부분 입금)
    SETTLED = "settled"     # 정산완료 (전액 입금)
    LOCKED = "locked"       # 마감


class PaymentStatus(str, enum.Enum):
    """지급 상태 (송금/지급 관점 - 매입 전표)"""
    UNPAID = "unpaid"   # 미지급
    PARTIAL = "partial" # 부분지급
    PAID = "paid"       # 지급완료 (전액 송금)
    LOCKED = "locked"   # 마감


class ChangeRequestStatus(str, enum.Enum):
    """변경 요청 상태"""
    PENDING = "pending"     # 대기
    APPROVED = "approved"   # 승인
    REJECTED = "rejected"   # 거부


class TransactionType(str, enum.Enum):
    """거래처 입출금 이벤트 타입"""
    DEPOSIT = "deposit"         # 입금 (거래처로부터 수금)
    WITHDRAWAL = "withdrawal"   # 출금 (거래처에 송금)


class TransactionSource(str, enum.Enum):
    """거래 발생 소스"""
    MANUAL = "manual"           # 수동 등록
    BANK_IMPORT = "bank_import" # 은행 파일 임포트
    NETTING = "netting"         # 상계 처리로 자동 생성


class TransactionStatus(str, enum.Enum):
    """거래 상태 (배분 진행도)"""
    PENDING = "pending"         # 미배분
    PARTIAL = "partial"         # 부분 배분
    ALLOCATED = "allocated"     # 전액 배분 완료
    ON_HOLD = "on_hold"         # 보류 (수동, 사유 필수)
    HIDDEN = "hidden"           # 숨김 (삭제 대체, 기본 미표시)
    CANCELLED = "cancelled"     # 취소됨


class NettingStatus(str, enum.Enum):
    """상계 상태"""
    DRAFT = "draft"             # 초안 (검토 전)
    CONFIRMED = "confirmed"     # 확정
    CANCELLED = "cancelled"     # 취소


class AdjustmentType(str, enum.Enum):
    """조정 전표 타입"""
    CORRECTION = "correction"   # 수정
    RETURN = "return_"          # 반품
    WRITE_OFF = "write_off"     # 대손 처리
    DISCOUNT = "discount"       # 할인/감액


class BankImportLineStatus(str, enum.Enum):
    """은행 임포트 라인 상태"""
    UNMATCHED = "unmatched"     # 미매칭
    MATCHED = "matched"         # 거래처 매칭됨
    CONFIRMED = "confirmed"     # 확정 (Transaction 생성됨)
    DUPLICATE = "duplicate"     # 중복 감지됨
    EXCLUDED = "excluded"       # 제외됨


class BankImportJobStatus(str, enum.Enum):
    """은행 임포트 작업 상태"""
    UPLOADED = "uploaded"       # 업로드됨
    PARSED = "parsed"           # 파싱 완료
    REVIEWING = "reviewing"     # 검토 중
    CONFIRMED = "confirmed"     # 확정 완료
    FAILED = "failed"           # 실패


class PeriodLockStatus(str, enum.Enum):
    """기간 마감 상태"""
    OPEN = "open"               # 열림
    LOCKED = "locked"           # 마감
    ADJUSTING = "adjusting"     # 조정 중 (마감 후 조정전표만 허용)


# ============================================================================
# 기존 Enum 확장
# ============================================================================

class JobType(str, enum.Enum):
    """업로드 작업 타입"""
    HQ_EXCEL = "hq_excel"           # 본사 엑셀 업로드
    PARTNER_EXCEL = "partner_excel" # 거래처 엑셀 업로드
    PARTNER_IMAGE = "partner_image" # 거래처 이미지 업로드
    # 정산 도메인 추가
    VOUCHER_SALES_EXCEL = "voucher_sales_excel"       # UPM 판매 전표 업로드
    VOUCHER_PURCHASE_EXCEL = "voucher_purchase_excel" # UPM 매입 전표 업로드


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
    MODEL_BULK_CREATE = "model_bulk_create"
    MODEL_DELETE = "model_delete"
    MODEL_BULK_DELETE = "model_bulk_delete"
    
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
    UPLOAD_DELETE = "upload_delete"
    
    # 거래처 관련 (기존 단가표)
    PARTNER_CREATE = "partner_create"
    PARTNER_UPDATE = "partner_update"
    PARTNER_DEACTIVATE = "partner_deactivate"
    PARTNER_MAPPING_UPDATE = "partner_mapping_update"
    PARTNER_DELETE = "partner_delete"
    PARTNER_RESTORE = "partner_restore"
    PARTNER_MOVE = "partner_move"

    # 지사 관련
    BRANCH_CREATE = "branch_create"
    BRANCH_UPDATE = "branch_update"
    BRANCH_DELETE = "branch_delete"
    BRANCH_RESTORE = "branch_restore"
    
    # 사용자 관련
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_DEACTIVATE = "user_deactivate"
    USER_ROLE_CHANGE = "user_role_change"
    
    # 인증 관련
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    
    # ========== 정산 도메인 액션 ==========
    # 전표 관련
    VOUCHER_CREATE = "voucher_create"
    VOUCHER_UPDATE = "voucher_update"
    VOUCHER_DELETE = "voucher_delete"
    VOUCHER_UPSERT = "voucher_upsert"
    VOUCHER_LOCK = "voucher_lock"
    VOUCHER_UNLOCK = "voucher_unlock"
    VOUCHER_BATCH_LOCK = "voucher_batch_lock"
    VOUCHER_BATCH_UNLOCK = "voucher_batch_unlock"
    
    # 입금(수금) 관련
    RECEIPT_CREATE = "receipt_create"
    RECEIPT_DELETE = "receipt_delete"
    
    # 송금(지급) 관련
    PAYMENT_CREATE = "payment_create"
    PAYMENT_DELETE = "payment_delete"
    
    # 거래처 관련 (정산)
    COUNTERPARTY_CREATE = "counterparty_create"
    COUNTERPARTY_UPDATE = "counterparty_update"
    COUNTERPARTY_DELETE = "counterparty_delete"
    COUNTERPARTY_BATCH_DELETE = "counterparty_batch_delete"
    COUNTERPARTY_BATCH_CREATE = "counterparty_batch_create"
    COUNTERPARTY_ALIAS_CREATE = "counterparty_alias_create"
    COUNTERPARTY_ALIAS_DELETE = "counterparty_alias_delete"
    
    # 변경 감지/승인 관련
    VOUCHER_CHANGE_DETECTED = "voucher_change_detected"
    VOUCHER_CHANGE_APPROVED = "voucher_change_approved"
    VOUCHER_CHANGE_REJECTED = "voucher_change_rejected"
    
    # 업로드 템플릿 관련
    UPLOAD_TEMPLATE_CREATE = "upload_template_create"
    UPLOAD_TEMPLATE_UPDATE = "upload_template_update"

    # ========== 입출금/배분/상계/은행임포트 액션 ==========
    # 거래처 입출금 이벤트
    TRANSACTION_CREATE = "transaction_create"
    TRANSACTION_UPDATE = "transaction_update"
    TRANSACTION_CANCEL = "transaction_cancel"

    TRANSACTION_HOLD = "transaction_hold"
    TRANSACTION_UNHOLD = "transaction_unhold"
    TRANSACTION_HIDE = "transaction_hide"
    TRANSACTION_UNHIDE = "transaction_unhide"

    # 배분
    ALLOCATION_CREATE = "allocation_create"
    ALLOCATION_DELETE = "allocation_delete"
    ALLOCATION_AUTO = "allocation_auto"

    # 상계
    NETTING_CREATE = "netting_create"
    NETTING_CONFIRM = "netting_confirm"
    NETTING_CANCEL = "netting_cancel"

    # 조정전표
    ADJUSTMENT_VOUCHER_CREATE = "adjustment_voucher_create"

    # 은행 임포트
    BANK_IMPORT_UPLOAD = "bank_import_upload"
    BANK_IMPORT_CONFIRM = "bank_import_confirm"

    # 기간 마감 (신규)
    PERIOD_LOCK = "period_lock"
    PERIOD_UNLOCK = "period_unlock"
    PERIOD_ADJUST = "period_adjust"
