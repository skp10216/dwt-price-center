/**
 * 단가표 통합 관리 시스템 - 전역 상태 관리 (Zustand)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DomainType } from './domain';

// 쿠키 설정 유틸리티
function isLocalhost(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'localhost' || 
         hostname.endsWith('.localhost') || 
         hostname === '127.0.0.1';
}

function setCookie(name: string, value: string, days: number = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // 개발 환경: localhost 계열, 프로덕션: dwt.price 도메인
  const domain = isLocalhost() ? '' : '; domain=.dwt.price';
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/${domain}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  const domain = isLocalhost() ? '' : '; domain=.dwt.price';
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
}

// 사용자 타입
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'viewer';
  is_active: boolean;
}

// 인증 상태
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token) => {
        localStorage.setItem('access_token', token);
        // 미들웨어에서 사용할 쿠키 설정
        setCookie('token', token);
        setCookie('user_role', user.role);
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('access_token');
        // 쿠키 삭제
        deleteCookie('token');
        deleteCookie('user_role');
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// UI 상태
interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));

// 비교 상태
interface CompareState {
  selectedGradeId: string | null;
  selectedPartnerIds: string[];
  setSelectedGradeId: (id: string | null) => void;
  setSelectedPartnerIds: (ids: string[]) => void;
  togglePartnerId: (id: string) => void;
}

export const useCompareStore = create<CompareState>((set) => ({
  selectedGradeId: null,
  selectedPartnerIds: [],
  setSelectedGradeId: (id) => set({ selectedGradeId: id }),
  setSelectedPartnerIds: (ids) => set({ selectedPartnerIds: ids }),
  togglePartnerId: (id) =>
    set((state) => ({
      selectedPartnerIds: state.selectedPartnerIds.includes(id)
        ? state.selectedPartnerIds.filter((pid) => pid !== id)
        : [...state.selectedPartnerIds, id],
    })),
}));

// 도메인 상태
interface DomainState {
  domainType: DomainType;
  isAdminDomain: boolean;
  setDomainType: (type: DomainType) => void;
}

export const useDomainStore = create<DomainState>((set) => ({
  domainType: 'user',
  isAdminDomain: false,
  setDomainType: (type) => set({ domainType: type, isAdminDomain: type === 'admin' }),
}));
