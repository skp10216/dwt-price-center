/**
 * 정산 도메인 — 전체 프로젝트 공통 상수
 * 입출금 유형, 출처, 상태 등 Chip/Label에 사용되는 색상 & 라벨 정의
 */

type ChipColor = 'error' | 'warning' | 'success' | 'default' | 'info' | 'primary' | 'secondary';

// ─── 입출금 유형 (deposit / withdrawal) ─────────────────────────

export const TRANSACTION_TYPE_LABELS: Record<string, { label: string; color: ChipColor }> = {
  deposit:    { label: '입금', color: 'info' },
  withdrawal: { label: '출금', color: 'error' },
};

// ─── 입출금 출처 (source) ───────────────────────────────────────

export const TRANSACTION_SOURCE_LABELS: Record<string, { label: string; color: ChipColor }> = {
  MANUAL:      { label: '수동', color: 'default' },
  manual:      { label: '수동', color: 'default' },
  BANK_IMPORT: { label: '은행', color: 'primary' },
  bank_import: { label: '은행', color: 'primary' },
  NETTING:     { label: '상계', color: 'secondary' },
  netting:     { label: '상계', color: 'secondary' },
};

/** 출처 라벨만 필요할 때 (텍스트만) */
export const getSourceLabel = (source: string): string =>
  TRANSACTION_SOURCE_LABELS[source]?.label ?? source;

/** 출처 색상만 필요할 때 */
export const getSourceColor = (source: string): ChipColor =>
  TRANSACTION_SOURCE_LABELS[source]?.color ?? 'default';

// ─── 입출금 상태 (status) ───────────────────────────────────────

export const TRANSACTION_STATUS_LABELS: Record<string, { label: string; color: ChipColor }> = {
  pending:   { label: '미배분', color: 'error' },
  partial:   { label: '부분배분', color: 'warning' },
  allocated: { label: '전액배분', color: 'success' },
  on_hold:   { label: '보류', color: 'warning' },
  hidden:    { label: '숨김', color: 'default' },
  cancelled: { label: '취소', color: 'default' },
};

// ─── 금액 포맷 ──────────────────────────────────────────────────

export const formatAmount = (amount: number) =>
  new Intl.NumberFormat('ko-KR').format(amount);
