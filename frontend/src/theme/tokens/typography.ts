/**
 * 타이포그래피 토큰 정의
 * SSOT: 모든 폰트 크기/스타일은 이 파일에서만 정의
 * 
 * 사용 규칙:
 * - 가격/숫자는 tabular-nums 적용 + 우측 정렬
 * - 임의 fontSize 사용 금지, variant만 사용
 */

import type { TypographyOptions } from '@mui/material/styles/createTypography';

// 폰트 패밀리 (단일 폰트 사용)
export const fontFamily = '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';

// 숫자 전용 폰트 스타일 (가격 표시용)
export const tabularNumsStyle = {
  fontFeatureSettings: '"tnum" on, "lnum" on',
  fontVariantNumeric: 'tabular-nums',
} as const;

// 폰트 스케일 정의
export type FontScale = 'small' | 'medium' | 'large';

// 기본 폰트 크기 (rem 단위)
const baseSizes = {
  small: {
    h1: '2rem',
    h2: '1.75rem',
    h3: '1.5rem',
    h4: '1.25rem',
    h5: '1.125rem',
    h6: '1rem',
    subtitle1: '0.9375rem',
    subtitle2: '0.8125rem',
    body1: '0.875rem',
    body2: '0.8125rem',
    caption: '0.6875rem',
    overline: '0.625rem',
    button: '0.8125rem',
  },
  medium: {
    h1: '2.5rem',
    h2: '2rem',
    h3: '1.75rem',
    h4: '1.5rem',
    h5: '1.25rem',
    h6: '1.125rem',
    subtitle1: '1rem',
    subtitle2: '0.875rem',
    body1: '1rem',
    body2: '0.875rem',
    caption: '0.75rem',
    overline: '0.6875rem',
    button: '0.875rem',
  },
  large: {
    h1: '3rem',
    h2: '2.5rem',
    h3: '2rem',
    h4: '1.75rem',
    h5: '1.5rem',
    h6: '1.25rem',
    subtitle1: '1.125rem',
    subtitle2: '1rem',
    body1: '1.125rem',
    body2: '1rem',
    caption: '0.875rem',
    overline: '0.75rem',
    button: '1rem',
  },
} as const;

// 폰트 스케일별 Typography 옵션 생성
export const createTypographyOptions = (scale: FontScale): TypographyOptions => {
  const sizes = baseSizes[scale];
  
  return {
    fontFamily,
    h1: {
      fontSize: sizes.h1,
      fontWeight: 800,
      lineHeight: 1.2,
      letterSpacing: '-0.025em',
    },
    h2: {
      fontSize: sizes.h2,
      fontWeight: 700,
      lineHeight: 1.25,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontSize: sizes.h3,
      fontWeight: 700,
      lineHeight: 1.3,
      letterSpacing: '-0.015em',
    },
    h4: {
      fontSize: sizes.h4,
      fontWeight: 600,
      lineHeight: 1.35,
      letterSpacing: '-0.01em',
    },
    h5: {
      fontSize: sizes.h5,
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: sizes.h6,
      fontWeight: 600,
      lineHeight: 1.45,
    },
    subtitle1: {
      fontSize: sizes.subtitle1,
      fontWeight: 500,
      lineHeight: 1.5,
    },
    subtitle2: {
      fontSize: sizes.subtitle2,
      fontWeight: 500,
      lineHeight: 1.5,
    },
    body1: {
      fontSize: sizes.body1,
      fontWeight: 400,
      lineHeight: 1.6,
    },
    body2: {
      fontSize: sizes.body2,
      fontWeight: 400,
      lineHeight: 1.6,
    },
    caption: {
      fontSize: sizes.caption,
      fontWeight: 400,
      lineHeight: 1.5,
    },
    overline: {
      fontSize: sizes.overline,
      fontWeight: 600,
      lineHeight: 1.5,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
    button: {
      fontSize: sizes.button,
      fontWeight: 600,
      lineHeight: 1.5,
      textTransform: 'none',
      letterSpacing: '0.01em',
    },
  };
};

// 편의를 위한 프리셋 export
export const fontScales = {
  small: createTypographyOptions('small'),
  medium: createTypographyOptions('medium'),
  large: createTypographyOptions('large'),
} as const;
