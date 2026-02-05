/**
 * 외관 설정 타입 및 기본값 정의
 * SSOT: 모든 테마 설정 타입은 이 파일에서만 정의
 */

import type { FontScale } from './tokens/typography';
import type { Density } from './tokens/spacing';
import type { AccentColor } from './tokens/palette';

// Re-export types for external use
export type { FontScale } from './tokens/typography';
export type { Density } from './tokens/spacing';
export type { AccentColor } from './tokens/palette';

// 테마 모드
export type ThemeMode = 'light' | 'dark' | 'auto';

// 외관 설정 인터페이스
export interface AppearanceSettings {
  fontScale: FontScale;
  density: Density;
  accentColor: AccentColor;
  mode: ThemeMode;
}

// 사용자 채널 기본값 (가독성 우선)
export const DEFAULT_SETTINGS: AppearanceSettings = {
  fontScale: 'medium',
  density: 'regular',
  accentColor: 'teal',
  mode: 'light',
};

// 관리자 채널 기본값 (정보 밀도 높음)
export const ADMIN_DEFAULT_SETTINGS: AppearanceSettings = {
  fontScale: 'small',
  density: 'compact',
  accentColor: 'indigo',
  mode: 'light',
};

// 설정 옵션 라벨 (UI 표시용)
export const settingsLabels = {
  fontScale: {
    small: '작게',
    medium: '보통',
    large: '크게',
  },
  density: {
    compact: '빽빽하게',
    regular: '보통',
    spacious: '넓게',
  },
  accentColor: {
    blue: '블루',
    indigo: '인디고',
    purple: '퍼플',
    teal: '틸',
    green: '그린',
    orange: '오렌지',
    red: '레드',
    grey: '그레이',
  },
  mode: {
    light: '라이트',
    dark: '다크',
    auto: '시스템',
  },
} as const;

// 설정 검증
export const isValidSettings = (settings: unknown): settings is AppearanceSettings => {
  if (!settings || typeof settings !== 'object') return false;
  const s = settings as Record<string, unknown>;
  
  const validFontScales = ['small', 'medium', 'large'];
  const validDensities = ['compact', 'regular', 'spacious'];
  const validAccentColors = ['blue', 'indigo', 'purple', 'teal', 'green', 'orange', 'red', 'grey'];
  const validModes = ['light', 'dark', 'auto'];
  
  return (
    validFontScales.includes(s.fontScale as string) &&
    validDensities.includes(s.density as string) &&
    validAccentColors.includes(s.accentColor as string) &&
    validModes.includes(s.mode as string)
  );
};

// 설정 병합 (부분 설정을 기본값과 병합)
export const mergeSettings = (
  partial: Partial<AppearanceSettings>,
  defaults: AppearanceSettings = DEFAULT_SETTINGS
): AppearanceSettings => ({
  ...defaults,
  ...partial,
});
