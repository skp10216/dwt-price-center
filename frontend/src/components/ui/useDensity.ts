/**
 * 밀도 모드 편의 훅
 * 
 * 기존 useAppearanceStore의 density 설정을 기반으로
 * 현재 밀도 토큰을 쉽게 가져올 수 있는 훅
 * 
 * 사용 예시:
 * const { density, tokens, setDensity } = useDensity();
 * // tokens.pagePadding → 현재 밀도의 페이지 패딩 (px)
 * // tokens.tableRowHeight → 현재 밀도의 테이블 행 높이 (px)
 */

'use client';

import { useMemo } from 'react';
import { useAppearanceStore } from '@/lib/store';
import { getDensityConfig, type Density, type DensityTokens } from '@/theme/tokens/spacing';

export interface UseDensityReturn {
  /** 현재 밀도 모드 ('compact' | 'regular' | 'spacious') */
  density: Density;
  /** 현재 밀도의 모든 토큰 값 (px) */
  tokens: DensityTokens;
  /** 밀도 모드 변경 */
  setDensity: (density: Density) => void;
}

export function useDensity(): UseDensityReturn {
  const density = useAppearanceStore((s) => s.settings.density);
  const setDensity = useAppearanceStore((s) => s.setDensity);

  const tokens = useMemo(() => getDensityConfig(density), [density]);

  return { density, tokens, setDensity };
}

export default useDensity;
