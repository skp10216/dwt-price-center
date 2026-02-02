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
  login: (email: string, password: string) =>
    api.post<ApiResponse<{ token: { access_token: string }; user: unknown }>>('/auth/login', { email, password }),
  
  logout: () => api.post('/auth/logout'),
  
  getMe: () => api.get<ApiResponse<unknown>>('/auth/me'),
  
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/password', { current_password: currentPassword, new_password: newPassword }),
};

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
