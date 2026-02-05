/**
 * 판매가 대시보드 - 타입 정의
 */

import { Grade } from '@/app/(main)/admin/models/_components/types';

// 테이블에 표시할 모델 행
export interface PriceTableRow {
  id: string;
  modelKey: string;
  modelName: string;
  series: string;
  storage: string;
  storageGb: number;
  connectivity: string;
  note: string | null;  // 비고 (차감내용 등)
  prices: Record<string, number>;  // gradeId -> price
  updatedAt?: string;  // 최근 업데이트 시간
}

// 제조사별 테이블 데이터
export interface ManufacturerTableData {
  manufacturer: 'apple' | 'samsung';
  label: string;
  grades: Grade[];
  rows: PriceTableRow[];
  allRows: PriceTableRow[];  // 필터 적용 전 전체 행 (시리즈 목록 추출용)
  extraColumns?: string[];  // 삼성: 수출, LCD 등
}

// 필터 상태
export interface DashboardFilters {
  search: string;
  appleSeries: string;   // 아이폰 시리즈 필터
  samsungSeries: string; // 삼성 시리즈 필터
  showChangedOnly: boolean;
  compactView: boolean;
}

// 브랜드 탭 (모바일용)
export type BrandTab = 'apple' | 'samsung';

// 검색 결과
export interface SearchResult {
  id: string;
  modelName: string;
  storage: string;
  manufacturer: 'apple' | 'samsung';
  series: string;
}

// 가격 변경 정보
export interface PriceChangeInfo {
  modelId: string;
  gradeId: string;
  changedAt: string;
  changeType: '24h' | '7d';
}

// 차감 항목
export interface DeductionItem {
  id: string;
  name: string;
  description: string | null;
  is_percentage: boolean;
  applies_to: string[];  // model_key 목록
  levels: DeductionLevel[];
}

// 차감 레벨
export interface DeductionLevel {
  id: string;
  level_name: string;
  value: number;
  description: string | null;
}

// 컬럼 가시성 설정
export interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  required?: boolean; // 필수 컬럼은 숨길 수 없음
}
