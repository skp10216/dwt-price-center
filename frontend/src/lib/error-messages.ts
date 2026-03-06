/**
 * 통합 에러 메시지 처리 유틸리티
 *
 * 백엔드 에러 코드 → 사용자 친화적 메시지 변환.
 * 모든 API 에러 응답을 중앙에서 관리하여 일관된 사용자 경험 제공.
 */

// ── 에러 코드별 사용자 메시지 ──

const ERROR_CODE_MESSAGES: Record<string, string> = {
  // 공통
  NOT_FOUND: '요청한 데이터를 찾을 수 없습니다.',
  VALIDATION_ERROR: '입력값이 올바르지 않습니다. 다시 확인해 주세요.',
  INTERNAL_ERROR: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '접근 권한이 없습니다.',

  // 동시성 / 충돌
  CONCURRENT_MODIFICATION:
    '다른 사용자가 동시에 같은 데이터를 수정하고 있습니다. 페이지를 새로고침 후 다시 시도해 주세요.',
  RESOURCE_LOCKED:
    '다른 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.',
  OPTIMISTIC_LOCK_FAILED:
    '데이터가 변경되었습니다. 최신 정보를 확인 후 다시 시도해 주세요.',

  // 데이터 정합성
  INTEGRITY_VIOLATION:
    '데이터 정합성 오류가 발생했습니다. 관리자에게 문의해 주세요.',
  DUPLICATE_ENTRY: '이미 존재하는 데이터입니다.',
  REFERENCE_EXISTS: '연결된 데이터가 있어 처리할 수 없습니다.',

  // 비즈니스 로직
  PERIOD_LOCKED: '마감된 기간의 데이터는 변경할 수 없습니다.',
  INVALID_STATUS: '현재 상태에서는 해당 작업을 수행할 수 없습니다.',
  INSUFFICIENT_BALANCE: '잔액이 부족합니다.',
  OVER_ALLOCATION: '배분 금액이 잔여 금액을 초과합니다.',
  ALREADY_EXISTS: '이미 존재하는 데이터입니다.',
  ALREADY_PROCESSED: '이미 처리된 데이터입니다.',
  COUNTERPARTY_MISMATCH: '거래처가 일치하지 않습니다.',

  // 파일
  FILE_TOO_LARGE: '파일 크기가 너무 큽니다.',
  INVALID_FILE_FORMAT: '지원하지 않는 파일 형식입니다.',
  FILE_PARSE_ERROR: '파일을 읽는 중 오류가 발생했습니다.',
  FILE_EMPTY: '파일이 비어있습니다.',
};

// ── HTTP 상태 코드별 기본 메시지 (에러 코드 없을 때 폴백) ──

const STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  400: '요청을 처리할 수 없습니다.',
  401: '로그인이 필요합니다.',
  403: '접근 권한이 없습니다.',
  404: '요청한 데이터를 찾을 수 없습니다.',
  409: '데이터가 변경되었습니다. 새로고침 후 다시 시도해 주세요.',
  413: '파일 크기가 너무 큽니다.',
  422: '입력값을 확인해 주세요.',
  423: '다른 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.',
  429: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  500: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  502: '서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  503: '서비스가 일시적으로 이용 불가합니다. 잠시 후 다시 시도해 주세요.',
};

// ── 에러 코드별 Snackbar variant ──

type SnackbarVariant = 'error' | 'warning' | 'info';

const ERROR_CODE_VARIANTS: Record<string, SnackbarVariant> = {
  CONCURRENT_MODIFICATION: 'warning',
  OPTIMISTIC_LOCK_FAILED: 'warning',
  RESOURCE_LOCKED: 'warning',
};

// ── 타입 정의 ──

interface StructuredError {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

interface AxiosLikeError {
  response?: {
    status?: number;
    data?: {
      error?: StructuredError;
      detail?: StructuredError | string;
    };
  };
  message?: string;
}

export interface ParsedError {
  /** 사용자에게 보여줄 메시지 */
  message: string;
  /** 에러 코드 (있을 때) */
  code: string | null;
  /** HTTP 상태 코드 */
  status: number | null;
  /** Snackbar variant */
  variant: SnackbarVariant;
  /** 동시성 충돌 여부 (새로고침 안내가 필요한지) */
  isConflict: boolean;
}

// ── 핵심 함수 ──

/**
 * API 에러를 파싱하여 사용자 친화적 메시지로 변환.
 *
 * 우선순위:
 * 1. 구조화된 에러 코드 (error.code) → 코드별 매핑 메시지
 * 2. 구조화된 에러 메시지 (error.message) → 백엔드 한국어 메시지
 * 3. detail 문자열 → 기존 호환
 * 4. HTTP 상태 코드 → 폴백 메시지
 * 5. 최종 폴백 → "오류가 발생했습니다"
 *
 * @param error Axios 에러 또는 unknown 에러
 * @param fallbackMessage 폴백 메시지 (기본: "오류가 발생했습니다.")
 */
export function parseApiError(
  error: unknown,
  fallbackMessage = '오류가 발생했습니다.'
): ParsedError {
  const axiosErr = error as AxiosLikeError;
  const status = axiosErr?.response?.status ?? null;
  const data = axiosErr?.response?.data;

  // 1) 구조화된 에러 (error 필드)
  const structuredError = data?.error;
  if (structuredError && typeof structuredError === 'object' && structuredError.code) {
    const code = structuredError.code;
    // 에러 코드 매핑 메시지 > 백엔드 메시지 > 폴백
    const message =
      ERROR_CODE_MESSAGES[code] ?? structuredError.message ?? fallbackMessage;
    const variant = ERROR_CODE_VARIANTS[code] ?? 'error';
    const isConflict = [
      'CONCURRENT_MODIFICATION',
      'OPTIMISTIC_LOCK_FAILED',
      'RESOURCE_LOCKED',
    ].includes(code);

    return { message, code, status, variant, isConflict };
  }

  // 2) FastAPI detail (구조화 또는 문자열)
  const detail = data?.detail;
  if (detail) {
    if (typeof detail === 'object' && 'code' in detail && 'message' in detail) {
      const code = (detail as StructuredError).code;
      const message =
        ERROR_CODE_MESSAGES[code] ?? (detail as StructuredError).message ?? fallbackMessage;
      const variant = ERROR_CODE_VARIANTS[code] ?? 'error';
      const isConflict = [
        'CONCURRENT_MODIFICATION',
        'OPTIMISTIC_LOCK_FAILED',
      ].includes(code);
      return { message, code, status, variant, isConflict };
    }
    if (typeof detail === 'string') {
      // 시스템 에러 패턴 감지 — 사용자에게 노출하지 않음
      if (isSystemError(detail)) {
        return {
          message: STATUS_FALLBACK_MESSAGES[status ?? 500] ?? fallbackMessage,
          code: null,
          status,
          variant: 'error',
          isConflict: false,
        };
      }
      return {
        message: detail,
        code: null,
        status,
        variant: status === 409 ? 'warning' : 'error',
        isConflict: status === 409,
      };
    }
  }

  // 3) HTTP 상태 코드 폴백
  if (status) {
    return {
      message: STATUS_FALLBACK_MESSAGES[status] ?? fallbackMessage,
      code: null,
      status,
      variant: status === 409 ? 'warning' : 'error',
      isConflict: status === 409,
    };
  }

  // 4) 네트워크 에러 등
  if (axiosErr?.message === 'Network Error') {
    return {
      message: '네트워크 연결을 확인해 주세요.',
      code: null,
      status: null,
      variant: 'error',
      isConflict: false,
    };
  }

  // 5) 최종 폴백
  return {
    message: fallbackMessage,
    code: null,
    status: null,
    variant: 'error',
    isConflict: false,
  };
}

/**
 * API 에러에서 사용자 메시지만 추출 (간편 버전).
 * 기존 코드 호환용.
 *
 * @example
 * catch (err) {
 *   enqueueSnackbar(getErrorMessage(err, '저장에 실패했습니다'), { variant: 'error' });
 * }
 */
export function getErrorMessage(error: unknown, fallbackMessage?: string): string {
  return parseApiError(error, fallbackMessage).message;
}

/**
 * API 에러의 variant를 반환 (Snackbar에 사용).
 */
export function getErrorVariant(error: unknown): SnackbarVariant {
  return parseApiError(error).variant;
}

// ── 내부 유틸리티 ──

/** 시스템 에러 패턴 감지 — 사용자에게 노출하면 안 되는 메시지 */
function isSystemError(message: string): boolean {
  const patterns = [
    'could not serialize',
    'deadlock detected',
    'lock timeout',
    'duplicate key value',
    'violates foreign key',
    'violates check constraint',
    'update or delete on table',
    'connection refused',
    'connection reset',
    'timeout expired',
    'internal server error',
    'traceback',
    'sqlalchemy',
    'asyncpg',
    'psycopg',
    'operationalerror',
    'integrityerror',
  ];
  const lower = message.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}
