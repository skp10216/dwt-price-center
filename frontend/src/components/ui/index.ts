/**
 * UI 컴포넌트 통합 export
 * 외부에서는 이 파일을 통해서만 UI 컴포넌트 import
 *
 * 네이밍 규칙:
 * - App* 접두사: 디자인 시스템 공통 컴포넌트 (신규)
 * - 접두사 없음: 기존 하위 호환 or 도메인 특화 컴포넌트
 */

// ─── 디자인 시스템 공통 컴포넌트 (App*) ─────────────────────────────────────

// 레이아웃 / 페이지 구조
export { default as AppPageContainer, type AppPageContainerProps } from './AppPageContainer';
export {
  default as AppPageHeader,
  type AppPageHeaderProps,
  type AppPageHeaderAction,
  type AppPageHeaderVariant,
} from './AppPageHeader';
export { default as AppPageToolbar, type AppPageToolbarProps } from './AppPageToolbar';

// 카드 / 섹션
export {
  AppSectionCard,
  AppDataCard,
  type AppSectionCardProps,
  type AppDataCardProps,
} from './AppSectionCard';

// 테이블
export { default as AppTableShell, type AppTableShellProps } from './AppTableShell';

// 상태 / 칩
export {
  AppStatusChip,
  SettlementStatusChip,
  PaymentStatusChip,
  UploadJobStatusChip,
  ActiveChip,
  PriceConfigChip,
  type AppStatusChipProps,
  type SemanticStatus,
} from './AppStatusChip';

// 메트릭
export {
  AppMetricChip,
  AppMetricCard,
  type AppMetricChipProps,
  type AppMetricCardProps,
} from './AppMetricChip';

// 빈 상태
export {
  default as AppEmptyStateCompact,
  type AppEmptyStateCompactProps,
  type AppEmptyStateAction,
} from './AppEmptyState';

// 아이콘 액션 버튼
export {
  default as AppIconActionButton,
  type AppIconActionButtonProps,
} from './AppIconActionButton';

// 밀도 훅
export { useDensity, type UseDensityReturn } from './useDensity';

// ─── 하위 호환 컴포넌트 (기존 인터페이스 유지) ──────────────────────────────

export { default as ConfirmDialog } from './ConfirmDialog';
export { default as PageHeader, type PageHeaderProps, type PageHeaderAction } from './PageHeader';
export { default as PageToolbar, type PageToolbarProps } from './PageToolbar';
export { Logo, LogoIcon } from './Logo';

// 숫자/가격 표시 컴포넌트
export {
  PriceText,
  PriceDiff,
  type PriceTextProps,
  type PriceDiffProps,
} from './PriceText';

export {
  NumericText,
  PercentText,
  CountText,
  type NumericTextProps,
  type PercentTextProps,
  type CountTextProps,
} from './NumericText';

// 상태 표시 컴포넌트 (기존 - 하위 호환)
export {
  StatusChip,
  PriceStatusChip,
  ActiveStatusChip,
  type StatusChipProps,
  type PriceStatusChipProps,
  type ActiveStatusChipProps,
  type StatusType,
} from './StatusChip';
