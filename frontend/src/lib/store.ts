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

/**
 * 쿠키 도메인 결정
 * - 프로덕션: .dwt.price (서브도메인 간 공유)
 * - 개발 환경 (*.localhost): domain 속성 생략 → 현재 호스트 전용 쿠키
 *   ⚠️ Chrome에서 domain=localhost 설정 시 settlement.localhost 등
 *      서브도메인에서 쿠키가 전달되지 않는 알려진 이슈 존재
 *      → domain 생략하면 현재 호스트(settlement.localhost 등)에서 정상 동작
 */
function getCookieDomain(): string {
  if (typeof window === 'undefined') return '';
  if (!isLocalhost()) return '; domain=.dwt.price';
  // 개발 환경: domain 속성 생략 (호스트 전용 쿠키)
  // settlement.localhost / admin.localhost / localhost 각각 독립 쿠키
  return '';
}

function setCookie(name: string, value: string, days: number = 7) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const domain = getCookieDomain();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/${domain}; SameSite=Lax`;
}

/**
 * 쿠키 완전 삭제 (모든 가능한 domain/path 조합으로 시도)
 * Chrome에서 domain=localhost 쿠키가 정상 삭제되지 않는 경우를 대비
 */
function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  const expired = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
  // 모든 가능한 도메인 조합으로 삭제 시도
  document.cookie = `${name}=; ${expired}; path=/`;
  document.cookie = `${name}=; ${expired}; path=/; domain=localhost`;
  document.cookie = `${name}=; ${expired}; path=/; domain=.localhost`;
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost') {
      document.cookie = `${name}=; ${expired}; path=/; domain=${hostname}`;
      document.cookie = `${name}=; ${expired}; path=/; domain=.${hostname}`;
    }
  }
  document.cookie = `${name}=; ${expired}; path=/; domain=.dwt.price`;
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

/**
 * 쿠키에서 값 읽기 유틸리티
 * 서브도메인 간 전환 시 localStorage에 토큰이 없을 때 쿠키에서 복원하기 위함
 */
function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token, _expiresIn) => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('access_token', token);
        }
        // 쿠키는 항상 7일로 고정 (JWT 만료와 별개로, 미들웨어 인증용)
        // JWT 만료 시 클라이언트에서 401 처리로 로그아웃됨
        setCookie('token', token, 7);
        setCookie('user_role', user.role, 7);
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('auth-storage');
        }
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
          if (state && state.isAuthenticated && state.user && state.token) {
            // 정상 상태: localStorage 인증 정보를 쿠키에 재동기화 (미들웨어용)
            setCookie('token', state.token, 7);
            setCookie('user_role', state.user.role, 7);
            // localStorage의 access_token도 동기화
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('access_token', state.token);
            }
          } else {
            // localStorage에 인증 정보가 없는 경우 (서브도메인 간 전환 시)
            // 쿠키에 토큰이 남아있으면 복원 시도
            const cookieToken = getCookieValue('token');
            const cookieRole = getCookieValue('user_role') as User['role'] | null;
            if (cookieToken && cookieRole) {
              // 쿠키 토큰을 localStorage에 동기화 (API 요청용)
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('access_token', cookieToken);
              }
            }
          }
        };
      },
    }
  )
);

// Hydration 완료 여부 확인 훅
// persist.hasHydrated()를 직접 사용하여 모듈 변수 경쟁 조건 제거
export const useAuthHydrated = () => {
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist?.hasHydrated() ?? false);

  useEffect(() => {
    // 구독 먼저 등록 후, 이미 완료된 경우 즉시 처리 (순서 바뀜 방지)
    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsubscribe;
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
