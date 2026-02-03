/**
 * UI 컴포넌트 통합 export
 * 외부에서는 이 파일을 통해서만 UI 컴포넌트 import
 */

// 기존 컴포넌트
export { default as ConfirmDialog } from './ConfirmDialog';
export { default as PageHeader } from './PageHeader';
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

// 상태 표시 컴포넌트
export {
  StatusChip,
  PriceStatusChip,
  ActiveStatusChip,
  type StatusChipProps,
  type PriceStatusChipProps,
  type ActiveStatusChipProps,
  type StatusType,
} from './StatusChip';
