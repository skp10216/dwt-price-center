/** 입출금 관리 화면 공통 상수 */

export const TYPE_LABELS: Record<string, { label: string; color: 'info' | 'secondary' }> = {
  deposit: { label: '입금', color: 'info' },
  withdrawal: { label: '출금', color: 'secondary' },
};

export const STATUS_LABELS: Record<string, { label: string; color: 'error' | 'warning' | 'success' | 'default' | 'info' }> = {
  pending: { label: '미배분', color: 'error' },
  partial: { label: '부분배분', color: 'warning' },
  allocated: { label: '전액배분', color: 'success' },
  on_hold: { label: '보류', color: 'warning' },
  hidden: { label: '숨김', color: 'default' },
  cancelled: { label: '취소', color: 'default' },
};

export const SOURCE_LABELS: Record<string, string> = {
  MANUAL: '수동',
  manual: '수동',
  BANK_IMPORT: '은행',
  bank_import: '은행',
  NETTING: '상계',
  netting: '상계',
};

export const formatAmount = (amount: number) =>
  new Intl.NumberFormat('ko-KR').format(amount);
