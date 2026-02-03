/**
 * 색상 팔레트 토큰 정의
 * SSOT: 모든 색상은 이 파일에서만 정의
 * 
 * 사용 규칙:
 * - 저장/확정/적용 = success
 * - 취소/되돌리기/파괴적 작업 = error
 * - 안내/알림/도움말 = info
 * - 경고/주의/변경됨/충돌 = warning
 * - 기본 CTA/네비 강조 = primary
 * - 비활성/보류/미설정 = text.secondary + divider
 */

import type { PaletteMode } from '@mui/material';

// Accent 색상 프리셋 (primary로 사용)
export const accentPalettes = {
  blue: {
    main: '#1976d2',
    light: '#42a5f5',
    dark: '#1565c0',
    contrastText: '#ffffff',
  },
  indigo: {
    main: '#3f51b5',
    light: '#7986cb',
    dark: '#303f9f',
    contrastText: '#ffffff',
  },
  purple: {
    main: '#7c3aed',
    light: '#a78bfa',
    dark: '#5b21b6',
    contrastText: '#ffffff',
  },
  teal: {
    main: '#0d9488',
    light: '#5eead4',
    dark: '#0f766e',
    contrastText: '#ffffff',
  },
  green: {
    main: '#059669',
    light: '#34d399',
    dark: '#047857',
    contrastText: '#ffffff',
  },
  orange: {
    main: '#ea580c',
    light: '#fb923c',
    dark: '#c2410c',
    contrastText: '#ffffff',
  },
  red: {
    main: '#dc2626',
    light: '#f87171',
    dark: '#b91c1c',
    contrastText: '#ffffff',
  },
  grey: {
    main: '#525252',
    light: '#a3a3a3',
    dark: '#262626',
    contrastText: '#ffffff',
  },
} as const;

// Semantic 색상 (절대 변경 금지 - 의미 기반)
export const semanticColors = {
  success: {
    main: '#059669',
    light: '#34d399',
    dark: '#047857',
    contrastText: '#ffffff',
  },
  error: {
    main: '#dc2626',
    light: '#f87171',
    dark: '#b91c1c',
    contrastText: '#ffffff',
  },
  warning: {
    main: '#d97706',
    light: '#fbbf24',
    dark: '#b45309',
    contrastText: '#ffffff',
  },
  info: {
    main: '#0284c7',
    light: '#38bdf8',
    dark: '#0369a1',
    contrastText: '#ffffff',
  },
} as const;

// 관리자 채널 전용 골드 테마 (로그인 등 특수 페이지용)
export const adminGoldTheme = {
  gold: {
    main: '#D4AF37',
    light: '#E5C158',
    dark: '#B8860B',
    contrastText: '#0f0f14',
  },
  background: {
    primary: '#0f0f14',
    secondary: '#1a1a24',
    tertiary: '#0d0d12',
    paper: '#16161e',
  },
  text: {
    primary: '#ffffff',
    secondary: '#a0a0a0',
    gold: '#D4AF37',
  },
} as const;

// 사용자 채널 전용 그린 테마 (로그인 등 특수 페이지용)
export const userGreenTheme = {
  green: {
    main: '#10b981',
    light: '#34d399',
    dark: '#059669',
    contrastText: '#ffffff',
  },
  background: {
    primary: '#f0fdf4',
    secondary: '#dcfce7',
    paper: '#ffffff',
    gradient: 'linear-gradient(135deg, #0d9488 0%, #059669 50%, #047857 100%)',
  },
  text: {
    primary: '#1f2937',
    secondary: '#6b7280',
    accent: '#059669',
  },
} as const;

// 모드별 배경색
export const getBackgroundColors = (mode: PaletteMode) => ({
  default: mode === 'light' ? '#f8fafc' : '#0a0a0a',
  paper: mode === 'light' ? '#ffffff' : '#18181b',
  elevated: mode === 'light' ? '#ffffff' : '#27272a',
});

// 모드별 텍스트색
export const getTextColors = (mode: PaletteMode) => ({
  primary: mode === 'light' ? '#0f172a' : '#fafafa',
  secondary: mode === 'light' ? '#64748b' : '#a1a1aa',
  disabled: mode === 'light' ? '#94a3b8' : '#52525b',
});

// 모드별 구분선색
export const getDividerColor = (mode: PaletteMode) =>
  mode === 'light' ? '#e2e8f0' : '#3f3f46';

export type AccentColor = keyof typeof accentPalettes;
