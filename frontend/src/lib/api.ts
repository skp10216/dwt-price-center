/**
 * 단가표 통합 관리 시스템 - API 클라이언트
 */

import axios, { AxiosError, AxiosInstance } from 'axios';

// API 기본 URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Axios 인스턴스 생성
const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * 쿠키에서 값 읽기 유틸리티
 * 서브도메인 간 전환 시 localStorage에 토큰이 없을 때 쿠키에서 읽기 위함
 */
function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// 요청 인터셉터: 토큰 추가 + FormData Content-Type 자동 처리
api.interceptors.request.use(
  (config) => {
    let token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

    // localStorage에 토큰이 없으면 쿠키에서 읽기 (서브도메인 간 전환 시 대비)
    // 쿠키는 domain=localhost 로 설정되어 서브도메인 간 공유됨
    if (!token) {
      const cookieToken = getCookieValue('token');
      if (cookieToken) {
        token = cookieToken;
        // localStorage에도 동기화하여 이후 요청은 바로 사용
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', cookieToken);
        }
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // FormData 전송 시 Content-Type 삭제 → 브라우저가 boundary 포함하여 자동 설정
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * 쿠키 삭제 유틸리티 (도메인 포함)
 * 서브도메인 간 공유 쿠키를 올바르게 삭제하기 위해 domain 속성 포함
 */
function clearAuthCookies() {
  if (typeof document === 'undefined') return;
  const expired = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname.endsWith('.localhost');
  const domainPart = isLocal ? '; domain=localhost' : '; domain=.dwt.price';
  
  // 도메인 포함 쿠키 삭제 (서브도메인 간 공유 쿠키)
  document.cookie = `token=; ${expired}; path=/${domainPart}`;
  document.cookie = `user_role=; ${expired}; path=/${domainPart}`;
  // 도메인 없이도 삭제 (혹시 도메인 없이 설정된 쿠키 대비)
  document.cookie = `token=; ${expired}; path=/`;
  document.cookie = `user_role=; ${expired}; path=/`;
}

// 응답 인터셉터: 에러 처리
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error: { code: string; message: string } }>) => {
    if (error.response?.status === 401) {
      // 토큰 만료 시 로그아웃 (localStorage + 쿠키 모두 정리)
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('auth-storage'); // Zustand persist 상태 제거
        clearAuthCookies();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// API 응답 타입
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    page_size?: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// API 함수들
export const authApi = {
  login: (email: string, password: string, rememberMe: boolean = false) =>
    api.post<ApiResponse<{ token: { access_token: string; expires_in: number }; user: unknown }>>('/auth/login', { 
      email, 
      password,
      remember_me: rememberMe,
    }),
  
  logout: () => api.post('/auth/logout'),
  
  getMe: () => api.get<ApiResponse<unknown>>('/auth/me'),
  
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/password', { current_password: currentPassword, new_password: newPassword }),
};

// ============================================================================
// 일괄 등록 (Bulk Registration) 타입
// ============================================================================

/** 다중 스토리지 일괄 생성 - 검증 요청 */
export interface BulkStorageValidateRequest {
  device_type: string;
  manufacturer: string;
  series: string;
  model_name: string;
  connectivity: string;
  storage_list: number[];
  model_code_prefix: string;
}

/** JSON 일괄 등록 입력 모델 (model_code 없음, storage_gb 배열) */
export interface JsonBulkModelInput {
  device_type: string;
  manufacturer: string;
  series: string;
  model_name: string;
  storage_gb: number[];  // 배열로 변경 - 각 스토리지별로 개별 모델 생성
  connectivity: string;
  // model_code는 입력하지 않음 (서버 자동 생성)
}

/** JSON 일괄 등록 - 검증 요청 */
export interface JsonBulkValidateRequest {
  models: JsonBulkModelInput[];
}

/** 검증 결과 - 개별 행 */
export interface ValidateRowResult {
  row_index: number;
  model_key: string;    // 불변 모델 키 (동일 기종 공유)
  model_code: string;   // 불변 모델 코드 (model_key + storage)
  full_name: string;
  status: 'valid' | 'error' | 'duplicate';
  error_message: string | null;
  data: Record<string, unknown>;
}

/** 검증 결과 요약 */
export interface BulkValidateSummary {
  by_manufacturer: Record<string, number>;
  by_series: Record<string, number>;
}

/** 일괄 등록 검증 응답 */
export interface BulkValidateResponse {
  validation_id: string;
  total_count: number;
  valid_count: number;
  error_count: number;
  duplicate_count: number;
  preview: ValidateRowResult[];
  summary: BulkValidateSummary;
  expires_at: string;
}

/** 일괄 등록 커밋 응답 */
export interface BulkCommitResponse {
  trace_id: string;
  created_count: number;
  created_models: unknown[];
}

// ============================================================================
// 등급별 가격 일괄 설정 타입
// ============================================================================

/** 등급별 가격 항목 */
export interface GradePriceItem {
  grade_id: string;
  price: number;
}

/** 등급별 가격 일괄 설정 요청 - model_key 기준 */
export interface BulkPriceSetRequest {
  model_key: string;
  prices: GradePriceItem[];
}

/** 등급별 가격 일괄 설정 요청 - 모델 ID 목록 기준 */
export interface BulkPriceSetByIdsRequest {
  model_ids: string[];
  prices: GradePriceItem[];
}

/** 등급별 가격 일괄 설정 응답 */
export interface BulkPriceSetResponse {
  model_key: string | null;
  affected_models: number;
  updated_prices: number;
  model_codes: string[];
}

/** 모델 삭제 응답 */
export interface ModelDeleteResponse {
  deleted_id: string;
  deleted_model_code: string;
  deleted_full_name: string;
  deleted_grade_prices_count: number;
}

/** 모델 일괄 삭제 응답 */
export interface BulkDeleteResponse {
  trace_id: string;
  deleted_count: number;
  deleted_models: Array<{
    model_code: string;
    full_name: string;
    grade_prices_count: number;
  }>;
  total_grade_prices_deleted: number;
  not_found_ids: string[];
}

/** 가격 변경 히스토리 항목 */
export interface PriceHistoryChange {
  grade_id: string;
  old_price: number;
  new_price: number;
  diff: number;
}

/** 가격 변경 히스토리 */
export interface PriceHistoryItem {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  created_at: string;
  description: string | null;
  changes: PriceHistoryChange[];
}

/** 가격 변경 히스토리 응답 */
export interface PriceHistoryResponse {
  model_id: string;
  model_code: string;
  model_name: string;
  history: PriceHistoryItem[];
  total: number;
  page: number;
  page_size: number;
}

/** 삭제된 모델 히스토리 항목 */
export interface DeletedModelHistoryItem {
  id: string;
  trace_id: string | null;
  action: 'single' | 'bulk';
  deleted_at: string;
  deleted_by: {
    user_id: string;
    email: string | null;
    name: string | null;
  };
  model_data?: Record<string, unknown>;
  deleted_count?: number;
  deleted_models?: Array<{ model_code: string; full_name: string }>;
  description: string | null;
}

/** 삭제된 모델 히스토리 응답 */
export interface DeletedHistoryResponse {
  history: DeletedModelHistoryItem[];
  total: number;
  page: number;
  page_size: number;
}

export const ssotModelsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ models: unknown[]; total: number }>>('/ssot-models', { params }),
  
  get: (id: string) =>
    api.get<ApiResponse<unknown>>(`/ssot-models/${id}`),
  
  create: (data: unknown) =>
    api.post<ApiResponse<unknown>>('/ssot-models', data),
  
  update: (id: string, data: unknown) =>
    api.patch<ApiResponse<unknown>>(`/ssot-models/${id}`, data),
  
  updatePrices: (id: string, data: unknown) =>
    api.put<ApiResponse<unknown>>(`/ssot-models/${id}/prices`, data),
  
  // 일괄 등록 API
  /** 다중 스토리지 일괄 생성 - 검증 */
  validateBulkStorage: (data: BulkStorageValidateRequest) =>
    api.post<ApiResponse<BulkValidateResponse>>('/ssot-models/bulk/storage/validate', data),
  
  /** JSON 일괄 등록 - 검증 */
  validateBulkJson: (data: JsonBulkValidateRequest) =>
    api.post<ApiResponse<BulkValidateResponse>>('/ssot-models/bulk/json/validate', data),
  
  /** 일괄 등록 커밋 */
  commitBulk: (validationId: string) =>
    api.post<ApiResponse<BulkCommitResponse>>('/ssot-models/bulk/commit', { validation_id: validationId }),
  
  /** 등급별 가격 일괄 설정 - model_key 기준 */
  setBulkPrices: (data: BulkPriceSetRequest) =>
    api.put<ApiResponse<BulkPriceSetResponse>>('/ssot-models/bulk/prices', data),
  
  /** 등급별 가격 일괄 설정 - 모델 ID 목록 기준 */
  setBulkPricesByIds: (data: BulkPriceSetByIdsRequest) =>
    api.put<ApiResponse<BulkPriceSetResponse>>('/ssot-models/bulk/prices/by-ids', data),
  
  // 삭제 API
  /** 모델 삭제 (단일) - 연관 가격정보도 함께 삭제 */
  delete: (id: string) =>
    api.delete<ApiResponse<ModelDeleteResponse>>(`/ssot-models/${id}`),
  
  /** 모델 일괄 삭제 (POST 사용 - DELETE에서 body 사용은 비표준) */
  deleteBulk: (modelIds: string[]) =>
    api.post<ApiResponse<BulkDeleteResponse>>('/ssot-models/bulk/delete', modelIds),
  
  // 히스토리 API
  /** 모델별 가격 변경 히스토리 조회 */
  getPriceHistory: (modelId: string, params?: { page?: number; page_size?: number }) =>
    api.get<ApiResponse<PriceHistoryResponse>>(`/ssot-models/${modelId}/price-history`, { params }),
  
  /** 삭제된 모델 히스토리 조회 (경로: /history/deleted - /{model_id}와 충돌 방지) */
  getDeletedHistory: (params?: {
    page?: number;
    page_size?: number;
    device_type?: string;
    manufacturer?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
  }) =>
    api.get<ApiResponse<DeletedHistoryResponse>>('/ssot-models/history/deleted', { params }),
};

export const gradesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ grades: unknown[]; total: number }>>('/grades', { params }),
  
  create: (data: unknown) =>
    api.post<ApiResponse<unknown>>('/grades', data),
  
  update: (id: string, data: unknown) =>
    api.patch<ApiResponse<unknown>>(`/grades/${id}`, data),
  
  reorder: (orders: unknown[]) =>
    api.put<ApiResponse<unknown>>('/grades/reorder', orders),
};

export const deductionsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ items: unknown[]; total: number }>>('/deductions', { params }),
  
  create: (data: unknown) =>
    api.post<ApiResponse<unknown>>('/deductions', data),
  
  update: (id: string, data: unknown) =>
    api.patch<ApiResponse<unknown>>(`/deductions/${id}`, data),
  
  createLevel: (itemId: string, data: unknown) =>
    api.post<ApiResponse<unknown>>(`/deductions/${itemId}/levels`, data),
  
  updateLevel: (itemId: string, levelId: string, data: unknown) =>
    api.patch<ApiResponse<unknown>>(`/deductions/${itemId}/levels/${levelId}`, data),
};

export const partnersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ partners: unknown[]; total: number }>>('/partners', { params }),

  get: (id: string) =>
    api.get<ApiResponse<unknown>>(`/partners/${id}`),

  create: (data: unknown) =>
    api.post<ApiResponse<unknown>>('/partners', data),

  update: (id: string, data: unknown) =>
    api.patch<ApiResponse<unknown>>(`/partners/${id}`, data),

  toggleFavorite: (partnerId: string) =>
    api.post<ApiResponse<{ is_favorite: boolean }>>(`/partners/${partnerId}/favorite`),
};

export const uploadsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ jobs: unknown[]; total: number }>>('/uploads', { params }),
  
  get: (id: string) =>
    api.get<ApiResponse<unknown>>(`/uploads/${id}`),
  
  uploadHqExcel: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ApiResponse<unknown>>('/uploads/hq-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  uploadPartner: (file: File, partnerId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('partner_id', partnerId);
    return api.post<ApiResponse<unknown>>('/uploads/partner', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  confirm: (id: string, excludeUnmatched: boolean = true) =>
    api.post<ApiResponse<unknown>>(`/uploads/${id}/confirm`, null, {
      params: { exclude_unmatched: excludeUnmatched },
    }),
  
  apply: (id: string, memo?: string) =>
    api.post<ApiResponse<unknown>>(`/uploads/${id}/apply`, null, {
      params: { memo },
    }),
};

export const hqPricesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ items: unknown[]; total: number }>>('/hq-prices', { params }),
};

export const compareApi = {
  getData: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<unknown>>('/compare', { params }),
  
  getList: () =>
    api.get<ApiResponse<unknown[]>>('/compare/list'),
  
  addToList: (modelIds: string[]) =>
    api.post<ApiResponse<unknown>>('/compare/list/add', { model_ids: modelIds }),
  
  removeFromList: (modelIds: string[]) =>
    api.post<ApiResponse<unknown>>('/compare/list/remove', { model_ids: modelIds }),
};

export const myListsApi = {
  list: () =>
    api.get<ApiResponse<{ lists: unknown[]; total: number }>>('/my-lists'),
  
  get: (id: string) =>
    api.get<ApiResponse<unknown>>(`/my-lists/${id}`),
  
  create: (data: unknown) =>
    api.post<ApiResponse<unknown>>('/my-lists', data),
  
  update: (id: string, data: unknown) =>
    api.patch<ApiResponse<unknown>>(`/my-lists/${id}`, data),
  
  delete: (id: string) =>
    api.delete<ApiResponse<unknown>>(`/my-lists/${id}`),
  
  addItems: (id: string, modelIds: string[]) =>
    api.post<ApiResponse<unknown>>(`/my-lists/${id}/items`, { model_ids: modelIds }),
  
  removeItems: (id: string, modelIds: string[]) =>
    api.delete<ApiResponse<unknown>>(`/my-lists/${id}/items`, { data: { model_ids: modelIds } }),
  
  getFavorites: () =>
    api.get<ApiResponse<{ favorites: unknown[]; total: number }>>('/my-lists/favorites'),
  
  toggleFavorite: (modelId: string) =>
    api.post<ApiResponse<unknown>>('/my-lists/favorites/toggle', { model_id: modelId }),
};

export const auditApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ logs: unknown[]; total: number }>>('/audit-logs', { params }),
  
  get: (id: string) =>
    api.get<ApiResponse<unknown>>(`/audit-logs/${id}`),
  
  getByTrace: (traceId: string) =>
    api.get<ApiResponse<{ logs: unknown[]; total: number }>>(`/audit-logs/trace/${traceId}`),
};

export const usersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ users: unknown[]; total: number }>>('/users', { params }),
  
  get: (id: string) =>
    api.get<ApiResponse<unknown>>(`/users/${id}`),
  
  create: (data: unknown) =>
    api.post<ApiResponse<unknown>>('/users', data),
  
  update: (id: string, data: unknown) =>
    api.patch<ApiResponse<unknown>>(`/users/${id}`, data),
};

// ============================================================================
// 정산 도메인 API (settlement.dwt.price)
// ============================================================================

export const settlementApi = {
  // 대시보드
  getDashboardSummary: () =>
    api.get<ApiResponse<unknown>>('/settlement/dashboard/summary'),

  getTopReceivables: (limit?: number) =>
    api.get<ApiResponse<{ items: unknown[]; total: number }>>('/settlement/dashboard/top-receivables', { params: { limit } }),

  getTopPayables: (limit?: number) =>
    api.get<ApiResponse<{ items: unknown[]; total: number }>>('/settlement/dashboard/top-payables', { params: { limit } }),

  getReceivables: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ receivables: unknown[]; total: number }>>('/settlement/dashboard/receivables', { params }),

  getPayables: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ payables: unknown[]; total: number }>>('/settlement/dashboard/payables', { params }),

  // 전표
  listVouchers: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ vouchers: unknown[]; total: number; page: number; page_size: number }>>('/settlement/vouchers', { params }),

  getVoucher: (id: string) =>
    api.get<ApiResponse<unknown>>(`/settlement/vouchers/${id}`),

  createVoucher: (data: unknown) =>
    api.post<ApiResponse<unknown>>('/settlement/vouchers', data),

  updateVoucher: (id: string, data: unknown) =>
    api.patch<ApiResponse<unknown>>(`/settlement/vouchers/${id}`, data),

  deleteVoucher: (id: string) =>
    api.delete<ApiResponse<unknown>>(`/settlement/vouchers/${id}`),

  batchDeleteVouchers: (voucherIds: string[]) =>
    api.post<ApiResponse<{ deleted_count: number; skipped_count: number; errors: string[] }>>(
      '/settlement/vouchers/batch-delete',
      voucherIds,
    ),

  // 입금
  createReceipt: (voucherId: string, data: unknown) =>
    api.post<ApiResponse<unknown>>(`/settlement/vouchers/${voucherId}/receipts`, data),

  listReceipts: (voucherId: string) =>
    api.get<ApiResponse<unknown[]>>(`/settlement/vouchers/${voucherId}/receipts`),

  deleteReceipt: (voucherId: string, receiptId: string) =>
    api.delete(`/settlement/vouchers/${voucherId}/receipts/${receiptId}`),

  // 송금
  createPayment: (voucherId: string, data: unknown) =>
    api.post<ApiResponse<unknown>>(`/settlement/vouchers/${voucherId}/payments`, data),

  listPayments: (voucherId: string) =>
    api.get<ApiResponse<unknown[]>>(`/settlement/vouchers/${voucherId}/payments`),

  deletePayment: (voucherId: string, paymentId: string) =>
    api.delete(`/settlement/vouchers/${voucherId}/payments/${paymentId}`),

  // 업로드
  uploadSalesExcel: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ApiResponse<unknown>>('/settlement/upload/sales-excel', formData);
  },

  uploadPurchaseExcel: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ApiResponse<unknown>>('/settlement/upload/purchase-excel', formData);
  },

  // 미리보기 검증 (파일 업로드 전 데이터 검증)
  previewUpload: (file: File, type: 'sales' | 'purchase', templateId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (templateId) formData.append('template_id', templateId);
    // FormData 전송 시 Content-Type을 수동 설정하지 않음 → axios가 boundary 자동 포함
    return api.post<ApiResponse<{ rows: unknown[] }>>(`/settlement/upload/${type}/preview`, formData);
  },

  // 전표 Excel 업로드 (판매/매입 통합)
  uploadVoucherExcel: (file: File, type: 'sales' | 'purchase', templateId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (templateId) formData.append('template_id', templateId);
    return api.post<ApiResponse<{ job_id: string; total: number; success: number; error: number }>>(
      `/settlement/upload/${type}-excel`,
      formData,
    );
  },

  listUploadJobs: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ jobs: unknown[]; total: number }>>('/settlement/upload/jobs', { params }),

  getUploadJob: (id: string) =>
    api.get<ApiResponse<unknown>>(`/settlement/upload/jobs/${id}`),

  deleteUploadJob: (id: string) =>
    api.delete<ApiResponse<unknown>>(`/settlement/upload/jobs/${id}`),

  batchDeleteUploadJobs: (jobIds: string[]) =>
    api.post<ApiResponse<{ deleted_count: number; skipped_count: number; errors: string[] }>>(
      '/settlement/upload/jobs/batch-delete',
      jobIds,
    ),

  confirmUploadJob: (id: string, excludeConflicts?: boolean) =>
    api.post<ApiResponse<unknown>>(`/settlement/upload/jobs/${id}/confirm`, null, {
      params: { exclude_conflicts: excludeConflicts },
    }),

  rematchUploadJob: (id: string) =>
    api.post<ApiResponse<{ rematched_count: number; still_unmatched_count: number; still_unmatched: string[] }>>(
      `/settlement/upload/jobs/${id}/rematch`,
    ),

  // 템플릿
  listUploadTemplates: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ templates: unknown[]; total: number }>>('/settlement/upload/templates', { params }),

  createUploadTemplate: (data: unknown) =>
    api.post<ApiResponse<unknown>>('/settlement/upload/templates', data),

  updateUploadTemplate: (id: string, data: unknown) =>
    api.patch<ApiResponse<unknown>>(`/settlement/upload/templates/${id}`, data),

  deleteUploadTemplate: (id: string) =>
    api.delete<ApiResponse<unknown>>(`/settlement/upload/templates/${id}`),

  seedDefaultTemplates: () =>
    api.post<ApiResponse<unknown>>('/settlement/upload/templates/seed'),

  // 검증/승인
  listVoucherChangeRequests: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ changes: unknown[]; total: number }>>('/settlement/verification/changes', { params }),

  approveVoucherChangeRequest: (id: string, reviewMemo?: string) =>
    api.post<ApiResponse<unknown>>(`/settlement/verification/changes/${id}/approve`, { review_memo: reviewMemo }),

  rejectVoucherChangeRequest: (id: string, reviewMemo?: string) =>
    api.post<ApiResponse<unknown>>(`/settlement/verification/changes/${id}/reject`, { review_memo: reviewMemo }),

  listUnmatchedCounterparties: () =>
    api.get<ApiResponse<{ unmatched: unknown[]; total: number }>>('/settlement/verification/unmatched'),

  mapUnmatchedCounterparty: (aliasName: string, data: { counterparty_id?: string; new_counterparty_name?: string }) =>
    api.post<ApiResponse<unknown>>(`/settlement/verification/unmatched/${encodeURIComponent(aliasName)}/map`, data),

  // 거래처
  listCounterparties: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ counterparties: unknown[]; total: number }>>('/settlement/counterparties', { params }),

  getCounterparty: (id: string) =>
    api.get<ApiResponse<unknown>>(`/settlement/counterparties/${id}`),

  createCounterparty: (data: unknown) =>
    api.post<ApiResponse<unknown>>('/settlement/counterparties', data),

  updateCounterparty: (id: string, data: unknown) =>
    api.patch<ApiResponse<unknown>>(`/settlement/counterparties/${id}`, data),

  getCounterpartySummary: (id: string) =>
    api.get<ApiResponse<unknown>>(`/settlement/counterparties/${id}/summary`),

  toggleCounterpartyFavorite: (counterpartyId: string) =>
    api.post<ApiResponse<{ is_favorite: boolean }>>(`/settlement/counterparties/${counterpartyId}/favorite`),

  listAliases: (counterpartyId: string) =>
    api.get<ApiResponse<unknown[]>>(`/settlement/counterparties/${counterpartyId}/aliases`),

  createCounterpartyAlias: (counterpartyId: string, aliasName: string) =>
    api.post<ApiResponse<unknown>>(`/settlement/counterparties/${counterpartyId}/aliases`, { alias_name: aliasName }),

  deleteCounterpartyAlias: (counterpartyId: string, aliasId: string) =>
    api.delete(`/settlement/counterparties/${counterpartyId}/aliases/${aliasId}`),

  deleteCounterparty: (id: string) =>
    api.delete<ApiResponse<{ deleted: boolean; name: string }>>(`/settlement/counterparties/${id}`),

  batchDeleteCounterparties: (ids: string[]) =>
    api.post<ApiResponse<{ deleted_count: number; skipped_count: number; deleted: { id: string; name: string }[]; skipped: { id: string; name: string; reason: string }[] }>>(
      '/settlement/counterparties/batch-delete',
      ids,
    ),

  batchCreateCounterparties: (items: { name: string; counterparty_type?: string }[]) =>
    api.post<ApiResponse<{ created_count: number; skipped_count: number; created: { id: string; name: string }[]; skipped: { name: string; reason: string }[] }>>(
      '/settlement/counterparties/batch-create',
      { items },
    ),

  // 마감
  lockVoucher: (voucherId: string, memo?: string) =>
    api.post<ApiResponse<unknown>>(`/settlement/lock/voucher/${voucherId}`, null, { params: { memo } }),

  unlockVoucher: (voucherId: string, memo?: string) =>
    api.post<ApiResponse<unknown>>(`/settlement/lock/voucher/${voucherId}/unlock`, null, { params: { memo } }),

  batchLock: (data: { voucher_ids: string[]; memo?: string }) =>
    api.post<ApiResponse<unknown>>('/settlement/lock/batch', data),

  batchUnlock: (data: { voucher_ids: string[]; memo?: string }) =>
    api.post<ApiResponse<unknown>>('/settlement/lock/batch-unlock', data),

  getLockHistory: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ history: unknown[]; total: number }>>('/settlement/lock/history', { params }),

  // 월별 마감 관리
  listLocks: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ locks: unknown[] }>>('/settlement/lock', { params }),

  createLock: (yearMonth: string, description?: string) =>
    api.post<ApiResponse<unknown>>(`/settlement/lock/${yearMonth}`, { description }),

  releaseLock: (yearMonth: string, description?: string) =>
    api.delete<ApiResponse<unknown>>(`/settlement/lock/${yearMonth}`, { data: { description } }),

  getLockAuditLogs: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ logs: unknown[] }>>('/settlement/lock/audit-logs', { params }),

  // 작업 내역
  listActivityLogs: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ logs: unknown[]; total: number; page: number; page_size: number }>>('/settlement/activity', { params }),
  listTraceActivityLogs: (traceId: string) =>
    api.get<ApiResponse<{ logs: unknown[]; total: number }>>(`/settlement/activity/trace/${traceId}`),
};

export default api;
