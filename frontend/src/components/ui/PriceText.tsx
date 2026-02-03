/**
 * 가격 표시 컴포넌트
 *
 * SSOT: 모든 가격 표시는 이 컴포넌트를 사용
 * - tabular-nums 폰트 적용 (숫자 정렬)
 * - 우측 정렬 기본값
 * - 통화 기호 자동 추가
 *
 * 사용 예시:
 * <PriceText value={1000000} />                    // 1,000,000원
 * <PriceText value={500000} currency="USD" />      // $500,000
 * <PriceText value={0} showZero placeholder="-" /> // -
 */

'use client';

import { Typography, type TypographyProps, Box } from '@mui/material';
import { tabularNumsStyle } from '@/theme/tokens';

export interface PriceTextProps {
  /** 가격 값 (숫자) */
  value: number | null | undefined;
  /** 통화 기호 (기본값: '원') */
  currency?: string;
  /** Typography variant (기본값: 'body1') */
  variant?: TypographyProps['variant'];
  /** 색상 (semantic 기반) */
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info' | 'text.primary' | 'text.secondary';
  /** 정렬 (기본값: 'right') */
  align?: 'left' | 'right' | 'center';
  /** 0원 표시 여부 (기본값: true) */
  showZero?: boolean;
  /** 값이 없을 때 표시할 텍스트 (기본값: '-') */
  placeholder?: string;
  /** 폰트 두께 */
  fontWeight?: number | string;
  /** 추가 sx props */
  sx?: TypographyProps['sx'];
  /** 인라인 표시 (기본값: false) */
  inline?: boolean;
}

export function PriceText({
  value,
  currency = '원',
  variant = 'body1',
  color = 'text.primary',
  align = 'right',
  showZero = true,
  placeholder = '-',
  fontWeight,
  sx,
  inline = false,
}: PriceTextProps) {
  // 값이 없거나 0이면서 showZero가 false인 경우
  if (value === null || value === undefined || (!showZero && value === 0)) {
    return (
      <Typography
        variant={variant}
        color="text.secondary"
        sx={{
          textAlign: align,
          fontStyle: 'italic',
          ...sx,
        }}
        component={inline ? 'span' : 'p'}
      >
        {placeholder}
      </Typography>
    );
  }

  // 통화별 포맷팅
  const formatPrice = (val: number, curr: string) => {
    const formatted = val.toLocaleString('ko-KR');

    switch (curr) {
      case 'USD':
      case '$':
        return `$${formatted}`;
      case 'EUR':
      case '€':
        return `€${formatted}`;
      case 'JPY':
      case '¥':
        return `¥${formatted}`;
      case '원':
      case 'KRW':
      default:
        return `${formatted}원`;
    }
  };

  return (
    <Typography
      variant={variant}
      color={color}
      sx={{
        ...tabularNumsStyle,
        textAlign: align,
        fontWeight: fontWeight,
        ...sx,
      }}
      component={inline ? 'span' : 'p'}
    >
      {formatPrice(value, currency)}
    </Typography>
  );
}

/**
 * 가격 차이 표시 컴포넌트 (변경 전/후)
 *
 * 사용 예시:
 * <PriceDiff before={1000000} after={1200000} />  // +200,000원 (빨간색)
 * <PriceDiff before={1000000} after={800000} />   // -200,000원 (파란색)
 */
export interface PriceDiffProps {
  /** 변경 전 가격 */
  before: number;
  /** 변경 후 가격 */
  after: number;
  /** Typography variant */
  variant?: TypographyProps['variant'];
  /** 추가 sx props */
  sx?: TypographyProps['sx'];
  /** 화살표 아이콘 표시 여부 */
  showArrow?: boolean;
}

export function PriceDiff({
  before,
  after,
  variant = 'body2',
  sx,
  showArrow = true,
}: PriceDiffProps) {
  const diff = after - before;
  const isIncrease = diff > 0;
  const isDecrease = diff < 0;
  const color = isIncrease ? 'error.main' : isDecrease ? 'info.main' : 'text.secondary';
  const sign = isIncrease ? '+' : '';
  const arrow = isIncrease ? '↑' : isDecrease ? '↓' : '';

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, ...sx }}>
      {showArrow && arrow && (
        <Typography variant={variant} color={color} sx={{ fontWeight: 700 }}>
          {arrow}
        </Typography>
      )}
      <Typography
        variant={variant}
        color={color}
        sx={{
          ...tabularNumsStyle,
          fontWeight: 600,
        }}
      >
        {sign}{diff.toLocaleString()}원
      </Typography>
    </Box>
  );
}

export default PriceText;
