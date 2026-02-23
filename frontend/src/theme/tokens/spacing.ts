/**
 * 간격/밀도 토큰 정의
 * SSOT: 모든 spacing/padding/margin은 이 파일에서 정의된 값만 사용
 * 
 * 사용 규칙:
 * - compact = 정보 밀도 높음 (관리자/백오피스 기본)
 * - regular = 가독성 우선 (표준 모드)
 * - spacious = 큰 터치 영역 (접근성/편안한 모드)
 * 
 * 밀도 모드 변경 시 바뀌는 토큰:
 * - pagePadding: 페이지 외곽 여백
 * - sectionGap: 섹션 간 간격
 * - cardPadding: 카드 내부 여백
 * - toolbarHeight: 툴바 높이
 * - headerHeight: 페이지 헤더 높이
 * - inputHeight: 입력/버튼/셀렉트 높이
 * - chipHeight: 상태 칩 높이
 * - tableRowHeight: 테이블 행 높이
 * - tableCellPadding: 테이블 셀 패딩
 */

// 밀도 타입
export type Density = 'compact' | 'regular' | 'spacious';

// 밀도별 전체 토큰 정의 (px)
export const densityConfig = {
  compact: {
    base: 6,                // theme.spacing(1) = 6px
    borderRadius: 6,
    // 레이아웃
    pagePadding: 12,        // 페이지 외곽 패딩
    sectionGap: 12,         // 섹션 간 간격
    headerHeight: 48,       // 페이지 헤더 높이
    toolbarHeight: 40,      // 툴바 높이
    // 컴포넌트
    buttonPadding: { x: 12, y: 4 },
    inputPadding: { x: 10, y: 6 },
    inputHeight: 32,        // input/select/button 높이
    cardPadding: 12,
    chipHeight: 22,
    iconButtonSize: 28,
    dialogBorderRadius: 12,
    // 테이블
    tableCellPadding: { x: 12, y: 6 },
    tableRowHeight: 36,
    tableHeaderHeight: 36,
    // 리스트
    listItemPadding: 6,
  },
  regular: {
    base: 8,                // theme.spacing(1) = 8px
    borderRadius: 8,
    // 레이아웃
    pagePadding: 16,        // 페이지 외곽 패딩
    sectionGap: 16,         // 섹션 간 간격
    headerHeight: 56,       // 페이지 헤더 높이
    toolbarHeight: 48,      // 툴바 높이
    // 컴포넌트
    buttonPadding: { x: 16, y: 6 },
    inputPadding: { x: 14, y: 8 },
    inputHeight: 36,        // input/select/button 높이
    cardPadding: 16,
    chipHeight: 26,
    iconButtonSize: 32,
    dialogBorderRadius: 16,
    // 테이블
    tableCellPadding: { x: 16, y: 8 },
    tableRowHeight: 44,
    tableHeaderHeight: 40,
    // 리스트
    listItemPadding: 8,
  },
  spacious: {
    base: 10,               // theme.spacing(1) = 10px
    borderRadius: 12,
    // 레이아웃
    pagePadding: 24,        // 페이지 외곽 패딩
    sectionGap: 20,         // 섹션 간 간격
    headerHeight: 64,       // 페이지 헤더 높이
    toolbarHeight: 56,      // 툴바 높이
    // 컴포넌트
    buttonPadding: { x: 24, y: 10 },
    inputPadding: { x: 16, y: 12 },
    inputHeight: 44,        // input/select/button 높이
    cardPadding: 24,
    chipHeight: 32,
    iconButtonSize: 40,
    dialogBorderRadius: 20,
    // 테이블
    tableCellPadding: { x: 16, y: 12 },
    tableRowHeight: 52,
    tableHeaderHeight: 48,
    // 리스트
    listItemPadding: 12,
  },
} as const;

// 밀도별 설정 가져오기
export const getDensityConfig = (density: Density) => densityConfig[density];

// 밀도별 설정 타입 (자동 추론)
export type DensityTokens = ReturnType<typeof getDensityConfig>;

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

// 일관된 spacing 스케일 (4px 단위 기반)
export const spacingScale = {
  xxs: 2,   // 2px
  xs: 4,    // 4px
  sm: 8,    // 8px
  md: 12,   // 12px
  lg: 16,   // 16px
  xl: 20,   // 20px
  xxl: 24,  // 24px
  xxxl: 32, // 32px
} as const;
