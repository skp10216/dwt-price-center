"""
통합 에러 처리 모듈

- 구조화된 에러 코드 체계
- DB/시스템 에러 → 사용자 친화적 메시지 자동 변환
- HTTPException 래퍼로 일관된 에러 응답 포맷 제공
"""

from enum import Enum
from typing import Any, Optional

from fastapi import HTTPException


# ============================================================================
# 에러 코드 체계
# ============================================================================

class ErrorCode(str, Enum):
    """
    구조화된 에러 코드.
    프론트엔드에서 코드 기반으로 사용자 메시지를 결정할 수 있도록 체계화.
    """

    # ── 공통 ──
    NOT_FOUND = "NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"

    # ── 동시성 / 충돌 ──
    CONCURRENT_MODIFICATION = "CONCURRENT_MODIFICATION"
    RESOURCE_LOCKED = "RESOURCE_LOCKED"
    OPTIMISTIC_LOCK_FAILED = "OPTIMISTIC_LOCK_FAILED"

    # ── 데이터 정합성 ──
    INTEGRITY_VIOLATION = "INTEGRITY_VIOLATION"
    DUPLICATE_ENTRY = "DUPLICATE_ENTRY"
    REFERENCE_EXISTS = "REFERENCE_EXISTS"

    # ── 비즈니스 로직 ──
    PERIOD_LOCKED = "PERIOD_LOCKED"
    INVALID_STATUS = "INVALID_STATUS"
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE"
    OVER_ALLOCATION = "OVER_ALLOCATION"
    ALREADY_EXISTS = "ALREADY_EXISTS"
    ALREADY_PROCESSED = "ALREADY_PROCESSED"
    COUNTERPARTY_MISMATCH = "COUNTERPARTY_MISMATCH"

    # ── 파일/업로드 ──
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    INVALID_FILE_FORMAT = "INVALID_FILE_FORMAT"
    FILE_PARSE_ERROR = "FILE_PARSE_ERROR"
    FILE_EMPTY = "FILE_EMPTY"


# ============================================================================
# 에러 코드 → 사용자 메시지 매핑 (백엔드 기본 메시지)
# ============================================================================

ERROR_MESSAGES: dict[str, str] = {
    ErrorCode.NOT_FOUND: "요청한 데이터를 찾을 수 없습니다.",
    ErrorCode.VALIDATION_ERROR: "입력값이 올바르지 않습니다.",
    ErrorCode.INTERNAL_ERROR: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    ErrorCode.UNAUTHORIZED: "로그인이 필요합니다.",
    ErrorCode.FORBIDDEN: "접근 권한이 없습니다.",

    ErrorCode.CONCURRENT_MODIFICATION: "다른 사용자가 동시에 같은 데이터를 수정하고 있습니다. 페이지를 새로고침 후 다시 시도해 주세요.",
    ErrorCode.RESOURCE_LOCKED: "다른 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
    ErrorCode.OPTIMISTIC_LOCK_FAILED: "데이터가 변경되었습니다. 최신 정보를 확인 후 다시 시도해 주세요.",

    ErrorCode.INTEGRITY_VIOLATION: "데이터 정합성 오류가 발생했습니다. 관리자에게 문의해 주세요.",
    ErrorCode.DUPLICATE_ENTRY: "이미 존재하는 데이터입니다.",
    ErrorCode.REFERENCE_EXISTS: "연결된 데이터가 있어 삭제할 수 없습니다.",

    ErrorCode.PERIOD_LOCKED: "마감된 기간의 데이터는 변경할 수 없습니다.",
    ErrorCode.INVALID_STATUS: "현재 상태에서는 해당 작업을 수행할 수 없습니다.",
    ErrorCode.INSUFFICIENT_BALANCE: "잔액이 부족합니다.",
    ErrorCode.OVER_ALLOCATION: "배분 금액이 잔여 금액을 초과합니다.",
    ErrorCode.ALREADY_EXISTS: "이미 존재하는 데이터입니다.",
    ErrorCode.ALREADY_PROCESSED: "이미 처리된 데이터입니다.",
    ErrorCode.COUNTERPARTY_MISMATCH: "거래처가 일치하지 않습니다.",

    ErrorCode.FILE_TOO_LARGE: "파일 크기가 너무 큽니다.",
    ErrorCode.INVALID_FILE_FORMAT: "지원하지 않는 파일 형식입니다.",
    ErrorCode.FILE_PARSE_ERROR: "파일을 읽는 중 오류가 발생했습니다.",
    ErrorCode.FILE_EMPTY: "파일이 비어있습니다.",
}


# ============================================================================
# 구조화된 에러 응답
# ============================================================================

class AppError(HTTPException):
    """
    구조화된 에러 응답.
    HTTPException을 상속하여 FastAPI 에러 핸들링과 호환.

    사용 예:
        raise AppError(ErrorCode.CONCURRENT_MODIFICATION)
        raise AppError(ErrorCode.NOT_FOUND, message="전표를 찾을 수 없습니다")
        raise AppError(ErrorCode.OVER_ALLOCATION, details={"remaining": "10000", "requested": "15000"})
    """

    def __init__(
        self,
        code: ErrorCode,
        status_code: Optional[int] = None,
        message: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
    ):
        self.error_code = code
        self.error_message = message or ERROR_MESSAGES.get(code, "오류가 발생했습니다.")
        self.error_details = details

        # 에러 코드 → HTTP 상태 코드 자동 매핑
        if status_code is None:
            status_code = _default_status_code(code)

        # detail을 구조화된 dict로 설정 (exception_handler에서 활용)
        super().__init__(
            status_code=status_code,
            detail={
                "code": code.value,
                "message": self.error_message,
                "details": details,
            }
        )


def _default_status_code(code: ErrorCode) -> int:
    """에러 코드별 기본 HTTP 상태 코드"""
    mapping = {
        ErrorCode.NOT_FOUND: 404,
        ErrorCode.UNAUTHORIZED: 401,
        ErrorCode.FORBIDDEN: 403,
        ErrorCode.VALIDATION_ERROR: 422,

        ErrorCode.CONCURRENT_MODIFICATION: 409,
        ErrorCode.RESOURCE_LOCKED: 423,
        ErrorCode.OPTIMISTIC_LOCK_FAILED: 409,

        ErrorCode.INTEGRITY_VIOLATION: 409,
        ErrorCode.DUPLICATE_ENTRY: 409,
        ErrorCode.REFERENCE_EXISTS: 409,

        ErrorCode.FILE_TOO_LARGE: 413,
    }
    return mapping.get(code, 400)


# ============================================================================
# DB 에러 → 사용자 친화 에러 변환
# ============================================================================

# PostgreSQL 에러 메시지 패턴 → ErrorCode 매핑
_PG_ERROR_PATTERNS: list[tuple[str, ErrorCode]] = [
    ("could not serialize access", ErrorCode.CONCURRENT_MODIFICATION),
    ("deadlock detected", ErrorCode.RESOURCE_LOCKED),
    ("lock timeout", ErrorCode.RESOURCE_LOCKED),
    ("duplicate key value violates unique constraint", ErrorCode.DUPLICATE_ENTRY),
    ("violates foreign key constraint", ErrorCode.REFERENCE_EXISTS),
    ("violates check constraint", ErrorCode.INTEGRITY_VIOLATION),
    ("update or delete on table", ErrorCode.REFERENCE_EXISTS),
]


def classify_db_error(exc: Exception) -> AppError:
    """
    DB 예외를 분석하여 적절한 AppError로 변환.
    원본 에러 메시지는 서버 로그에만 남기고, 사용자에게는 친화적 메시지만 전달.
    """
    error_str = str(exc).lower()

    for pattern, error_code in _PG_ERROR_PATTERNS:
        if pattern in error_str:
            return AppError(error_code)

    # 매칭 안 되는 DB 에러는 일반 서버 오류로 분류
    return AppError(ErrorCode.INTERNAL_ERROR)


def classify_exception(exc: Exception) -> AppError:
    """
    모든 종류의 예외를 AppError로 변환.
    HTTPException/AppError는 그대로 통과.
    """
    if isinstance(exc, AppError):
        return exc
    if isinstance(exc, HTTPException):
        # 기존 HTTPException — detail이 문자열이면 감싸서 반환
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail:
            # 이미 구조화된 에러
            return AppError(
                code=ErrorCode(detail["code"]) if detail["code"] in ErrorCode.__members__.values() else ErrorCode.INTERNAL_ERROR,
                status_code=exc.status_code,
                message=detail.get("message"),
                details=detail.get("details"),
            )
        # 기존 문자열 detail은 그대로 message로 사용
        return AppError(
            code=_guess_error_code(exc.status_code),
            status_code=exc.status_code,
            message=detail if isinstance(detail, str) else str(detail),
        )

    # DB 에러 (SQLAlchemy / asyncpg)
    exc_type = type(exc).__name__
    if exc_type in (
        "SerializationError", "IntegrityError", "OperationalError",
        "DBAPIError", "InternalError", "DataError",
        "SerializationFailureError", "DeadlockDetectedError",
        "UniqueViolationError", "ForeignKeyViolationError",
        "CheckViolationError",
    ):
        return classify_db_error(exc)

    # 기타 예외
    return AppError(ErrorCode.INTERNAL_ERROR)


def _guess_error_code(status_code: int) -> ErrorCode:
    """HTTP 상태 코드에서 에러 코드 추론"""
    mapping = {
        400: ErrorCode.VALIDATION_ERROR,
        401: ErrorCode.UNAUTHORIZED,
        403: ErrorCode.FORBIDDEN,
        404: ErrorCode.NOT_FOUND,
        409: ErrorCode.CONCURRENT_MODIFICATION,
        413: ErrorCode.FILE_TOO_LARGE,
        422: ErrorCode.VALIDATION_ERROR,
        423: ErrorCode.RESOURCE_LOCKED,
    }
    return mapping.get(status_code, ErrorCode.INTERNAL_ERROR)
