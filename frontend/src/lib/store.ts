/**
 * 단가표 통합 관리 시스템 - 전역 상태 관리 (Zustand)
 */

import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DomainType } from './domain';

// 쿠키 설정 유틸리티
function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || 
         hostname.endsWith('.localhost') || 
         hostname === '127.0.0.1';
}

function setCookie(name: string, value: string, days: number = 7) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // 개발 환경: localhost 계열, 프로덕션: dwt.price 도메인
  const domain = isLocalhost() ? '' : '; domain=.dwt.price';
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/${domain}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  const domain = isLocalhost() ? '' : '; domain=.dwt.price';
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
}

// 아이디 저장 관련 유틸리티
const SAVED_EMAIL_KEY = 'saved_email';
const REMEMBER_ME_KEY = 'remember_me';

export function getSavedEmail(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(SAVED_EMAIL_KEY);
}

export function getRememberMe(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(REMEMBER_ME_KEY) === 'true';
}

export function saveEmailPreference(email: string, rememberMe: boolean) {
  if (typeof localStorage === 'undefined') return;
  if (rememberMe) {
    localStorage.setItem(SAVED_EMAIL_KEY, email);
    localStorage.setItem(REMEMBER_ME_KEY, 'true');
  } else {
    localStorage.removeItem(SAVED_EMAIL_KEY);
    localStorage.removeItem(REMEMBER_ME_KEY);
  }
}

// 사용자 타입
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'viewer' | 'settlement';
  is_active: boolean;
}

// 인증 상태
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** 로그인 설정 (expiresIn: 토큰 만료 시간(초)) */
  setAuth: (user: User, token: string, expiresIn?: number) => void;
  logout: () => void;
}

// Hydration 상태 추적용 (zustand persist의 hydration 완료 여부)
let hasHydrated = false;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token, expiresIn) => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('access_token', token);
        }
        // 쿠키 만료 기간 계산 (expiresIn이 있으면 해당 기간, 없으면 7일)
        const cookieDays = expiresIn ? expiresIn / 86400 : 7;
        // 미들웨어에서 사용할 쿠키 설정
        setCookie('token', token, cookieDays);
        setCookie('user_role', user.role, cookieDays);
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('access_token');
        }
        // 쿠키 삭제
        deleteCookie('token');
        deleteCookie('user_role');
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => {
        return (state) => {
          hasHydrated = true;
          // 새로고침 시 localStorage에서 복원된 인증 정보를 쿠키에도 동기화
          if (state && state.isAuthenticated && state.user && state.token) {
            // 쿠키가 없거나 만료된 경우를 대비하여 다시 설정 (7일 기본)
            setCookie('token', state.token, 7);
            setCookie('user_role', state.user.role, 7);
          }
        };
      },
    }
  )
);

// Hydration 완료 여부 확인 훅
export const useAuthHydrated = () => {
  const [hydrated, setHydrated] = useState(hasHydrated);
  
  useEffect(() => {
    // 이미 hydration 완료된 경우
    if (hasHydrated) {
      setHydrated(true);
      return;
    }
    
    // hydration 완료 대기
    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  return hydrated;
};

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
  isSettlementDomain: boolean;
  setDomainType: (type: DomainType) => void;
}

export const useDomainStore = create<DomainState>((set) => ({
  domainType: 'user',
  isAdminDomain: false,
  isSettlementDomain: false,
  setDomainType: (type) => set({
    domainType: type,
    isAdminDomain: type === 'admin',
    isSettlementDomain: type === 'settlement',
  }),
}));

// 외관 설정 타입 import
import type { 
  AppearanceSettings, 
  ThemeMode,
  FontScale, 
  Density, 
  AccentColor 
} from '@/theme/settings';
import { DEFAULT_SETTINGS, isValidSettings } from '@/theme/settings';

// 외관 설정 상태 (확장된 테마 시스템)
interface AppearanceState {
  settings: AppearanceSettings;
  // 개별 설정 변경
  setFontScale: (fontScale: FontScale) => void;
  setDensity: (density: Density) => void;
  setAccentColor: (accentColor: AccentColor) => void;
  setMode: (mode: ThemeMode) => void;
  // 전체 설정 변경
  setSettings: (settings: Partial<AppearanceSettings>) => void;
  // 초기화
  resetSettings: () => void;
}

// 외관 설정 hydration 추적
let appearanceHydrated = false;

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      setFontScale: (fontScale) => 
        set((state) => ({ settings: { ...state.settings, fontScale } })),
      setDensity: (density) => 
        set((state) => ({ settings: { ...state.settings, density } })),
      setAccentColor: (accentColor) => 
        set((state) => ({ settings: { ...state.settings, accentColor } })),
      setMode: (mode) => 
        set((state) => ({ settings: { ...state.settings, mode } })),
      setSettings: (partial) => 
        set((state) => ({ settings: { ...state.settings, ...partial } })),
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'appearance-storage',
      partialize: (state) => ({ settings: state.settings }),
      onRehydrateStorage: () => {
        return (state) => {
          appearanceHydrated = true;
          // 저장된 설정이 유효하지 않으면 기본값으로 복원
          if (state && !isValidSettings(state.settings)) {
            state.settings = DEFAULT_SETTINGS;
          }
        };
      },
    }
  )
);

// 외관 설정 hydration 완료 확인 훅
export const useAppearanceHydrated = () => {
  const [hydrated, setHydrated] = useState(appearanceHydrated);
  
  useEffect(() => {
    if (appearanceHydrated) {
      setHydrated(true);
      return;
    }
    
    const unsubscribe = useAppearanceStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  return hydrated;
};

// 하위 호환성을 위한 useThemeStore (deprecated - useAppearanceStore 사용 권장)
export { type ThemeMode };

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'light',
      setMode: (mode) => {
        set({ mode });
        // 외관 설정과 동기화
        useAppearanceStore.getState().setMode(mode);
      },
      toggleMode: () => {
        const current = get().mode;
        const next: ThemeMode = current === 'light' ? 'dark' : current === 'dark' ? 'auto' : 'light';
        set({ mode: next });
        useAppearanceStore.getState().setMode(next);
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);
