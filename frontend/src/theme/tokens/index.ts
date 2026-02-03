/**
 * 디자인 토큰 통합 export
 * 모든 토큰은 이 파일을 통해서만 import
 */

// 색상
export {
  accentPalettes,
  semanticColors,
  adminGoldTheme,
  userGreenTheme,
  getBackgroundColors,
  getTextColors,
  getDividerColor,
  type AccentColor,
} from './palette';

// 타이포그래피
export {
  fontFamily,
  tabularNumsStyle,
  createTypographyOptions,
  fontScales,
  type FontScale,
} from './typography';

// 간격/밀도
export {
  densityConfig,
  getDensityConfig,
  shadows,
  breakpoints,
  zIndex,
  transitions,
  type Density,
} from './spacing';
