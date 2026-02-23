/**
 * 테마 시스템 통합 export
 * 외부에서는 이 파일을 통해서만 테마 관련 모듈 import
 */

// 테마 생성 함수
export { createAppTheme, default as createTheme } from './createAppTheme';

// 설정 타입 및 기본값
export {
  type AppearanceSettings,
  type ThemeMode,
  DEFAULT_SETTINGS,
  ADMIN_DEFAULT_SETTINGS,
  settingsLabels,
  isValidSettings,
  mergeSettings,
} from './settings';

// 토큰
export {
  // 색상
  accentPalettes,
  semanticColors,
  adminGoldTheme,
  userGreenTheme,
  getBackgroundColors,
  getTextColors,
  getDividerColor,
  type AccentColor,
  // 타이포그래피
  fontFamily,
  tabularNumsStyle,
  fontScales,
  type FontScale,
  // 간격
  densityConfig,
  getDensityConfig,
  shadows,
  transitions,
  spacingScale,
  type Density,
  type DensityTokens,
} from './tokens';

// ThemeRegistry 컴포넌트
export { default as ThemeRegistry } from './ThemeRegistry';
