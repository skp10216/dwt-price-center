/**
 * SSOT 모델 가격 관리 - 타입 정의
 */

// 등급 정보
export interface Grade {
  id: string;
  name: string;
  sort_order: number;
}

// 등급별 가격 정보
export interface GradePrice {
  grade_id: string;
  grade_name: string;
  price: number;
}

// SSOT 모델 (가격 정보 포함)
export interface SSOTModel {
  id: string;
  model_key: string;
  model_code: string;
  device_type: string;
  manufacturer: string;
  series: string;
  model_name: string;
  storage_gb: number;
  storage_display: string;
  full_name: string;
  connectivity: string;
  is_active: boolean;
  grade_prices: GradePrice[];
}

// 모델 키 기준으로 그룹화된 모델 (동일 기종, 다른 스토리지)
export interface GroupedModel {
  model_key: string;
  model_name: string;
  series: string;
  variants: SSOTModel[]; // 스토리지별 변형
}

// 가격 변경 추적
export interface PriceChange {
  modelId: string;
  storageGb: number;
  gradeId: string;
  gradeName: string;
  originalPrice: number;
  newPrice: number;
}

// 변경 추적 키 생성 함수
export function createChangeKey(modelId: string, gradeId: string): string {
  return `${modelId}_${gradeId}`;
}

// 통계 정보
export interface PriceStats {
  totalModels: number;       // 총 모델 수 (스토리지별)
  totalConfigurations: number; // 총 구성 수 (모델 x 등급)
  configuredCount: number;   // 설정된 가격 수
  unconfiguredCount: number; // 미설정 가격 수
}

// 필터 옵션
export interface FilterOptions {
  search: string;
  priceStatus: 'all' | 'configured' | 'unconfigured';
  series: string;
}

// 디바이스 타입
export type DeviceType = 'smartphone' | 'tablet' | 'wearable';

// 제조사
export type Manufacturer = 'apple' | 'samsung';

// 디바이스 타입 라벨
export const deviceTypeLabels: Record<DeviceType, string> = {
  smartphone: '스마트폰',
  tablet: '태블릿',
  wearable: '웨어러블',
};

// 제조사 라벨
export const manufacturerLabels: Record<Manufacturer, string> = {
  apple: 'Apple',
  samsung: 'Samsung',
};
