'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, Divider,
  Button, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, IconButton, Tooltip,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  alpha, useTheme, Skeleton, Alert, LinearProgress, Tabs, Tab,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Business as BusinessIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Receipt as ReceiptIcon,
  ShoppingCart as ShoppingCartIcon,
  Visibility as ViewIcon,
  LocalOffer as AliasIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  SwapHoriz as SwapHorizIcon,
  NavigateNext as NavigateNextIcon,
  Timeline as TimelineIcon,
  Info as InfoIcon,
  AccountBalanceWallet as WalletIcon,
} from '@mui/icons-material';
import { subMonths, format } from 'date-fns';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import TransactionCreateDialog from '@/components/settlement/TransactionCreateDialog';
import TimelineFilterBar, { type TimelineFilters } from './_components/TimelineFilterBar';
import TimelineSummaryStrip, { type TimelineSummaryData } from './_components/TimelineSummaryStrip';
import CounterpartyTimeline, { type TransactionItem } from './_components/CounterpartyTimeline';
import TransactionDetailDrawer from './_components/TransactionDetailDrawer';

// ─── Types ───────────────────────────────────────────────────────

interface CounterpartyDetail {
  id: string;
  name: string;
  code: string | null;
  counterparty_type: string;
  contact_info: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  aliases: Array<{ id: string; alias_name: string; created_at: string }>;
}

interface SummaryData {
  id: string;
  name: string;
  code: string | null;
  counterparty_type: string;
  total_sales_amount: number;
  total_purchase_amount: number;
  total_receivable: number;
  total_payable: number;
  voucher_count: number;
}

interface BalanceData {
  total_deposits: number;
  total_withdrawals: number;
  unallocated_deposits: number;
  unallocated_withdrawals: number;
}

interface VoucherRow {
  id: string;
  trade_date: string;
  voucher_number: string;
  voucher_type: string;
  quantity: number;
  total_amount: number;
  settlement_status: string;
  payment_status: string;
  balance: number;
}

// ─── Constants ───────────────────────────────────────────────────

const typeLabels: Record<string, string> = {
  seller: '매입처', buyer: '매출처', both: '매입/매출',
};

const BACK_TARGETS: Record<string, { label: string; path: string }> = {
  status: { label: '거래처 현황', path: '/settlement/status' },
  counterparties: { label: '거래처 관리', path: '/settlement/counterparties' },
};

const statusLabels: Record<string, { label: string; color: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  open: { label: '미정산', color: 'warning' },
  settling: { label: '정산중', color: 'info' },
  settled: { label: '정산완료', color: 'success' },
  locked: { label: '마감', color: 'default' },
  unpaid: { label: '미지급', color: 'error' },
  partial: { label: '부분지급', color: 'warning' },
  paid: { label: '지급완료', color: 'success' },
};

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount);

const DEFAULT_FILTERS: TimelineFilters = {
  dateFrom: format(subMonths(new Date(), 3), 'yyyy-MM-dd'),
  dateTo: format(new Date(), 'yyyy-MM-dd'),
  transactionType: 'all',
  statuses: [],
  search: '',
};

// ─── Page Component ──────────────────────────────────────────────

export default function CounterpartyDetailPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const counterpartyId = params.id as string;

  const fromParam = searchParams.get('from') || '';
  const backTarget = BACK_TARGETS[fromParam] || BACK_TARGETS.counterparties;
  const handleBack = () => router.push(backTarget.path);

  // ─── Core state ────────────────────────────────────────────────
  const [detail, setDetail] = useState<CounterpartyDetail | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Tab state ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0);

  // ─── Timeline state ────────────────────────────────────────────
  const [timelineFilters, setTimelineFilters] = useState<TimelineFilters>(DEFAULT_FILTERS);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
  const [txnCreateOpen, setTxnCreateOpen] = useState(false);

  // ─── Voucher state ─────────────────────────────────────────────
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [voucherTotal, setVoucherTotal] = useState(0);
  const [vPage, setVPage] = useState(0);
  const [vPageSize, setVPageSize] = useState(10);

  // ─── Alias state ───────────────────────────────────────────────
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [newAlias, setNewAlias] = useState('');

  // ─── API: 기본 정보 + 요약 + 잔액 ────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [detailRes, summaryRes, balanceRes] = await Promise.all([
        settlementApi.getCounterparty(counterpartyId),
        settlementApi.getCounterpartySummary(counterpartyId),
        settlementApi.getCounterpartyBalance(counterpartyId),
      ]);
      setDetail(detailRes.data as unknown as CounterpartyDetail);
      setSummary(summaryRes.data as unknown as SummaryData);
      setBalance(balanceRes.data as unknown as BalanceData);
    } catch {
      setError('거래처 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [counterpartyId]);

  // ─── API: 입출금 타임라인 (범용 거래 API 활용) ──────────────────
  const loadTransactions = useCallback(async (page: number, append = false) => {
    setTimelineLoading(true);
    try {
      const apiParams: Record<string, unknown> = {
        counterparty_id: counterpartyId,
        page,
        page_size: 20,
      };
      if (timelineFilters.dateFrom) apiParams.date_from = timelineFilters.dateFrom;
      if (timelineFilters.dateTo) apiParams.date_to = timelineFilters.dateTo;
      if (timelineFilters.transactionType !== 'all') apiParams.transaction_type = timelineFilters.transactionType;
      if (timelineFilters.statuses.length > 0) apiParams.status = timelineFilters.statuses.join(',');
      if (timelineFilters.search) apiParams.search = timelineFilters.search;

      const res = await settlementApi.listTransactions(apiParams);
      const data = res.data as unknown as { transactions: TransactionItem[]; total: number };
      setTransactions((prev) => append ? [...prev, ...(data.transactions || [])] : (data.transactions || []));
      setTimelineTotal(data.total || 0);
    } catch {
      if (!append) setTransactions([]);
    } finally {
      setTimelineLoading(false);
    }
  }, [counterpartyId, timelineFilters]);

  // ─── API: 전표 목록 ───────────────────────────────────────────
  const loadVouchers = useCallback(async () => {
    try {
      const res = await settlementApi.listVouchers({
        counterparty_id: counterpartyId,
        page: vPage + 1,
        page_size: vPageSize,
      });
      const data = res.data as unknown as { vouchers: VoucherRow[]; total: number };
      setVouchers(data.vouchers || []);
      setVoucherTotal(data.total || 0);
    } catch {
      // handled
    }
  }, [counterpartyId, vPage, vPageSize]);

  // ─── Effects ───────────────────────────────────────────────────
  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    setTimelinePage(1);
    loadTransactions(1, false);
  }, [loadTransactions]);

  useEffect(() => { loadVouchers(); }, [loadVouchers]);

  const handleLoadMore = () => {
    const nextPage = timelinePage + 1;
    setTimelinePage(nextPage);
    loadTransactions(nextPage, true);
  };

  const handleFilterChange = (newFilters: TimelineFilters) => {
    setTimelineFilters(newFilters);
  };

  // ─── Timeline summary 계산 ─────────────────────────────────────
  const timelineSummary = useMemo<TimelineSummaryData | null>(() => {
    if (transactions.length === 0 && !timelineLoading) {
      return { totalDeposits: 0, totalWithdrawals: 0, depositCount: 0, withdrawalCount: 0, unallocatedDeposits: 0, unallocatedWithdrawals: 0 };
    }
    if (transactions.length === 0) return null;

    let totalDeposits = 0, totalWithdrawals = 0, depositCount = 0, withdrawalCount = 0;
    let unallocatedDeposits = 0, unallocatedWithdrawals = 0;
    for (const t of transactions) {
      if (t.transaction_type === 'deposit') {
        totalDeposits += t.amount;
        depositCount++;
        unallocatedDeposits += t.unallocated_amount;
      } else {
        totalWithdrawals += t.amount;
        withdrawalCount++;
        unallocatedWithdrawals += t.unallocated_amount;
      }
    }
    return { totalDeposits, totalWithdrawals, depositCount, withdrawalCount, unallocatedDeposits, unallocatedWithdrawals };
  }, [transactions, timelineLoading]);

  // ─── Alias handlers ────────────────────────────────────────────
  const handleAddAlias = async () => {
    if (!newAlias.trim()) return;
    try {
      await settlementApi.createCounterpartyAlias(counterpartyId, newAlias.trim());
      enqueueSnackbar('별칭이 추가되었습니다', { variant: 'success' });
      setNewAlias('');
      loadData();
    } catch {
      enqueueSnackbar('별칭 추가에 실패했습니다', { variant: 'error' });
    }
  };

  const handleDeleteAlias = async (aliasId: string) => {
    try {
      await settlementApi.deleteCounterpartyAlias(counterpartyId, aliasId);
      enqueueSnackbar('별칭이 삭제되었습니다', { variant: 'success' });
      loadData();
    } catch {
      enqueueSnackbar('별칭 삭제에 실패했습니다', { variant: 'error' });
    }
  };

  // ─── Loading / Error ───────────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton width={300} height={40} />
        <Grid container spacing={3} sx={{ mt: 2 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={300} sx={{ mt: 3 }} />
      </Box>
    );
  }

  if (error || !detail) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || '거래처를 찾을 수 없습니다.'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mt: 2 }}>
          {backTarget.label}으로 돌아가기
        </Button>
      </Box>
    );
  }

  const receivableRate = summary && summary.total_sales_amount > 0
    ? ((summary.total_receivable / summary.total_sales_amount) * 100) : 0;
  const payableRate = summary && summary.total_purchase_amount > 0
    ? ((summary.total_payable / summary.total_purchase_amount) * 100) : 0;

  return (
    <Box>
      {/* ─── 브레드크럼 ─────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <IconButton size="small" onClick={handleBack} sx={{ color: 'primary.main' }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography
          variant="body2" color="primary.main"
          sx={{ cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
          onClick={handleBack}
        >
          {backTarget.label}
        </Typography>
        <NavigateNextIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
        <Typography variant="body2" color="text.primary" fontWeight={600}>{detail.name}</Typography>
      </Box>

      {/* ─── 헤더 ────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <BusinessIcon sx={{ fontSize: 28, color: 'info.main' }} />
            <Typography variant="h5" fontWeight={700}>{detail.name}</Typography>
            <Chip
              label={typeLabels[detail.counterparty_type] || detail.counterparty_type}
              size="small" variant="outlined" color="info"
            />
            {!detail.is_active && <Chip label="비활성" size="small" color="default" />}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 5.5 }}>
            {detail.code ? `코드: ${detail.code}` : ''}
            {detail.contact_info ? ` · ${detail.contact_info}` : ''}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained" size="small"
            startIcon={<AddIcon />}
            onClick={() => setTxnCreateOpen(true)}
          >
            입출금 등록
          </Button>
          <Button
            variant="outlined" size="small"
            startIcon={<AliasIcon />}
            onClick={() => setAliasDialogOpen(true)}
          >
            별칭 ({detail.aliases.length})
          </Button>
        </Stack>
      </Box>

      {/* ─── 요약 카드 (6열: 미수/미지급/총매출/총매입/미배분입금/미배분출금) ─── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2}>
          <Card elevation={0} sx={{
            borderRadius: 2, border: '1px solid',
            borderColor: alpha(theme.palette.error.main, 0.2),
            bgcolor: alpha(theme.palette.error.main, 0.04), height: '100%',
          }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                <TrendingUpIcon sx={{ color: 'error.main', fontSize: 16 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={500}>미수 잔액</Typography>
              </Stack>
              <Typography variant="subtitle1" fontWeight={700} color="error.main">
                {formatAmount(summary?.total_receivable ?? 0)}
              </Typography>
              <LinearProgress
                variant="determinate" value={Math.min(receivableRate, 100)}
                color="error" sx={{ height: 4, borderRadius: 2, mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <Card elevation={0} sx={{
            borderRadius: 2, border: '1px solid',
            borderColor: alpha(theme.palette.warning.main, 0.2),
            bgcolor: alpha(theme.palette.warning.main, 0.04), height: '100%',
          }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                <TrendingDownIcon sx={{ color: 'warning.main', fontSize: 16 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={500}>미지급 잔액</Typography>
              </Stack>
              <Typography variant="subtitle1" fontWeight={700} color="warning.main">
                {formatAmount(summary?.total_payable ?? 0)}
              </Typography>
              <LinearProgress
                variant="determinate" value={Math.min(payableRate, 100)}
                color="warning" sx={{ height: 4, borderRadius: 2, mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <Card elevation={0} sx={{
            borderRadius: 2, border: '1px solid',
            borderColor: alpha(theme.palette.info.main, 0.15),
            bgcolor: alpha(theme.palette.info.main, 0.03), height: '100%',
          }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                <ReceiptIcon sx={{ color: 'info.main', fontSize: 16 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={500}>총 매출액</Typography>
              </Stack>
              <Typography variant="subtitle1" fontWeight={700} color="info.main">
                {formatAmount(summary?.total_sales_amount ?? 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <Card elevation={0} sx={{
            borderRadius: 2, border: '1px solid',
            borderColor: alpha(theme.palette.success.main, 0.15),
            bgcolor: alpha(theme.palette.success.main, 0.03), height: '100%',
          }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                <ShoppingCartIcon sx={{ color: 'success.main', fontSize: 16 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={500}>총 매입액</Typography>
              </Stack>
              <Typography variant="subtitle1" fontWeight={700} color="success.main">
                {formatAmount(summary?.total_purchase_amount ?? 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <Card elevation={0} sx={{
            borderRadius: 2, border: '1px solid',
            borderColor: alpha(theme.palette.info.main, 0.12),
            bgcolor: alpha(theme.palette.info.main, 0.02), height: '100%',
          }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                <WalletIcon sx={{ color: 'info.main', fontSize: 16 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={500}>미배분 입금</Typography>
              </Stack>
              <Typography variant="subtitle1" fontWeight={700} color="info.main">
                {formatAmount(balance?.unallocated_deposits ?? 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <Card elevation={0} sx={{
            borderRadius: 2, border: '1px solid',
            borderColor: alpha(theme.palette.error.main, 0.12),
            bgcolor: alpha(theme.palette.error.main, 0.02), height: '100%',
          }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                <WalletIcon sx={{ color: 'error.main', fontSize: 16 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={500}>미배분 출금</Typography>
              </Stack>
              <Typography variant="subtitle1" fontWeight={700} color="error.main">
                {formatAmount(balance?.unallocated_withdrawals ?? 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ─── 탭: 입출금 타임라인 / 전표 이력 / 기본 정보 ──── */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab
              label={`입출금 타임라인 (${timelineTotal})`}
              icon={<TimelineIcon />} iconPosition="start"
              sx={{ minHeight: 48, fontWeight: activeTab === 0 ? 700 : 400 }}
            />
            <Tab
              label={`전표 이력 (${voucherTotal})`}
              icon={<ReceiptIcon />} iconPosition="start"
              sx={{ minHeight: 48, fontWeight: activeTab === 1 ? 700 : 400 }}
            />
            <Tab
              label="기본 정보"
              icon={<InfoIcon />} iconPosition="start"
              sx={{ minHeight: 48, fontWeight: activeTab === 2 ? 700 : 400 }}
            />
          </Tabs>
        </Box>

        {/* ── 탭 0: 입출금 타임라인 (메인) ───────────────── */}
        {activeTab === 0 && (
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 필터 바 */}
            <TimelineFilterBar filters={timelineFilters} onChange={handleFilterChange} />

            {/* 기간 요약 스트립 */}
            <TimelineSummaryStrip data={timelineSummary} loading={timelineLoading && transactions.length === 0} />

            <Divider />

            {/* MUI Timeline */}
            <CounterpartyTimeline
              transactions={transactions}
              total={timelineTotal}
              loading={timelineLoading}
              onLoadMore={handleLoadMore}
              onItemClick={(id) => setSelectedTxnId(id)}
            />
          </Box>
        )}

        {/* ── 탭 1: 전표 이력 ─────────────────────────────── */}
        {activeTab === 1 && (
          <>
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>일자</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>전표번호</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>유형</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>수량</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>금액</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>잔액</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>정산</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>지급</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, width: 50 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vouchers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                        <ReceiptIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography color="text.secondary">전표가 없습니다</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    vouchers.map((v) => {
                      const sStatus = statusLabels[v.settlement_status] || { label: v.settlement_status, color: 'default' as const };
                      const pStatus = statusLabels[v.payment_status] || { label: v.payment_status, color: 'default' as const };
                      return (
                        <TableRow
                          key={v.id} hover sx={{ cursor: 'pointer' }}
                          onClick={() => router.push(`/settlement/vouchers/${v.id}`)}
                        >
                          <TableCell>{v.trade_date}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{v.voucher_number}</TableCell>
                          <TableCell>
                            <Chip
                              label={v.voucher_type === 'sales' ? '판매' : '매입'}
                              size="small" variant="outlined"
                              color={v.voucher_type === 'sales' ? 'info' : 'success'}
                            />
                          </TableCell>
                          <TableCell align="right">{v.quantity}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {new Intl.NumberFormat('ko-KR').format(v.total_amount)}
                          </TableCell>
                          <TableCell align="right" sx={{
                            fontWeight: 600,
                            color: v.balance > 0 ? 'error.main' : 'success.main',
                          }}>
                            {new Intl.NumberFormat('ko-KR').format(v.balance)}
                          </TableCell>
                          <TableCell align="center">
                            <Chip label={sStatus.label} size="small" color={sStatus.color} variant="outlined" />
                          </TableCell>
                          <TableCell align="center">
                            <Chip label={pStatus.label} size="small" color={pStatus.color} variant="outlined" />
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="전표 상세">
                              <IconButton size="small"><ViewIcon fontSize="small" /></IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            {voucherTotal > 0 && (
              <TablePagination
                component="div" count={voucherTotal} page={vPage}
                onPageChange={(_, p) => setVPage(p)}
                rowsPerPage={vPageSize}
                onRowsPerPageChange={(e) => { setVPageSize(parseInt(e.target.value, 10)); setVPage(0); }}
                rowsPerPageOptions={[5, 10, 25]}
                labelRowsPerPage="페이지당 행:"
              />
            )}
          </>
        )}

        {/* ── 탭 2: 기본 정보 ─────────────────────────────── */}
        {activeTab === 2 && (
          <Box sx={{ p: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">거래처명</Typography>
                <Typography variant="body1" fontWeight={600}>{detail.name}</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">거래처 코드</Typography>
                <Typography variant="body1">{detail.code || '-'}</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">유형</Typography>
                <Typography variant="body1">{typeLabels[detail.counterparty_type] || detail.counterparty_type}</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">연락처</Typography>
                <Typography variant="body1">{detail.contact_info || '-'}</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">전표 수</Typography>
                <Typography variant="body1" fontWeight={600}>{summary?.voucher_count ?? 0}건</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">등록 별칭</Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                  {detail.aliases.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">없음</Typography>
                  ) : (
                    detail.aliases.map((a) => (
                      <Chip key={a.id} label={a.alias_name} size="small" variant="outlined" color="info" />
                    ))
                  )}
                </Stack>
              </Grid>
              {detail.memo && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">메모</Typography>
                  <Typography variant="body2">{detail.memo}</Typography>
                </Grid>
              )}
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">등록일</Typography>
                <Typography variant="body2">{new Date(detail.created_at).toLocaleDateString('ko-KR')}</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">수정일</Typography>
                <Typography variant="body2">{new Date(detail.updated_at).toLocaleDateString('ko-KR')}</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">활성 상태</Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Chip
                    label={detail.is_active ? '활성' : '비활성'}
                    size="small"
                    color={detail.is_active ? 'success' : 'default'}
                    variant="outlined"
                  />
                </Box>
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>

      {/* ─── 입출금 상세 Drawer ────────────────────────────── */}
      <TransactionDetailDrawer
        transactionId={selectedTxnId}
        onClose={() => setSelectedTxnId(null)}
      />

      {/* ─── 입출금 등록 다이얼로그 ──────────────────────── */}
      <TransactionCreateDialog
        open={txnCreateOpen}
        onClose={() => setTxnCreateOpen(false)}
        onCreated={() => { loadTransactions(1, false); loadData(); }}
        counterpartyId={counterpartyId}
        counterpartyName={detail.name}
      />

      {/* ─── 별칭 관리 다이얼로그 ────────────────────────── */}
      <Dialog open={aliasDialogOpen} onClose={() => setAliasDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AliasIcon color="info" />
            <span>별칭 관리 — {detail.name}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
            UPM에서 동일 거래처가 다른 이름으로 표기될 경우, 별칭을 등록하면 업로드 시 자동 매칭됩니다.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small" placeholder="새 별칭 입력"
              value={newAlias} onChange={(e) => setNewAlias(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
              fullWidth
            />
            <Button variant="contained" size="small" onClick={handleAddAlias} disabled={!newAlias.trim()}>
              추가
            </Button>
          </Stack>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={1}>
            {detail.aliases.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                등록된 별칭이 없습니다.
              </Typography>
            ) : (
              detail.aliases.map((a) => (
                <Stack key={a.id} direction="row" alignItems="center" justifyContent="space-between"
                  sx={{ p: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip label={a.alias_name} variant="outlined" color="info" />
                    <Typography variant="caption" color="text.disabled">
                      {new Date(a.created_at).toLocaleDateString('ko-KR')}
                    </Typography>
                  </Stack>
                  <IconButton size="small" color="error" onClick={() => handleDeleteAlias(a.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAliasDialogOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
