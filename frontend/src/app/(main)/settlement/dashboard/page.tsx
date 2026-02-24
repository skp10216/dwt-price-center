'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Grid, Typography, Skeleton, Alert,
  Paper, Chip, alpha, useTheme, Stack, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow,
  IconButton, Tooltip, Button, Avatar, Divider, Badge,
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
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
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

const today = new Date();
const todayStr = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function SettlementDashboardPage() {
  const theme = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

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
    try {
      // 미배분 입출금 KPI: PENDING + PARTIAL 건수/금액
      const txnRes = await settlementApi.listTransactions({ page_size: 1, status: 'PENDING' });
      const txnData = txnRes.data as unknown as { total: number; transactions: Array<{ amount: number }> };
      const txnRes2 = await settlementApi.listTransactions({ page_size: 1, status: 'PARTIAL' });
      const txnData2 = txnRes2.data as unknown as { total: number; transactions: Array<{ amount: number }> };
      setTxnKpi({
        pending_count: txnData.total || 0,
        pending_amount: 0, // 서버 집계 필요 — 목록에서는 합계를 알 수 없으므로 건수 위주 표시
        partial_count: txnData2.total || 0,
        partial_amount: 0,
      });
    } catch {
      setTxnKpi(null);
    }

    try {
      // 상계 KPI: DRAFT 건수/금액
      const netRes = await settlementApi.listNettings({ page_size: 1, status: 'DRAFT' });
      const netData = netRes.data as unknown as { total: number };
      const netRes2 = await settlementApi.listNettings({ page_size: 1, status: 'CONFIRMED' });
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
      const bankRes = await settlementApi.listBankImportJobs({ page_size: 1, status: 'REVIEWING' });
      const bankData = bankRes.data as unknown as { total: number };
      setBankKpi({
        reviewing_count: bankData.total || 0,
        unmatched_lines: 0,
      });
    } catch {
      setBankKpi(null);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadLatestVersions(); }, [loadLatestVersions]);
  useEffect(() => { loadFavorites(); }, [loadFavorites]);
  useEffect(() => { loadNewKpis(); }, [loadNewKpis]);

  const handleRefreshAll = () => { loadData(); loadLatestVersions(); loadFavorites(); loadNewKpis(); };

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

  return (
    <AppPageContainer>
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

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── 내 즐겨찾기 현황 ────────────────────────────────────────────────── */}
      <Box sx={{ mb: 2 }}>
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

      {/* ── 운영 현황 + 최신 데이터 ─────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
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
                { label: '미정산 판매', value: data?.open_sales_count ?? 0, icon: <ReceiptIcon />, color: theme.palette.error.main, path: '/settlement/status' },
                { label: '미지급 매입', value: data?.unpaid_purchase_count ?? 0, icon: <ShoppingCartIcon />, color: theme.palette.warning.main, path: '/settlement/status' },
                { label: '미배분 입출금', value: (txnKpi?.pending_count ?? 0) + (txnKpi?.partial_count ?? 0), icon: <DepositIcon />, color: theme.palette.info.main, path: '/settlement/transactions' },
                { label: '상계 대기', value: nettingKpi?.draft_count ?? 0, icon: <BalanceIcon />, color: '#7b1fa2', path: '/settlement/netting' },
                { label: '은행 임포트 검수', value: bankKpi?.reviewing_count ?? 0, icon: <BankImportIcon />, color: '#00838f', path: '/settlement/bank-import' },
                { label: '미매칭 거래처', value: data?.unmatched_count ?? 0, icon: <AccountBalanceIcon />, color: theme.palette.text.secondary, path: '/settlement/counterparties' },
              ].map((card) => (
                <Grid item xs={6} key={card.label}>
                  <Paper
                    elevation={0}
                    onClick={() => card.path && router.push(card.path)}
                    sx={{
                      p: 2, borderRadius: 2,
                      border: `1px solid ${alpha(card.color, 0.2)}`,
                      background: `linear-gradient(135deg, ${alpha(card.color, 0.05)} 0%, transparent 100%)`,
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
                      <Typography variant="h6" fontWeight={800} sx={{ color: card.color, lineHeight: 1.2 }}>
                        {card.value}
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>건</Typography>
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      {card.label}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
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
      <Grid container spacing={2}>
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
