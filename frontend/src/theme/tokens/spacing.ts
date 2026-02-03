/**
 * 간격/밀도 토큰 정의
 * SSOT: 모든 spacing/padding/margin은 이 파일에서 정의된 값만 사용
 * 
 * 사용 규칙:
 * - 관리자 = compact (정보 밀도 높음)
 * - 사용자 = regular (가독성 우선)
 * - 접근성 = spacious (큰 터치 영역)
 */

// 밀도 타입
export type Density = 'compact' | 'regular' | 'spacious';

// 밀도별 기본 spacing 단위 (px)
export const densityConfig = {
  compact: {
    base: 6,           // theme.spacing(1) = 6px
    borderRadius: 6,
    buttonPadding: { x: 12, y: 4 },
    inputPadding: { x: 10, y: 6 },
    cardPadding: 12,
    tableCellPadding: 8,
    listItemPadding: 6,
    chipHeight: 24,
    iconButtonSize: 32,
    dialogBorderRadius: 12,
  },
  regular: {
    base: 8,           // theme.spacing(1) = 8px
    borderRadius: 8,
    buttonPadding: { x: 16, y: 8 },
    inputPadding: { x: 14, y: 10 },
    cardPadding: 16,
    tableCellPadding: 12,
    listItemPadding: 8,
    chipHeight: 28,
    iconButtonSize: 40,
    dialogBorderRadius: 16,
  },
  spacious: {
    base: 10,          // theme.spacing(1) = 10px
    borderRadius: 12,
    buttonPadding: { x: 24, y: 12 },
    inputPadding: { x: 16, y: 14 },
    cardPadding: 24,
    tableCellPadding: 16,
    listItemPadding: 12,
    chipHeight: 36,
    iconButtonSize: 48,
    dialogBorderRadius: 20,
  },
} as const;

// 밀도별 설정 가져오기
export const getDensityConfig = (density: Density) => densityConfig[density];

// 그림자 정의 (elevation 대체)
export const shadows = {
  none: 'none',
  xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  // 다크 모드용 그림자
  darkSm: '0 1px 3px 0 rgb(0 0 0 / 0.3), 0 1px 2px -1px rgb(0 0 0 / 0.3)',
  darkMd: '0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.4)',
  darkLg: '0 10px 15px -3px rgb(0 0 0 / 0.5), 0 4px 6px -4px rgb(0 0 0 / 0.5)',
} as const;

// 브레이크포인트 (MUI 기본값 유지하되 명시적으로 정의)
export const breakpoints = {
  xs: 0,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1536,
} as const;

// z-index 레이어
export const zIndex = {
  drawer: 1200,
  appBar: 1100,
  modal: 1300,
  snackbar: 1400,
  tooltip: 1500,
} as const;

// 트랜지션
export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  // 특수 효과용
  bounce: '400ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  smooth: '500ms cubic-bezier(0.25, 0.1, 0.25, 1)',
} as const;
