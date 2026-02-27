'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useSnackbar } from 'notistack';
import { settlementApi } from '@/lib/api';

// ─── 타입 ──────────────────────────────────────────────────────

export interface TransactionRow {
  id: string;
  counterparty_id: string;
  counterparty_name: string;
  transaction_type: string;
  transaction_date: string;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  memo: string | null;
  source: string;
  bank_reference: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ViewMode = 'grid' | 'timeline';

export interface CashEventFilters {
  search: string;
  counterpartyId: string;
  transactionType: string;
  status: string;       // 쉼표 구분 복수 가능
  source: string;
  dateFrom: string;
  dateTo: string;
  datePreset: string;
  amountMin: string;
  amountMax: string;
}

interface CashEventState {
  // 데이터
  transactions: TransactionRow[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  // 뷰
  viewMode: ViewMode;
  // 필터
  filters: CashEventFilters;
  // Detail Drawer
  detailId: string | null;
  // 선택
  selected: Set<string>;
}

interface CashEventActions {
  loadData: () => Promise<void>;
  setPage: (p: number) => void;
  setPageSize: (ps: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setFilter: <K extends keyof CashEventFilters>(key: K, value: CashEventFilters[K]) => void;
  setFilters: (partial: Partial<CashEventFilters>) => void;
  resetFilters: () => void;
  setDetailId: (id: string | null) => void;
  setSelected: (sel: Set<string>) => void;
}

type CashEventContextValue = CashEventState & CashEventActions;

const CashEventContext = createContext<CashEventContextValue | null>(null);

export function useCashEvent() {
  const ctx = useContext(CashEventContext);
  if (!ctx) throw new Error('useCashEvent must be used within CashEventProvider');
  return ctx;
}

// ─── 유틸리티 ──────────────────────────────────────────────────

const DEFAULT_FILTERS: CashEventFilters = {
  search: '',
  counterpartyId: '',
  transactionType: '',
  status: '',
  source: '',
  dateFrom: '',
  dateTo: '',
  datePreset: 'all',
  amountMin: '',
  amountMax: '',
};

export function getDateRange(preset: string): { from: string; to: string } | null {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case 'today': return { from: fmt(now), to: fmt(now) };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: fmt(y), to: fmt(y) };
    }
    case 'week': {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return { from: fmt(s), to: fmt(now) };
    }
    case 'thisMonth': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmt(s), to: fmt(now) };
    }
    case 'lastMonth': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmt(s), to: fmt(e) };
    }
    default: return null;
  }
}

/** URL 쿼리 → 필터 파싱 */
function parseUrlFilters(searchParams: URLSearchParams): Partial<CashEventFilters> {
  const f: Partial<CashEventFilters> = {};
  const v = searchParams.get('view');
  // view는 별도 처리
  if (searchParams.get('counterparty')) f.counterpartyId = searchParams.get('counterparty')!;
  if (searchParams.get('type')) f.transactionType = searchParams.get('type')!;
  if (searchParams.get('status')) f.status = searchParams.get('status')!;
  if (searchParams.get('source')) f.source = searchParams.get('source')!;
  if (searchParams.get('from')) f.dateFrom = searchParams.get('from')!;
  if (searchParams.get('to')) f.dateTo = searchParams.get('to')!;
  if (searchParams.get('preset')) f.datePreset = searchParams.get('preset')!;
  if (searchParams.get('amountMin')) f.amountMin = searchParams.get('amountMin')!;
  if (searchParams.get('amountMax')) f.amountMax = searchParams.get('amountMax')!;
  if (searchParams.get('q')) f.search = searchParams.get('q')!;
  return f;
}

// ─── Provider ──────────────────────────────────────────────────

export default function CashEventProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();

  // URL에서 초기값 파싱
  const urlFilters = useMemo(() => parseUrlFilters(searchParams), [searchParams]);
  const urlView = (searchParams.get('view') as ViewMode) || 'grid';
  const urlDetailId = searchParams.get('detail') || null;

  // 상태
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [viewMode, setViewMode] = useState<ViewMode>(urlView);
  const [filters, setFiltersState] = useState<CashEventFilters>({
    ...DEFAULT_FILTERS,
    ...urlFilters,
  });
  const [detailId, setDetailIdState] = useState<string | null>(urlDetailId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // URL 동기화 (필터/뷰/detail → URL)
  const syncUrl = useCallback((
    f: CashEventFilters,
    view: ViewMode,
    detail: string | null,
  ) => {
    const params = new URLSearchParams();
    if (view !== 'grid') params.set('view', view);
    if (f.counterpartyId) params.set('counterparty', f.counterpartyId);
    if (f.transactionType) params.set('type', f.transactionType);
    if (f.status) params.set('status', f.status);
    if (f.source) params.set('source', f.source);
    if (f.datePreset && f.datePreset !== 'all') params.set('preset', f.datePreset);
    if (f.dateFrom && f.datePreset === 'custom') params.set('from', f.dateFrom);
    if (f.dateTo && f.datePreset === 'custom') params.set('to', f.dateTo);
    if (f.amountMin) params.set('amountMin', f.amountMin);
    if (f.amountMax) params.set('amountMax', f.amountMax);
    if (f.search) params.set('q', f.search);
    if (detail) params.set('detail', detail);

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
  }, [pathname, router]);

  // 데이터 로드
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = {
        page: page + 1,
        page_size: pageSize,
      };
      if (filters.search) params.search = filters.search;
      if (filters.counterpartyId) params.counterparty_id = filters.counterpartyId;
      if (filters.transactionType) params.transaction_type = filters.transactionType;
      if (filters.status) params.status = filters.status;
      if (filters.source) params.source = filters.source;
      if (filters.dateFrom) params.date_from = filters.dateFrom;
      if (filters.dateTo) params.date_to = filters.dateTo;
      if (filters.amountMin) params.amount_min = Number(filters.amountMin);
      if (filters.amountMax) params.amount_max = Number(filters.amountMax);

      const res = await settlementApi.listTransactions(params);
      const data = res.data as unknown as { transactions: TransactionRow[]; total: number };
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
      setSelected(new Set());
    } catch {
      enqueueSnackbar('입출금 목록 조회에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  // 필터 변경
  const setFilter = useCallback(<K extends keyof CashEventFilters>(key: K, value: CashEventFilters[K]) => {
    setFiltersState(prev => {
      const next = { ...prev, [key]: value };
      syncUrl(next, viewMode, detailId);
      return next;
    });
    setPage(0);
  }, [syncUrl, viewMode, detailId]);

  const setFilters = useCallback((partial: Partial<CashEventFilters>) => {
    setFiltersState(prev => {
      const next = { ...prev, ...partial };
      syncUrl(next, viewMode, detailId);
      return next;
    });
    setPage(0);
  }, [syncUrl, viewMode, detailId]);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    syncUrl(DEFAULT_FILTERS, viewMode, detailId);
    setPage(0);
  }, [syncUrl, viewMode, detailId]);

  // 뷰모드 변경
  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    syncUrl(filters, mode, detailId);
  }, [filters, detailId, syncUrl]);

  // Detail ID 변경
  const setDetailId = useCallback((id: string | null) => {
    setDetailIdState(id);
    syncUrl(filters, viewMode, id);
  }, [filters, viewMode, syncUrl]);

  const value = useMemo<CashEventContextValue>(() => ({
    transactions,
    total,
    loading,
    page,
    pageSize,
    viewMode,
    filters,
    detailId,
    selected,
    loadData,
    setPage,
    setPageSize,
    setViewMode: handleSetViewMode,
    setFilter,
    setFilters,
    resetFilters,
    setDetailId,
    setSelected,
  }), [
    transactions, total, loading, page, pageSize, viewMode, filters, detailId, selected,
    loadData, handleSetViewMode, setFilter, setFilters, resetFilters, setDetailId,
  ]);

  return (
    <CashEventContext.Provider value={value}>
      {children}
    </CashEventContext.Provider>
  );
}
