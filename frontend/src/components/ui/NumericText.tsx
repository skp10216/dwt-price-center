/**
 * 숫자 표시 컴포넌트
 *
 * SSOT: 가격 외 모든 숫자 표시는 이 컴포넌트를 사용
 * - tabular-nums 폰트 적용 (숫자 정렬)
 * - 다양한 포맷 지원 (숫자, 퍼센트, 소수점)
 *
 * 사용 예시:
 * <NumericText value={1234} />                    // 1,234
 * <NumericText value={95.5} format="percent" />   // 95.5%
 * <NumericText value={3.14159} decimals={2} />    // 3.14
 */

'use client';

import { Typography, type TypographyProps } from '@mui/material';
import { tabularNumsStyle } from '@/theme/tokens';

export interface NumericTextProps {
  /** 숫자 값 */
  value: number | string | null | undefined;
  /** 포맷 형식 */
  format?: 'number' | 'percent' | 'decimal';
  /** 소수점 자릿수 (format='decimal'일 때만) */
  decimals?: number;
  /** Typography variant (기본값: 'body1') */
  variant?: TypographyProps['variant'];
  /** 색상 */
  color?: TypographyProps['color'];
  /** 정렬 (기본값: 'right') */
  align?: 'left' | 'right' | 'center';
  /** 폰트 두께 */
  fontWeight?: number | string;
  /** 접두사 (예: '+', '-') */
  prefix?: string;
  /** 접미사 (예: '개', '명') */
  suffix?: string;
  /** 값이 없을 때 표시할 텍스트 */
  placeholder?: string;
  /** 추가 sx props */
  sx?: TypographyProps['sx'];
  /** 인라인 표시 (기본값: false) */
  inline?: boolean;
  /** 천단위 구분 쉼표 사용 여부 (기본값: true) */
  useComma?: boolean;
}

export function NumericText({
  value,
  format = 'number',
  decimals = 0,
  variant = 'body1',
  color = 'text.primary',
  align = 'right',
  fontWeight,
  prefix = '',
  suffix = '',
  placeholder = '-',
  sx,
  inline = false,
  useComma = true,
}: NumericTextProps) {
  // 값이 없는 경우
  if (value === null || value === undefined || value === '') {
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

  // 숫자로 변환
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
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

  // 포맷에 따른 문자열 생성
  const formatNumber = (val: number) => {
    switch (format) {
      case 'percent':
        return `${val.toFixed(decimals)}%`;
      case 'decimal':
        return val.toFixed(decimals);
      case 'number':
      default:
        if (useComma) {
          return val.toLocaleString('ko-KR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          });
        }
        return val.toFixed(decimals);
    }
  };

  const formatted = formatNumber(numValue);
  const display = `${prefix}${formatted}${suffix}`;

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
      {display}
    </Typography>
  );
}

/**
 * 퍼센트 표시 컴포넌트 (NumericText 래퍼)
 *
 * 사용 예시:
 * <PercentText value={95.5} />           // 95.5%
 * <PercentText value={100} decimals={0} /> // 100%
 */
export interface PercentTextProps extends Omit<NumericTextProps, 'format' | 'suffix'> {
  /** 소수점 자릿수 (기본값: 1) */
  decimals?: number;
}

export function PercentText({ decimals = 1, ...props }: PercentTextProps) {
  return <NumericText {...props} format="percent" decimals={decimals} />;
}

/**
 * 개수 표시 컴포넌트 (NumericText 래퍼)
 *
 * 사용 예시:
 * <CountText value={123} />          // 123개
 * <CountText value={5} unit="명" />  // 5명
 */
export interface CountTextProps extends Omit<NumericTextProps, 'format' | 'decimals'> {
  /** 단위 (기본값: '개') */
  unit?: string;
}

export function CountText({ unit = '개', ...props }: CountTextProps) {
  return <NumericText {...props} format="number" decimals={0} suffix={unit} />;
}

export default NumericText;
