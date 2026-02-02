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

// 요청 인터셉터: 토큰 추가
api.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 응답 인터셉터: 에러 처리
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error: { code: string; message: string } }>) => {
    if (error.response?.status === 401) {
      // 토큰 만료 시 로그아웃
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
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

export default api;
