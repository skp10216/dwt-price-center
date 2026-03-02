'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Grid, Typography, Skeleton, Alert,
  Paper, Chip, alpha, useTheme, Stack, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow,
  IconButton, Tooltip, Button, Avatar, Divider, Badge, TextField,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
  SwapHoriz as SwapHorizIcon,
  Warning as WarningIcon,
  Receipt as ReceiptIcon,
  ShoppingCart as ShoppingCartIcon,
  Visibility as ViewIcon,
  OpenInNew as OpenInNewIcon,
  Person as PersonIcon,
  AccessTime as AccessTimeIcon,
  Star as StarIcon,
  ArrowForward as ArrowForwardIcon,
  BusinessCenter as BusinessCenterIcon,
  Refresh as RefreshIcon,
  Balance as BalanceIcon,
  AccountBalanceWallet as BankImportIcon,
  CallMade as DepositIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
  RocketLaunch as RocketLaunchIcon,
  Close as CloseIcon,
  Timeline as TimelineIcon,
  CloudUpload as UploadIcon,
  AttachMoney as PaymentIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
import { useAppRouter } from '@/lib/navigation';
import { settlementApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import {
  AppPageContainer,
  AppPageHeader,
  AppSectionCard,
  AppIconActionButton,
} from '@/components/ui';

// ─── 타입 ───────────────────────────────────────────────────────────────────

interface DashboardData {
  total_receivable: number;
  total_payable: number;
  settling_count: number;
  locked_count: number;
  open_sales_count: number;
  unpaid_purchase_count: number;
  pending_changes_count: number;
  unmatched_count: number;
}

interface TransactionKpi {
  pending_count: number;
  pending_amount: number;
  partial_count: number;
  partial_amount: number;
}

interface NettingKpi {
  draft_count: number;
  draft_amount: number;
  confirmed_count: number;
  confirmed_amount: number;
}

interface BankImportKpi {
  reviewing_count: number;
  unmatched_lines: number;
}

interface TopItem {
  counterparty_id: string;
  counterparty_name: string;
  amount: number;
  voucher_count: number;
}

interface FavoriteCounterparty {
  id: string;
  name: string;
  receivable: number;
  payable: number;
}

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount);

const formatCompact = (amount: number): string => {
  const abs = Math.abs(amount);
  if (abs >= 1_0000_0000) return `${(amount / 1_0000_0000).toFixed(1)}억`;
  if (abs >= 1_0000) return `${(amount / 1_0000).toFixed(0)}만`;
  return new Intl.NumberFormat('ko-KR').format(amount);
};

const formatKST = (isoStr: string | null | undefined): string => {
  if (!isoStr) return '—';
  let s = isoStr;
  if (s.includes('T') && !s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return isoStr; }
};

function getAvatarColor(name: string): string {
  const colors = ['#1976d2', '#388e3c', '#d32f2f', '#7b1fa2', '#1565c0', '#00838f', '#ef6c00', '#5d4037'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function getInitials(name: string): string {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function useToday() {
  const [value, setValue] = useState({ date: new Date(), str: '' });
  useEffect(() => {
    const d = new Date();
    setValue({
      date: d,
      str: d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
    });
  }, []);
  return value;
}

// ─── 오늘의 작업 관련 ──────────────────────────────────────────────────────

interface ActivityLog {
  id: string;
  trace_id: string | null;
  user_name: string | null;
  action: string;
  description: string | null;
  created_at: string;
  item_count: number;
}

interface DailySummary {
  voucher: number;
  upload: number;
  payment: number;
  netting: number;
  counterparty: number;
  total: number;
  recentLogs: ActivityLog[];
}

const DAILY_CATEGORIES = [
  { key: 'voucher' as const, label: '전표', prefixes: ['VOUCHER_'], color: '#6a1b9a', icon: <ReceiptIcon sx={{ fontSize: 18 }} />, path: '/settlement/vouchers' },
  { key: 'upload' as const, label: '업로드', prefixes: ['UPLOAD_'], color: '#1565c0', icon: <UploadIcon sx={{ fontSize: 18 }} />, path: '/settlement/upload' },
  { key: 'payment' as const, label: '입출금', prefixes: ['RECEIPT_', 'PAYMENT_', 'TRANSACTION_', 'ALLOCATION_'], color: '#1b5e20', icon: <PaymentIcon sx={{ fontSize: 18 }} />, path: '/settlement/transactions' },
  { key: 'netting' as const, label: '상계', prefixes: ['NETTING_'], color: '#00695c', icon: <BalanceIcon sx={{ fontSize: 18 }} />, path: '/settlement/netting' },
  { key: 'counterparty' as const, label: '거래처', prefixes: ['COUNTERPARTY_', 'BRANCH_'], color: '#006064', icon: <BusinessIcon sx={{ fontSize: 18 }} />, path: '/settlement/counterparties' },
];

function aggregateLogs(logs: ActivityLog[]): DailySummary {
  const summary: DailySummary = { voucher: 0, upload: 0, payment: 0, netting: 0, counterparty: 0, total: logs.length, recentLogs: logs.slice(0, 5) };
  for (const log of logs) {
    for (const cat of DAILY_CATEGORIES) {
      if (cat.prefixes.some((p) => log.action.startsWith(p))) {
        summary[cat.key] += log.item_count || 1;
        break;
      }
    }
  }
  return summary;
}

function getDayRange(dateStr?: string) {
  // KST 기준 하루 범위 → UTC ISO 문자열 (DB는 UTC naive로 저장)
  const ymd = dateStr ?? new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const start = new Date(ymd + 'T00:00:00+09:00');
  const end = new Date(ymd + 'T23:59:59.999+09:00');
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatTimeOnly(isoStr: string): string {
  try {
    let s = isoStr;
    if (s.includes('T') && !s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
    return new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return isoStr; }
}

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    UPLOAD_START: '업로드 시작', UPLOAD_COMPLETE: '업로드 완료', UPLOAD_REVIEW: '업로드 검토',
    UPLOAD_CONFIRM: '업로드 확정', UPLOAD_APPLY: '업로드 적용', UPLOAD_DELETE: '업로드 삭제',
    VOUCHER_CREATE: '전표 생성', VOUCHER_UPDATE: '전표 수정', VOUCHER_DELETE: '전표 삭제',
    VOUCHER_UPSERT: '전표 일괄처리', VOUCHER_LOCK: '전표 마감', VOUCHER_UNLOCK: '마감 해제',
    VOUCHER_BATCH_LOCK: '일괄 마감', VOUCHER_BATCH_UNLOCK: '일괄 마감 해제',
    RECEIPT_CREATE: '입금 등록', RECEIPT_DELETE: '입금 삭제',
    PAYMENT_CREATE: '지급 등록', PAYMENT_DELETE: '지급 삭제',
    TRANSACTION_CREATE: '입출금 생성', TRANSACTION_UPDATE: '입출금 수정',
    TRANSACTION_CANCEL: '입출금 취소', TRANSACTION_HOLD: '입출금 보류', TRANSACTION_HIDE: '입출금 숨김',
    ALLOCATION_CREATE: '배분 등록', ALLOCATION_DELETE: '배분 삭제', ALLOCATION_AUTO: '자동 배분',
    NETTING_CREATE: '상계 생성', NETTING_CONFIRM: '상계 확정', NETTING_CANCEL: '상계 취소',
    COUNTERPARTY_CREATE: '거래처 등록', COUNTERPARTY_UPDATE: '거래처 수정', COUNTERPARTY_DELETE: '거래처 삭제',
    COUNTERPARTY_BATCH_CREATE: '거래처 일괄 등록', COUNTERPARTY_BATCH_DELETE: '거래처 일괄 삭제',
    BANK_IMPORT_UPLOAD: '은행 임포트', BANK_IMPORT_CONFIRM: '은행 확정',
  };
  return map[action] ?? action.replace(/_/g, ' ').toLowerCase();
}

function getActionCategoryColor(action: string): string {
  for (const cat of DAILY_CATEGORIES) {
    if (cat.prefixes.some((p) => action.startsWith(p))) return cat.color;
  }
  return '#64748b';
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function SettlementDashboardPage() {
  const theme = useTheme();
  const router = useAppRouter();
  const user = useAuthStore((s) => s.user);
  const { date: today, str: todayStr } = useToday();

  const [data, setData] = useState<DashboardData | null>(null);
  const [topReceivables, setTopReceivables] = useState<TopItem[]>([]);
  const [topPayables, setTopPayables] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [latestSales, setLatestSales] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [latestPurchase, setLatestPurchase] = useState<any>(null);
  const [latestLoading, setLatestLoading] = useState(true);

  const [favorites, setFavorites] = useState<FavoriteCounterparty[]>([]);
  const [favLoading, setFavLoading] = useState(true);

  // 신규 KPI
  const [txnKpi, setTxnKpi] = useState<TransactionKpi | null>(null);
  const [nettingKpi, setNettingKpi] = useState<NettingKpi | null>(null);
  const [bankKpi, setBankKpi] = useState<BankImportKpi | null>(null);

  // 시작 가이드용 카운트
  const [counterpartyTotal, setCounterpartyTotal] = useState<number | null>(null);
  const [txnTotal, setTxnTotal] = useState<number | null>(null);
  const [guideDismissed, setGuideDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('settlement_guide_dismissed') === '1';
  });

  const handleDismissGuide = useCallback(() => {
    setGuideDismissed(true);
    localStorage.setItem('settlement_guide_dismissed', '1');
  }, []);

  // 오늘의 작업
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [compareSummary, setCompareSummary] = useState<DailySummary | null>(null);
  const [compareDate, setCompareDate] = useState('');
  const [dailyLoading, setDailyLoading] = useState(true);

  // ─── 데이터 로드 ────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, receivablesRes, payablesRes] = await Promise.all([
        settlementApi.getDashboardSummary(),
        settlementApi.getTopReceivables(5),
        settlementApi.getTopPayables(5),
      ]);
      setData(summaryRes.data as unknown as DashboardData);
      const rData = receivablesRes.data as unknown as { items: TopItem[] };
      const pData = payablesRes.data as unknown as { items: TopItem[] };
      setTopReceivables(rData?.items ?? []);
      setTopPayables(pData?.items ?? []);
    } catch {
      setError('대시보드 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLatestVersions = useCallback(async () => {
    try {
      setLatestLoading(true);
      const res = await settlementApi.listUploadJobs({ page_size: 20 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobs = (res.data as any).jobs || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const confirmed = jobs.filter((j: any) => j.is_confirmed);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sales = confirmed.filter((j: any) => j.job_type.toLowerCase().includes('sales'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => new Date(b.confirmed_at).getTime() - new Date(a.confirmed_at).getTime())[0] || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const purchase = confirmed.filter((j: any) => j.job_type.toLowerCase().includes('purchase'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => new Date(b.confirmed_at).getTime() - new Date(a.confirmed_at).getTime())[0] || null;
      setLatestSales(sales);
      setLatestPurchase(purchase);
    } catch { /* silent */ } finally {
      setLatestLoading(false);
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      setFavLoading(true);
      const [favRes, recRes, payRes] = await Promise.all([
        settlementApi.listCounterparties({ favorites_only: true, page_size: 50 }),
        settlementApi.getReceivables({ page: 1, page_size: 200 }),
        settlementApi.getPayables({ page: 1, page_size: 200 }),
      ]);

      const favList = ((favRes.data as unknown as { counterparties: Array<{ id: string; name: string }> }).counterparties) ?? [];

      const recMap = new Map<string, number>();
      const payMap = new Map<string, number>();

      const recResult = recRes.data as unknown as { receivables: Array<{ counterparty_id: string; balance: number }> };
      const payResult = payRes.data as unknown as { payables: Array<{ counterparty_id: string; balance: number }> };
      (recResult.receivables ?? []).forEach((r) => recMap.set(String(r.counterparty_id), Number(r.balance)));
      (payResult.payables ?? []).forEach((p) => payMap.set(String(p.counterparty_id), Number(p.balance)));

      setFavorites(favList.map((f) => ({
        id: f.id,
        name: f.name,
        receivable: recMap.get(f.id) ?? 0,
        payable: payMap.get(f.id) ?? 0,
      })));
    } catch { /* silent */ } finally {
      setFavLoading(false);
    }
  }, []);

  // ─── 신규 KPI 로드 ──────────────────────────────────────────────────────
  const loadNewKpis = useCallback(async () => {
    // 시작 가이드용 거래처/입출금 총 수
    try {
      const cpRes = await settlementApi.listCounterparties({ page_size: 1 });
      setCounterpartyTotal((cpRes.data as unknown as { total: number }).total ?? 0);
    } catch { setCounterpartyTotal(0); }

    try {
      // 미배분 입출금 KPI: PENDING + PARTIAL 건수/금액
      const txnRes = await settlementApi.listTransactions({ page_size: 1, status: 'pending' });
      const txnData = txnRes.data as unknown as { total: number; transactions: Array<{ amount: number }> };
      const txnRes2 = await settlementApi.listTransactions({ page_size: 1, status: 'partial' });
      const txnData2 = txnRes2.data as unknown as { total: number; transactions: Array<{ amount: number }> };

      // 입출금 전체 건수 (allocated 포함)
      const txnRes3 = await settlementApi.listTransactions({ page_size: 1 });
      const txnData3 = txnRes3.data as unknown as { total: number };
      setTxnTotal(txnData3.total ?? 0);

      setTxnKpi({
        pending_count: txnData.total || 0,
        pending_amount: 0,
        partial_count: txnData2.total || 0,
        partial_amount: 0,
      });
    } catch {
      setTxnKpi(null);
    }

    try {
      // 상계 KPI: DRAFT 건수/금액
      const netRes = await settlementApi.listNettings({ page_size: 1, status: 'draft' });
      const netData = netRes.data as unknown as { total: number };
      const netRes2 = await settlementApi.listNettings({ page_size: 1, status: 'confirmed' });
      const netData2 = netRes2.data as unknown as { total: number };
      setNettingKpi({
        draft_count: netData.total || 0,
        draft_amount: 0,
        confirmed_count: netData2.total || 0,
        confirmed_amount: 0,
      });
    } catch {
      setNettingKpi(null);
    }

    try {
      // 은행 임포트 KPI: REVIEWING 작업 수
      const bankRes = await settlementApi.listBankImportJobs({ page_size: 1, status: 'reviewing' });
      const bankData = bankRes.data as unknown as { total: number };
      setBankKpi({
        reviewing_count: bankData.total || 0,
        unmatched_lines: 0,
      });
    } catch {
      setBankKpi(null);
    }
  }, []);

  const loadDailySummary = useCallback(async (dateStr?: string) => {
    const { start, end } = getDayRange(dateStr);
    try {
      const res = await settlementApi.listActivityLogs({ start_date: start, end_date: end, page_size: 500 });
      const resData = res.data as unknown as { logs: ActivityLog[]; total: number };
      return aggregateLogs(resData.logs ?? []);
    } catch {
      return { voucher: 0, upload: 0, payment: 0, netting: 0, counterparty: 0, total: 0, recentLogs: [] } as DailySummary;
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadLatestVersions(); }, [loadLatestVersions]);
  useEffect(() => { loadFavorites(); }, [loadFavorites]);
  useEffect(() => { loadNewKpis(); }, [loadNewKpis]);
  useEffect(() => {
    setDailyLoading(true);
    loadDailySummary().then((s) => { setDailySummary(s); setDailyLoading(false); });
  }, [loadDailySummary]);
  useEffect(() => {
    if (!compareDate) { setCompareSummary(null); return; }
    loadDailySummary(compareDate).then(setCompareSummary);
  }, [compareDate, loadDailySummary]);

  const handleRefreshAll = () => {
    loadData(); loadLatestVersions(); loadFavorites(); loadNewKpis();
    setDailyLoading(true);
    loadDailySummary().then((s) => { setDailySummary(s); setDailyLoading(false); });
    if (compareDate) loadDailySummary(compareDate).then(setCompareSummary);
  };

  // ─── 파생 데이터 ────────────────────────────────────────────────────────

  const favSummary = useMemo(() => ({
    totalReceivable: favorites.reduce((s, f) => s + f.receivable, 0),
    totalPayable: favorites.reduce((s, f) => s + f.payable, 0),
  }), [favorites]);

  const receivableSum = useMemo(() => topReceivables.reduce((s, i) => s + i.amount, 0), [topReceivables]);
  const payableSum = useMemo(() => topPayables.reduce((s, i) => s + i.amount, 0), [topPayables]);

  // ─── PageHeader용 KPI 칩 (데이터 로드 후 렌더링) ─────────────────────────

  const kpiChips: React.ReactNode[] = !loading && data ? [
    <Chip
      key="rec"
      size="small"
      label={`미수 ${formatCompact(data.total_receivable)}`}
      sx={{
        height: 20, fontSize: '0.7rem', fontWeight: 700,
        bgcolor: alpha(theme.palette.error.main, 0.1),
        color: 'error.main',
        border: `1px solid ${alpha(theme.palette.error.main, 0.25)}`,
      }}
    />,
    <Chip
      key="pay"
      size="small"
      label={`미지급 ${formatCompact(data.total_payable)}`}
      sx={{
        height: 20, fontSize: '0.7rem', fontWeight: 700,
        bgcolor: alpha(theme.palette.warning.main, 0.1),
        color: 'warning.dark',
        border: `1px solid ${alpha(theme.palette.warning.main, 0.25)}`,
      }}
    />,
    <Chip
      key="settling"
      size="small"
      label={`정산중 ${data.settling_count}건`}
      sx={{
        height: 20, fontSize: '0.7rem', fontWeight: 700,
        bgcolor: alpha(theme.palette.info.main, 0.1),
        color: 'info.main',
        border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
      }}
    />,
    <Chip
      key="locked"
      size="small"
      label={`마감완료 ${data.locked_count}건`}
      sx={{
        height: 20, fontSize: '0.7rem', fontWeight: 700,
        bgcolor: alpha(theme.palette.success.main, 0.1),
        color: 'success.dark',
        border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
      }}
    />,
    ...((txnKpi && (txnKpi.pending_count + txnKpi.partial_count) > 0) ? [
      <Chip
        key="unalloc"
        size="small"
        label={`미배분 ${txnKpi.pending_count + txnKpi.partial_count}건`}
        sx={{
          height: 20, fontSize: '0.7rem', fontWeight: 700,
          bgcolor: alpha(theme.palette.info.main, 0.1),
          color: 'info.dark',
          border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
        }}
      />,
    ] : []),
  ] : [];

  // ─── 렌더링 ─────────────────────────────────────────────────────────────

  // 섹션 간 일관된 간격: AppPageContainer gap 대신 내부에서 직접 제어
  return (
    <AppPageContainer sx={{ gap: 0, overflow: 'auto', '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { borderRadius: 3, bgcolor: 'action.disabled' } }}>
      {/* ── 공통 PageHeader ─────────────────────────────────────────────────── */}
      <AppPageHeader
        icon={<SwapHorizIcon />}
        title="정산 대시보드"
        description={`${todayStr} · ${user?.name ?? '사용자'}님`}
        color="primary"
        highlight
        onRefresh={handleRefreshAll}
        loading={loading || latestLoading || favLoading}
        chips={kpiChips}
      />

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {/* ── 시작 가이드 ────────────────────────────────────────────────────── */}
      {(() => {
        const voucherTotal = (data?.open_sales_count ?? 0) + (data?.unpaid_purchase_count ?? 0) + (data?.settling_count ?? 0) + (data?.locked_count ?? 0);
        const txnTotalCount = txnTotal ?? 0;
        const cpTotal = counterpartyTotal ?? 0;
        const pendingUnalloc = (txnKpi?.pending_count ?? 0) + (txnKpi?.partial_count ?? 0);
        const allocationDone = txnTotalCount > 0 && pendingUnalloc === 0;

        const steps = [
          { label: '거래처 등록', done: cpTotal > 0, count: cpTotal, unit: '개', path: '/settlement/counterparties', desc: '거래처를 등록하면 전표와 입출금을 관리할 수 있습니다' },
          { label: '전표 업로드', done: voucherTotal > 0, count: voucherTotal, unit: '건', path: '/settlement/upload', desc: 'UPM 엑셀 파일을 업로드하여 매출/매입 전표를 등록하세요' },
          { label: '입출금 등록', done: txnTotalCount > 0, count: txnTotalCount, unit: '건', path: '/settlement/transactions', desc: '입금/출금 내역을 등록하여 전표에 배분할 준비를 하세요' },
          { label: '전표 배분', done: allocationDone, count: allocationDone ? txnTotalCount : pendingUnalloc, unit: allocationDone ? '건 완료' : '건 미배분', path: '/settlement/transactions', desc: '입출금을 전표에 배분하여 정산을 완료하세요' },
        ];
        const doneCount = steps.filter((s) => s.done).length;
        const allDone = doneCount === steps.length;
        const isReady = !loading && data !== null && counterpartyTotal !== null && txnKpi !== null;

        if (!isReady || allDone || guideDismissed) return null;

        return (
          <Paper
            elevation={0}
            sx={{
              mt: 2.5, p: 2.5, borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, ${alpha(theme.palette.info.main, 0.02)} 100%)`,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              <Box sx={{
                width: 32, height: 32, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.15)}`,
              }}>
                <RocketLaunchIcon sx={{ fontSize: 18, color: 'primary.main' }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={800} sx={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                  정산 시작 가이드
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  {doneCount}/{steps.length} 단계 완료
                </Typography>
              </Box>
              <Chip
                label={`${Math.round((doneCount / steps.length) * 100)}%`}
                size="small"
                color="primary"
                sx={{ fontWeight: 700, height: 24 }}
              />
              <Tooltip title="가이드 닫기">
                <IconButton size="small" onClick={handleDismissGuide} sx={{ ml: 0.5 }}>
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Stack>

            <Stack spacing={1}>
              {steps.map((step, idx) => (
                <Paper
                  key={idx}
                  elevation={0}
                  sx={{
                    p: 1.5, borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: step.done ? alpha(theme.palette.success.main, 0.3) : 'divider',
                    bgcolor: step.done ? alpha(theme.palette.success.main, 0.03) : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 1.5,
                  }}
                >
                  {step.done ? (
                    <CheckCircleIcon sx={{ fontSize: 22, color: 'success.main' }} />
                  ) : (
                    <UncheckedIcon sx={{ fontSize: 22, color: 'text.disabled' }} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2" fontWeight={step.done ? 600 : 700} sx={{ color: step.done ? 'text.secondary' : 'text.primary' }}>
                        {idx + 1}. {step.label}
                      </Typography>
                      <Chip
                        label={`${step.count}${step.unit}`}
                        size="small"
                        color={step.done ? 'success' : 'default'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    </Stack>
                    {!step.done && (
                      <Typography variant="caption" color="text.secondary">{step.desc}</Typography>
                    )}
                  </Box>
                  {!step.done && (
                    <Button
                      size="small"
                      variant="outlined"
                      endIcon={<ArrowForwardIcon sx={{ fontSize: '14px !important' }} />}
                      onClick={() => router.push(step.path)}
                      sx={{ flexShrink: 0, fontWeight: 600, fontSize: '0.75rem' }}
                    >
                      이동
                    </Button>
                  )}
                </Paper>
              ))}
            </Stack>

            <LinearProgress
              variant="determinate"
              value={(doneCount / steps.length) * 100}
              sx={{ mt: 2, borderRadius: 2, height: 6, bgcolor: alpha(theme.palette.primary.main, 0.08) }}
            />
          </Paper>
        );
      })()}

      {/* ── 내 즐겨찾기 현황 ────────────────────────────────────────────────── */}
      <Box sx={{ mt: 2.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{
              width: 32, height: 32, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: alpha(theme.palette.warning.main, 0.12),
              boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.warning.main, 0.15)}`,
            }}>
              <StarIcon sx={{ fontSize: 18, color: 'warning.main' }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={800} sx={{ lineHeight: 1.2, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>내 즐겨찾기 현황</Typography>
              {!favLoading && (
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                  {favorites.length}개 거래처 모니터링 중
                </Typography>
              )}
            </Box>
          </Stack>
          <Button
            size="small"
            endIcon={<ArrowForwardIcon />}
            onClick={() => router.push('/settlement/counterparties')}
            sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}
          >
            거래처 관리
          </Button>
        </Stack>

        {favLoading ? (
          <Stack direction="row" spacing={1.5} sx={{ overflowX: 'auto', pb: 1 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" width={200} height={96} sx={{ flexShrink: 0, borderRadius: 2 }} />
            ))}
          </Stack>
        ) : favorites.length === 0 ? (
          <Paper elevation={0} sx={{
            p: 3, borderRadius: 2, border: '1px dashed', borderColor: 'divider', textAlign: 'center',
            background: alpha(theme.palette.warning.main, 0.02),
          }}>
            <StarIcon sx={{ fontSize: 32, color: alpha(theme.palette.warning.main, 0.3), mb: 1 }} />
            <Typography variant="body2" fontWeight={600} gutterBottom>즐겨찾기 거래처가 없습니다</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              거래처 관리에서 자주 확인하는 거래처를 즐겨찾기에 추가해보세요.
            </Typography>
            <Button variant="outlined" size="small" onClick={() => router.push('/settlement/counterparties')}>
              거래처 관리로 이동
            </Button>
          </Paper>
        ) : (
          <Box>
            {/* 즐겨찾기 합계 배너 */}
            <Paper elevation={0} sx={{
              mb: 1.5, p: 1.5, borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
              background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.05)} 0%, transparent 100%)`,
            }}>
              <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Badge badgeContent={favorites.length} color="warning">
                    <StarIcon sx={{ color: 'warning.main', fontSize: 18 }} />
                  </Badge>
                  <Typography variant="caption" fontWeight={700} color="warning.dark">즐겨찾기 합계</Typography>
                </Stack>
                <Divider orientation="vertical" flexItem />
                <Stack direction="row" spacing={0.5} alignItems="baseline">
                  <Typography variant="caption" color="text.secondary">미수</Typography>
                  <Typography variant="body2" fontWeight={800} color="error.main">
                    {formatCompact(favSummary.totalReceivable)}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="baseline">
                  <Typography variant="caption" color="text.secondary">미지급</Typography>
                  <Typography variant="body2" fontWeight={800} color="warning.dark">
                    {formatCompact(favSummary.totalPayable)}
                  </Typography>
                </Stack>
                <Box sx={{ ml: 'auto' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    endIcon={<ArrowForwardIcon />}
                    onClick={() => router.push('/settlement/status')}
                    sx={{ fontWeight: 600, fontSize: '0.7rem', height: 26 }}
                  >
                    전체 현황 보기
                  </Button>
                </Box>
              </Stack>
            </Paper>

            {/* 즐겨찾기 카드 스크롤 */}
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { height: 4 }, '&::-webkit-scrollbar-thumb': { borderRadius: 2, bgcolor: 'divider' } }}
            >
              {favorites.map((fav) => {
                const hasReceivable = fav.receivable > 0;
                const hasPayable = fav.payable > 0;
                return (
                  <Paper
                    key={fav.id}
                    elevation={0}
                    onClick={() => router.push(`/settlement/counterparties/${fav.id}`)}
                    sx={{
                      flexShrink: 0, width: 200, p: 2, borderRadius: 2, cursor: 'pointer',
                      border: '1px solid', borderColor: 'divider',
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: theme.palette.warning.main,
                        boxShadow: `0 4px 16px ${alpha(theme.palette.warning.main, 0.12)}`,
                        transform: 'translateY(-1px)',
                      },
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                      <Avatar sx={{
                        width: 30, height: 30, fontSize: '0.7rem', flexShrink: 0,
                        bgcolor: getAvatarColor(fav.name),
                        boxShadow: `0 0 0 2px ${theme.palette.warning.main}`,
                      }}>
                        {getInitials(fav.name)}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={700} variant="caption" noWrap sx={{ display: 'block' }}>{fav.name}</Typography>
                        <StarIcon sx={{ fontSize: 10, color: 'warning.main' }} />
                      </Box>
                    </Stack>

                    <Stack spacing={0.5}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary">미수</Typography>
                        <Typography variant="caption" fontWeight={700}
                          color={hasReceivable ? 'error.main' : 'text.disabled'}>
                          {hasReceivable ? formatCompact(fav.receivable) : '—'}
                        </Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary">미지급</Typography>
                        <Typography variant="caption" fontWeight={700}
                          color={hasPayable ? 'warning.dark' : 'text.disabled'}>
                          {hasPayable ? formatCompact(fav.payable) : '—'}
                        </Typography>
                      </Stack>
                    </Stack>

                    {(hasReceivable || hasPayable) && (
                      <LinearProgress
                        variant="determinate"
                        value={hasReceivable ? Math.min((fav.receivable / (favSummary.totalReceivable || 1)) * 100 * favorites.length, 100) : 50}
                        color={hasReceivable ? 'error' : 'warning'}
                        sx={{ mt: 1, height: 2, borderRadius: 1, bgcolor: alpha(theme.palette.divider, 0.5) }}
                      />
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </Box>
        )}
      </Box>

      {/* ── 오늘의 작업 ──────────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          mt: 2.5, p: 2.5, borderRadius: 2,
          border: '1px solid', borderColor: 'divider',
        }}
      >
        {/* 헤더 */}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: alpha(theme.palette.info.main, 0.12),
            boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.info.main, 0.15)}`,
          }}>
            <TimelineIcon sx={{ fontSize: 18, color: 'info.main' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={800} sx={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
              오늘의 작업
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              {todayStr}{!dailyLoading && dailySummary ? ` · 총 ${dailySummary.total}건` : ''}
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <TextField
              type="date"
              size="small"
              label="비교 날짜"
              value={compareDate}
              onChange={(e) => setCompareDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: new Date().toISOString().split('T')[0] }}
              sx={{ width: 160, '& .MuiInputBase-root': { height: 32, fontSize: '0.8rem' }, '& .MuiInputLabel-root': { fontSize: '0.75rem' } }}
            />
            {compareDate && (
              <IconButton size="small" onClick={() => setCompareDate('')}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            )}
            <Button
              size="small"
              endIcon={<ArrowForwardIcon />}
              onClick={() => router.push('/settlement/activity')}
              sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem', ml: 1 }}
            >
              전체 내역
            </Button>
          </Stack>
        </Stack>

        {/* KPI 카드 */}
        {dailyLoading ? (
          <Stack direction="row" spacing={1.5}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={72} sx={{ flex: 1, borderRadius: 1.5 }} />
            ))}
          </Stack>
        ) : dailySummary && dailySummary.total === 0 && !compareDate ? (
          <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
            <TimelineIcon sx={{ fontSize: 36, opacity: 0.3, mb: 1 }} />
            <Typography variant="body2" fontWeight={600}>오늘 아직 작업 내역이 없습니다</Typography>
            <Typography variant="caption" color="text.secondary">작업을 시작하면 여기에 자동으로 기록됩니다.</Typography>
          </Box>
        ) : (
          <>
            <Grid container spacing={1.5} sx={{ mb: dailySummary?.recentLogs.length ? 2 : 0 }}>
              {DAILY_CATEGORIES.map((cat) => {
                const todayVal = dailySummary?.[cat.key] ?? 0;
                const compareVal = compareSummary?.[cat.key];
                const diff = compareVal !== undefined ? todayVal - compareVal : null;
                return (
                  <Grid item xs={6} sm={4} md key={cat.key}>
                    <Paper
                      elevation={0}
                      onClick={() => router.push(cat.path)}
                      sx={{
                        p: 1.5, borderRadius: 1.5, cursor: 'pointer',
                        border: '1px solid', borderColor: 'divider',
                        borderLeft: `3px solid ${cat.color}`,
                        transition: 'all 0.15s',
                        '&:hover': { borderColor: cat.color, boxShadow: `0 2px 8px ${alpha(cat.color, 0.15)}` },
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <Box sx={{ color: cat.color, display: 'flex' }}>{cat.icon}</Box>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">{cat.label}</Typography>
                      </Stack>
                      <Typography variant="h6" fontWeight={800} sx={{ fontSize: '1.1rem', lineHeight: 1.2 }}>
                        {todayVal}<Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>건</Typography>
                      </Typography>
                      {diff !== null && (
                        <Typography variant="caption" sx={{
                          fontWeight: 600,
                          color: diff > 0 ? 'success.main' : diff < 0 ? 'text.secondary' : 'text.disabled',
                        }}>
                          vs {compareVal}건 {diff > 0 ? `▲${diff}` : diff < 0 ? `▼${Math.abs(diff)}` : '='}
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>

            {/* 최근 작업 타임라인 */}
            {dailySummary && dailySummary.recentLogs.length > 0 && (
              <>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  최근 작업
                </Typography>
                <Stack spacing={0}>
                  {dailySummary.recentLogs.map((log) => (
                    <Box
                      key={log.id}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5,
                        py: 0.75, px: 1,
                        borderLeft: `3px solid ${getActionCategoryColor(log.action)}`,
                        borderRadius: '0 4px 4px 0',
                        '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.04) },
                      }}
                    >
                      <Avatar sx={{
                        width: 24, height: 24, fontSize: '0.6rem', flexShrink: 0,
                        bgcolor: getAvatarColor(log.user_name ?? 'System'),
                      }}>
                        {getInitials(log.user_name ?? 'SY')}
                      </Avatar>
                      <Chip
                        label={getActionLabel(log.action)}
                        size="small"
                        sx={{
                          height: 20, fontSize: '0.65rem', fontWeight: 700,
                          bgcolor: alpha(getActionCategoryColor(log.action), 0.1),
                          color: getActionCategoryColor(log.action),
                        }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap>
                        {log.description ?? ''}
                        {log.item_count > 1 && ` (${log.item_count}건)`}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, fontSize: '0.7rem' }}>
                        {formatTimeOnly(log.created_at)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
                {dailySummary.total > 5 && (
                  <Button
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                    onClick={() => router.push('/settlement/activity')}
                    sx={{ mt: 1, fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}
                  >
                    오늘 작업 내역 전체 보기 ({dailySummary.total}건)
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </Paper>

      {/* ── 운영 현황 + 최신 데이터 ─────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mt: 0.5 }}>
        {/* 운영 현황 */}
        <Grid item xs={12} md={7}>
          <AppSectionCard sx={{ p: 2, height: '100%', mb: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              <Box sx={{
                width: 32, height: 32, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.15)}`,
              }}>
                <BusinessCenterIcon sx={{ fontSize: 18, color: 'primary.main' }} />
              </Box>
              <Typography variant="subtitle1" fontWeight={800} sx={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>운영 현황</Typography>
            </Stack>

            <Grid container spacing={1.5}>
              {[
                { label: '미정산 판매', value: data?.open_sales_count ?? 0, icon: <ReceiptIcon />, color: theme.palette.error.main, path: '/settlement/vouchers', actionLabel: '전표 확인' },
                { label: '미지급 매입', value: data?.unpaid_purchase_count ?? 0, icon: <ShoppingCartIcon />, color: theme.palette.warning.main, path: '/settlement/vouchers', actionLabel: '전표 확인' },
                { label: '미배분 입출금', value: (txnKpi?.pending_count ?? 0) + (txnKpi?.partial_count ?? 0), icon: <DepositIcon />, color: theme.palette.info.main, path: '/settlement/transactions', actionLabel: '배분하기' },
                { label: '상계 대기', value: nettingKpi?.draft_count ?? 0, icon: <BalanceIcon />, color: '#7b1fa2', path: '/settlement/netting', actionLabel: '상계 확인' },
                { label: '은행 임포트 검수', value: bankKpi?.reviewing_count ?? 0, icon: <BankImportIcon />, color: '#00838f', path: '/settlement/bank-import', actionLabel: '검수하기' },
                { label: '미매칭 거래처', value: data?.unmatched_count ?? 0, icon: <AccountBalanceIcon />, color: theme.palette.warning.main, path: '/settlement/counterparties', actionLabel: '거래처 확인' },
              ].map((card) => {
                const hasIssue = card.value > 0;
                return (
                <Grid item xs={6} key={card.label}>
                  <Paper
                    elevation={0}
                    onClick={() => card.path && router.push(card.path)}
                    sx={{
                      p: 2, borderRadius: 2,
                      border: `1px solid ${alpha(card.color, hasIssue ? 0.35 : 0.15)}`,
                      borderLeft: hasIssue ? `3px solid ${card.color}` : undefined,
                      background: `linear-gradient(135deg, ${alpha(card.color, hasIssue ? 0.06 : 0.02)} 0%, transparent 100%)`,
                      cursor: card.path ? 'pointer' : 'default',
                      transition: 'all 0.15s',
                      '&:hover': card.path ? { boxShadow: `0 4px 12px ${alpha(card.color, 0.12)}`, transform: 'translateY(-1px)' } : {},
                    }}
                  >
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Box sx={{ color: card.color, '& svg': { fontSize: 18 } }}>{card.icon}</Box>
                      {card.path && <ArrowForwardIcon sx={{ fontSize: 13, color: 'text.disabled' }} />}
                    </Stack>
                    {loading ? (
                      <Skeleton width={36} height={28} />
                    ) : (
                      <Typography variant="h6" fontWeight={800} sx={{ color: hasIssue ? card.color : 'text.disabled', lineHeight: 1.2 }}>
                        {card.value}
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>건</Typography>
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      {card.label}
                    </Typography>
                    {!loading && hasIssue && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: card.color, fontWeight: 600, fontSize: '0.7rem' }}>
                        {card.actionLabel} →
                      </Typography>
                    )}
                    {!loading && !hasIssue && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'success.main', fontWeight: 600, fontSize: '0.7rem' }}>
                        완료
                      </Typography>
                    )}
                  </Paper>
                </Grid>
                );
              })}
            </Grid>
          </AppSectionCard>
        </Grid>

        {/* 최신 데이터 현황 */}
        <Grid item xs={12} md={5}>
          <AppSectionCard sx={{ p: 2, height: '100%', mb: 0 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Box sx={{
                  width: 32, height: 32, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: alpha(theme.palette.info.main, 0.12),
                  boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.info.main, 0.15)}`,
                }}>
                  <AccessTimeIcon sx={{ fontSize: 18, color: 'info.main' }} />
                </Box>
                <Typography variant="subtitle1" fontWeight={800} sx={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>최신 데이터</Typography>
              </Stack>
              <Tooltip title="새로고침">
                <span>
                  <IconButton size="small" onClick={loadLatestVersions} disabled={latestLoading}>
                    <RefreshIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>

            <Stack spacing={1.5}>
              {/* 판매 */}
              {latestLoading ? (
                <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2 }} />
              ) : latestSales ? (
                <Paper
                  elevation={0}
                  onClick={() => router.push('/settlement/upload/jobs')}
                  sx={{
                    p: 1.5, borderRadius: 2, cursor: 'pointer',
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
                    background: alpha(theme.palette.primary.main, 0.03),
                    transition: 'all 0.2s', '&:hover': { boxShadow: 2, borderColor: 'primary.main' },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                    <ReceiptIcon sx={{ fontSize: 13, color: 'primary.main' }} />
                    <Typography variant="caption" fontWeight={700} color="primary.main">판매 데이터 최신 버전</Typography>
                    <Chip label="확정" size="small" color="success" sx={{ height: 16, fontSize: '0.6rem', ml: 'auto' }} />
                  </Stack>
                  <Typography variant="body2" fontWeight={600} noWrap sx={{ mb: 0.5 }}>{latestSales.original_filename}</Typography>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Stack direction="row" alignItems="center" spacing={0.3}>
                      <AccessTimeIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                      <Typography variant="caption" color="text.secondary">{formatKST(latestSales.confirmed_at)}</Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={0.3}>
                      <PersonIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                      <Typography variant="caption" color="text.secondary">{latestSales.created_by_name || '—'}</Typography>
                    </Stack>
                  </Stack>
                </Paper>
              ) : (
                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px dashed', borderColor: 'divider', textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>확정된 판매 업로드가 없습니다</Typography>
                  <Button size="small" variant="outlined" onClick={() => router.push('/settlement/upload/sales')}>지금 업로드</Button>
                </Paper>
              )}

              {/* 매입 */}
              {latestLoading ? (
                <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2 }} />
              ) : latestPurchase ? (
                <Paper
                  elevation={0}
                  onClick={() => router.push('/settlement/upload/jobs')}
                  sx={{
                    p: 1.5, borderRadius: 2, cursor: 'pointer',
                    border: `1px solid ${alpha(theme.palette.secondary.main, 0.25)}`,
                    background: alpha(theme.palette.secondary.main, 0.03),
                    transition: 'all 0.2s', '&:hover': { boxShadow: 2, borderColor: 'secondary.main' },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                    <ShoppingCartIcon sx={{ fontSize: 13, color: 'secondary.main' }} />
                    <Typography variant="caption" fontWeight={700} color="secondary.main">매입 데이터 최신 버전</Typography>
                    <Chip label="확정" size="small" color="success" sx={{ height: 16, fontSize: '0.6rem', ml: 'auto' }} />
                  </Stack>
                  <Typography variant="body2" fontWeight={600} noWrap sx={{ mb: 0.5 }}>{latestPurchase.original_filename}</Typography>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Stack direction="row" alignItems="center" spacing={0.3}>
                      <AccessTimeIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                      <Typography variant="caption" color="text.secondary">{formatKST(latestPurchase.confirmed_at)}</Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={0.3}>
                      <PersonIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                      <Typography variant="caption" color="text.secondary">{latestPurchase.created_by_name || '—'}</Typography>
                    </Stack>
                  </Stack>
                </Paper>
              ) : (
                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px dashed', borderColor: 'divider', textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>확정된 매입 업로드가 없습니다</Typography>
                  <Button size="small" variant="outlined" onClick={() => router.push('/settlement/upload/purchase')}>지금 업로드</Button>
                </Paper>
              )}
            </Stack>
          </AppSectionCard>
        </Grid>
      </Grid>

      {/* ── 미수 / 미지급 Top 5 ──────────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mt: 0.5, pb: 2 }}>
        {/* 미수 Top 5 */}
        <Grid item xs={12} md={6}>
          <AppSectionCard sx={{ p: 0, mb: 0, overflow: 'hidden' }}>
            <Box sx={{
              px: 2, py: 1.5,
              background: `linear-gradient(90deg, ${alpha(theme.palette.error.main, 0.07)} 0%, transparent 100%)`,
              borderBottom: '1px solid', borderColor: 'divider',
            }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TrendingUpIcon sx={{ color: 'error.main', fontSize: 20 }} />
                  <Typography variant="subtitle1" fontWeight={800} sx={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>미수 상위 거래처</Typography>
                  <Chip label="Top 5" size="small" color="error" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                </Stack>
                <AppIconActionButton icon={<OpenInNewIcon />} tooltip="미수 현황 전체 보기"
                  onClick={() => router.push('/settlement/status')} />
              </Stack>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(theme.palette.error.main, 0.02) }}>
                    <TableCell sx={{ fontWeight: 700, width: 36, py: 0.75 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700, py: 0.75 }}>거래처</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, py: 0.75 }}>미수 잔액</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, width: 56, py: 0.75 }}>전표</TableCell>
                    <TableCell sx={{ width: 32, py: 0.75 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {[36, 140, 90, 48, 32].map((w, j) => (
                          <TableCell key={j} sx={{ py: 0.75 }}><Skeleton width={w} /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : topReceivables.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">미수 데이터가 없습니다</Typography>
                      </TableCell>
                    </TableRow>
                  ) : topReceivables.map((item, idx) => (
                    <TableRow
                      key={item.counterparty_id}
                      hover
                      sx={{ cursor: 'pointer', '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.03) } }}
                      onClick={() => router.push(`/settlement/counterparties/${item.counterparty_id}`)}
                    >
                      <TableCell sx={{ py: 0.75 }}>
                        <Box sx={{
                          width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: idx < 3 ? alpha(theme.palette.error.main, 0.12) : 'action.hover',
                          fontWeight: 700, fontSize: '0.65rem',
                          color: idx < 3 ? 'error.main' : 'text.secondary',
                        }}>
                          {idx + 1}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Avatar sx={{ width: 24, height: 24, fontSize: '0.6rem', bgcolor: getAvatarColor(item.counterparty_name) }}>
                            {getInitials(item.counterparty_name)}
                          </Avatar>
                          <Typography variant="body2" fontWeight={600}>{item.counterparty_name}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 0.75 }}>
                        <Typography variant="body2" fontWeight={700} color="error.main">{formatAmount(item.amount)}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 0.75 }}>
                        <Chip label={`${item.voucher_count}건`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.62rem' }} />
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <IconButton size="small" sx={{ color: 'text.disabled' }}>
                          <ViewIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {!loading && topReceivables.length > 0 && (
                  <TableFooter>
                    <TableRow sx={{
                      '& td': {
                        borderBottom: 'none',
                        fontWeight: 700,
                        fontSize: '0.8125rem',
                        bgcolor: theme.palette.mode === 'light' ? 'grey.50' : 'grey.900',
                        borderTop: '2px solid',
                        borderColor: 'divider',
                      },
                    }}>
                      <TableCell colSpan={2} sx={{ fontWeight: 700 }}>합계</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>{formatAmount(receivableSum)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </TableContainer>
          </AppSectionCard>
        </Grid>

        {/* 미지급 Top 5 */}
        <Grid item xs={12} md={6}>
          <AppSectionCard sx={{ p: 0, mb: 0, overflow: 'hidden' }}>
            <Box sx={{
              px: 2, py: 1.5,
              background: `linear-gradient(90deg, ${alpha(theme.palette.warning.main, 0.07)} 0%, transparent 100%)`,
              borderBottom: '1px solid', borderColor: 'divider',
            }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TrendingDownIcon sx={{ color: 'warning.main', fontSize: 20 }} />
                  <Typography variant="subtitle1" fontWeight={800} sx={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}>미지급 상위 거래처</Typography>
                  <Chip label="Top 5" size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                </Stack>
                <AppIconActionButton icon={<OpenInNewIcon />} tooltip="미지급 현황 전체 보기"
                  onClick={() => router.push('/settlement/status')} />
              </Stack>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(theme.palette.warning.main, 0.02) }}>
                    <TableCell sx={{ fontWeight: 700, width: 36, py: 0.75 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700, py: 0.75 }}>거래처</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, py: 0.75 }}>미지급 잔액</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, width: 56, py: 0.75 }}>전표</TableCell>
                    <TableCell sx={{ width: 32, py: 0.75 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {[36, 140, 90, 48, 32].map((w, j) => (
                          <TableCell key={j} sx={{ py: 0.75 }}><Skeleton width={w} /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : topPayables.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">미지급 데이터가 없습니다</Typography>
                      </TableCell>
                    </TableRow>
                  ) : topPayables.map((item, idx) => (
                    <TableRow
                      key={item.counterparty_id}
                      hover
                      sx={{ cursor: 'pointer', '&:hover': { bgcolor: alpha(theme.palette.warning.main, 0.03) } }}
                      onClick={() => router.push(`/settlement/counterparties/${item.counterparty_id}`)}
                    >
                      <TableCell sx={{ py: 0.75 }}>
                        <Box sx={{
                          width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: idx < 3 ? alpha(theme.palette.warning.main, 0.14) : 'action.hover',
                          fontWeight: 700, fontSize: '0.65rem',
                          color: idx < 3 ? 'warning.dark' : 'text.secondary',
                        }}>
                          {idx + 1}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Avatar sx={{ width: 24, height: 24, fontSize: '0.6rem', bgcolor: getAvatarColor(item.counterparty_name) }}>
                            {getInitials(item.counterparty_name)}
                          </Avatar>
                          <Typography variant="body2" fontWeight={600}>{item.counterparty_name}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 0.75 }}>
                        <Typography variant="body2" fontWeight={700} color="warning.dark">{formatAmount(item.amount)}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 0.75 }}>
                        <Chip label={`${item.voucher_count}건`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.62rem' }} />
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }}>
                        <IconButton size="small" sx={{ color: 'text.disabled' }}>
                          <ViewIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {!loading && topPayables.length > 0 && (
                  <TableFooter>
                    <TableRow sx={{
                      '& td': {
                        borderBottom: 'none',
                        fontWeight: 700,
                        fontSize: '0.8125rem',
                        bgcolor: theme.palette.mode === 'light' ? 'grey.50' : 'grey.900',
                        borderTop: '2px solid',
                        borderColor: 'divider',
                      },
                    }}>
                      <TableCell colSpan={2} sx={{ fontWeight: 700 }}>합계</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'warning.dark' }}>{formatAmount(payableSum)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </TableContainer>
          </AppSectionCard>
        </Grid>
      </Grid>
    </AppPageContainer>
  );
}
