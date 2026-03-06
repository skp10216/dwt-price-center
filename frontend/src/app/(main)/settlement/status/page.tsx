'use client';

/**
 * 거래처 현황 페이지 (미수/미지급 통합)
 * 즐겨찾기 기반 필터 + 탭으로 판매(미수)/매입(미지급) 현황 전환
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Stack, Tab, Tabs, TableCell,
  TextField, InputAdornment, Chip, IconButton, Tooltip, LinearProgress,
  alpha, useTheme, Avatar, ToggleButtonGroup, ToggleButton,
  Divider, Button, CircularProgress,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import {
  Search as SearchIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Business as BusinessIcon,
  Visibility as VisibilityIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  FilterList as FilterListIcon,
  ReceiptLong as ReceiptLongIcon,
  CallReceived as CallReceivedIcon,
  CallMade as CallMadeIcon,
  ArrowForward as ArrowForwardIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { useAppRouter } from '@/lib/navigation';
import {
  AppPageContainer,
  AppPageHeader,
  AppSectionCard,
  AppPageToolbar,
  AppDataTable,
  type AppColumnDef,
} from '@/components/ui';

// ─── 타입 ───
interface CounterpartyStatus {
  id: string;
  name: string;
  type: string;
  total_vouchers: number;
  total_amount: number;
  paid_amount: number;
  balance: number;
  last_transaction_date: string | null;
  is_favorite: boolean;
}

interface OverviewSummary {
  totalSales: number;
  totalDeposit: number;
  totalReceivable: number;
  totalPurchase: number;
  totalWithdrawal: number;
  totalPayable: number;
}

type TabValue = 'receivables' | 'payables';

// ─── 유틸리티 ───
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
const formatNumber = (n: number) => new Intl.NumberFormat('ko-KR').format(n);
const formatDate = (dateStr: string | null) =>
  dateStr ? new Date(dateStr).toLocaleDateString('ko-KR') : '—';

function getAvatarColor(name: string): string {
  const colors = ['#1976d2', '#388e3c', '#d32f2f', '#7b1fa2', '#1565c0', '#00838f', '#ef6c00', '#5d4037', '#455a64', '#6a1b9a'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const TABULAR_NUMS_SX = { fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' };

// ─── 날짜 프리셋 ───
const DATE_PRESETS = [
  { value: 'all', label: '전체' },
  { value: 'today', label: '오늘' },
  { value: 'week', label: '7일' },
  { value: 'thisMonth', label: '이번달' },
  { value: 'lastMonth', label: '지난달' },
  { value: 'custom', label: '커스텀' },
] as const;

function getDateRange(preset: string): { from: string; to: string } | null {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case 'today': return { from: fmt(now), to: fmt(now) };
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


export default function CounterpartyStatusPage() {
  const theme = useTheme();
  const router = useAppRouter();
  const { enqueueSnackbar } = useSnackbar();

  const [tab, setTab] = useState<TabValue>('receivables');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CounterpartyStatus[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  // 날짜 필터
  const [datePreset, setDatePreset] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const handlePreset = (preset: string) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setDateFrom(''); setDateTo('');
    } else if (preset !== 'custom') {
      const range = getDateRange(preset);
      if (range) { setDateFrom(range.from); setDateTo(range.to); }
    }
    setPage(0);
  };

  const handleMonthNav = (delta: number) => {
    const baseDate = dateFrom ? new Date(dateFrom) : new Date();
    const newMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + delta, 1);
    const endOfMonth = new Date(newMonth.getFullYear(), newMonth.getMonth() + 1, 0);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    setDatePreset('custom');
    setDateFrom(fmt(newMonth));
    setDateTo(fmt(endOfMonth));
    setPage(0);
  };

  const periodLabel = useMemo(() => {
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
        return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
      }
      return `${dateFrom} ~ ${dateTo}`;
    }
    return null;
  }, [dateFrom, dateTo]);

  // 전체 요약 (양쪽 탭 합산)
  const [overview, setOverview] = useState<OverviewSummary>({
    totalSales: 0, totalDeposit: 0, totalReceivable: 0,
    totalPurchase: 0, totalWithdrawal: 0, totalPayable: 0,
  });

  // ─── 즐겨찾기 목록 로드 ───
  const loadFavorites = useCallback(async () => {
    try {
      const res = await settlementApi.listCounterparties({ favorites_only: true, page_size: 200 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = (res.data as any).counterparties as Array<{ id: string }>;
      setFavoriteIds(new Set(list.map((c) => c.id)));
    } catch { /* silent */ }
  }, []);

  // ─── 전체 요약 로드 (양쪽 동시) ───
  const loadOverview = useCallback(async () => {
    try {
      const dateParams: Record<string, unknown> = {};
      if (dateFrom) dateParams.date_from = dateFrom;
      if (dateTo) dateParams.date_to = dateTo;

      const [recRes, payRes] = await Promise.all([
        settlementApi.getReceivables({ page: 1, page_size: 200, include_zero_balance: true, ...dateParams }),
        settlementApi.getPayables({ page: 1, page_size: 200, include_zero_balance: true, ...dateParams }),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec = (recRes.data as any).receivables || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pay = (payRes.data as any).payables || [];

      setOverview({
        totalSales: rec.reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount), 0),
        totalDeposit: rec.reduce((s: number, r: { total_received: number }) => s + Number(r.total_received), 0),
        totalReceivable: rec.reduce((s: number, r: { balance: number }) => s + Number(r.balance), 0),
        totalPurchase: pay.reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount), 0),
        totalWithdrawal: pay.reduce((s: number, r: { total_paid: number }) => s + Number(r.total_paid), 0),
        totalPayable: pay.reduce((s: number, r: { balance: number }) => s + Number(r.balance), 0),
      });
    } catch { /* silent */ }
  }, [dateFrom, dateTo]);

  // ─── 거래처 현황 로드 (현재 탭) ───
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = { page: 1, page_size: 200, include_zero_balance: true };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (tab === 'receivables') {
        const res = await settlementApi.getReceivables(params);
        const result = res.data as unknown as {
          receivables: Array<{
            counterparty_id: string;
            counterparty_name: string;
            total_amount: number;
            total_received: number;
            balance: number;
            voucher_count: number;
          }>;
        };
        setData((result.receivables || []).map((item) => ({
          id: String(item.counterparty_id),
          name: item.counterparty_name,
          type: 'customer',
          total_vouchers: item.voucher_count,
          total_amount: Number(item.total_amount),
          paid_amount: Number(item.total_received),
          balance: Number(item.balance),
          last_transaction_date: null,
          is_favorite: false,
        })));
      } else {
        const res = await settlementApi.getPayables(params);
        const result = res.data as unknown as {
          payables: Array<{
            counterparty_id: string;
            counterparty_name: string;
            total_amount: number;
            total_paid: number;
            balance: number;
            voucher_count: number;
          }>;
        };
        setData((result.payables || []).map((item) => ({
          id: String(item.counterparty_id),
          name: item.counterparty_name,
          type: 'vendor',
          total_vouchers: item.voucher_count,
          total_amount: Number(item.total_amount),
          paid_amount: Number(item.total_paid),
          balance: Number(item.balance),
          last_transaction_date: null,
          is_favorite: false,
        })));
      }
    } catch {
      enqueueSnackbar('데이터 로드에 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [tab, dateFrom, dateTo, enqueueSnackbar]);

  useEffect(() => { loadFavorites(); loadOverview(); }, [loadFavorites, loadOverview]);
  useEffect(() => { loadData(); }, [loadData]);

  // ─── 즐겨찾기 토글 ───
  const handleToggleFavorite = async (row: CounterpartyStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !favoriteIds.has(row.id);
    setFavoriteIds((prev) => {
      const s = new Set(prev);
      next ? s.add(row.id) : s.delete(row.id);
      return s;
    });
    try {
      await settlementApi.toggleCounterpartyFavorite(row.id);
      enqueueSnackbar(
        next ? `"${row.name}" 즐겨찾기 추가` : `"${row.name}" 즐겨찾기 해제`,
        { variant: 'success', autoHideDuration: 1500 }
      );
    } catch {
      setFavoriteIds((prev) => {
        const s = new Set(prev);
        next ? s.delete(row.id) : s.add(row.id);
        return s;
      });
      enqueueSnackbar('즐겨찾기 변경에 실패했습니다', { variant: 'error' });
    }
  };

  const handleRefresh = () => { loadData(); loadFavorites(); loadOverview(); };

  // ─── 엑셀 다운로드 (업체 전달용 전문 양식) ───
  const [excelLoading, setExcelLoading] = useState(false);
  const handleExcelDownload = async () => {
    setExcelLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (searchQuery) params.search = searchQuery;

      const res = isReceivables
        ? await settlementApi.exportReceivablesExcel(params)
        : await settlementApi.exportPayablesExcel(params);

      const blob = new Blob([res.data as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      a.download = `${isReceivables ? '미수현황' : '미지급현황'}_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      enqueueSnackbar('엑셀 파일이 다운로드되었습니다', { variant: 'success' });
    } catch {
      enqueueSnackbar('엑셀 다운로드에 실패했습니다', { variant: 'error' });
    } finally {
      setExcelLoading(false);
    }
  };

  // ─── 데이터 가공 ───
  const baseData = useMemo(() => {
    const enriched = data.map((d) => ({ ...d, is_favorite: favoriteIds.has(d.id) }));
    return favoritesOnly ? enriched.filter((d) => d.is_favorite) : enriched;
  }, [data, favoriteIds, favoritesOnly]);

  const filteredData = useMemo(() => {
    if (!searchQuery) return baseData;
    const q = searchQuery.toLowerCase();
    return baseData.filter((d) => d.name.toLowerCase().includes(q));
  }, [baseData, searchQuery]);

  const paginatedData = useMemo(
    () => filteredData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredData, page, rowsPerPage]
  );

  const isReceivables = tab === 'receivables';
  const accentColor = isReceivables ? theme.palette.success.main : theme.palette.error.main;

  // ─── 필터 활성 여부 & 필터된 KPI 계산 ───
  const isFiltered = searchQuery !== '' || favoritesOnly;

  const filteredOverview = useMemo<OverviewSummary>(() => {
    if (!isFiltered) return overview;
    // 필터된 데이터에서 현재 탭 기준 합산
    const totalAmount = filteredData.reduce((s, r) => s + r.total_amount, 0);
    const paidAmount = filteredData.reduce((s, r) => s + r.paid_amount, 0);
    const balance = filteredData.reduce((s, r) => s + r.balance, 0);
    if (isReceivables) {
      return {
        ...overview,
        totalSales: totalAmount,
        totalDeposit: paidAmount,
        totalReceivable: balance,
      };
    }
    return {
      ...overview,
      totalPurchase: totalAmount,
      totalWithdrawal: paidAmount,
      totalPayable: balance,
    };
  }, [isFiltered, overview, filteredData, isReceivables]);

  // ─── 빈 상태 안내 ───
  const emptyStateProps = useMemo(() => {
    if (data.length === 0) {
      return {
        emptyIcon: <ReceiptLongIcon sx={{ fontSize: 48, mb: 1, opacity: 0.35 }} />,
        emptyMessage: '등록된 전표가 없습니다',
        emptyDescription: '전표를 업로드하면 거래처별 미수·미지급 현황을 확인할 수 있습니다.',
        emptyAction: (
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            <Button variant="contained" size="small" onClick={() => router.push('/settlement/upload')}>
              전표 업로드
            </Button>
            <Button variant="outlined" size="small" onClick={() => router.push('/settlement/vouchers')}>
              전표 목록 보기
            </Button>
          </Stack>
        ),
      };
    }
    if (favoritesOnly && baseData.length === 0) {
      return {
        emptyIcon: <StarBorderIcon sx={{ fontSize: 48, mb: 1, opacity: 0.35 }} />,
        emptyMessage: '즐겨찾기한 거래처가 없습니다',
        emptyDescription: '거래처 목록에서 ★을 클릭하여 즐겨찾기를 추가하세요.',
        emptyAction: (
          <Button variant="outlined" size="small" onClick={() => { setFavoritesOnly(false); setPage(0); }}>
            전체 거래처 보기
          </Button>
        ),
      };
    }
    if (searchQuery && filteredData.length === 0) {
      return {
        emptyMessage: `"${searchQuery}" 검색 결과가 없습니다`,
        emptyDescription: '다른 검색어를 입력하거나 필터를 변경해보세요.',
      };
    }
    return {};
  }, [data, baseData, filteredData, favoritesOnly, searchQuery, router]);

  // ─── 컬럼 정의 ───
  const columns = useMemo<AppColumnDef<CounterpartyStatus>[]>(() => [
    {
      field: 'name',
      headerName: '거래처명',
      renderCell: (row) => (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar sx={{
            width: 30, height: 30, fontSize: '0.7rem', flexShrink: 0,
            bgcolor: getAvatarColor(row.name),
            boxShadow: row.is_favorite ? `0 0 0 2px ${theme.palette.warning.main}` : 'none',
            transition: 'box-shadow 0.2s',
          }}>
            {getInitials(row.name)}
          </Avatar>
          <Box>
            <Typography fontWeight={600} variant="body2">{row.name}</Typography>
            {row.is_favorite && (
              <Typography variant="caption" color="warning.main" fontWeight={600} sx={{ lineHeight: 1 }}>
                ★ 즐겨찾기
              </Typography>
            )}
          </Box>
        </Stack>
      ),
    },
    {
      field: 'total_vouchers',
      headerName: '전표 수',
      align: 'right',
      sum: true,
      renderCell: (row) => <Chip label={formatNumber(row.total_vouchers)} size="small" variant="outlined" />,
      renderSumCell: (v) => formatNumber(v as number),
    },
    {
      field: 'total_amount',
      headerName: isReceivables ? '총 매출' : '총 매입',
      align: 'right',
      sum: true,
      cellSx: { fontWeight: 500, ...TABULAR_NUMS_SX },
      renderCell: (row) => formatCurrency(row.total_amount),
      renderSumCell: (v) => formatCurrency(v as number),
    },
    {
      field: 'paid_amount',
      headerName: isReceivables ? '입금 완료' : '출금 완료',
      align: 'right',
      sum: true,
      cellSx: { color: 'success.main', fontWeight: 500, ...TABULAR_NUMS_SX },
      renderCell: (row) => formatCurrency(row.paid_amount),
      renderSumCell: (v) => formatCurrency(v as number),
    },
    {
      field: 'balance',
      headerName: isReceivables ? '미수 잔액' : '미지급 잔액',
      align: 'right',
      sum: true,
      renderCell: (row) => (
        <>
          <Typography
            variant="body2"
            fontWeight={700}
            sx={{ ...TABULAR_NUMS_SX }}
            color={row.balance > 0 ? (isReceivables ? 'success.main' : 'error.main') : 'text.secondary'}
          >
            {formatCurrency(row.balance)}
          </Typography>
          {row.balance > 0 && (
            <LinearProgress
              variant="determinate"
              value={Math.min((row.paid_amount / row.total_amount) * 100, 100)}
              color={isReceivables ? 'success' : 'error'}
              sx={{ mt: 0.5, height: 3, borderRadius: 2, bgcolor: alpha(accentColor, 0.12) }}
            />
          )}
        </>
      ),
      renderSumCell: (v) => (
        <Typography
          component="span"
          fontWeight={700}
          color={isReceivables ? 'success.main' : 'error.main'}
        >
          {formatCurrency(v as number)}
        </Typography>
      ),
    },
    {
      field: 'last_transaction_date',
      headerName: '최근 거래일',
      cellSx: { color: 'text.secondary' },
      renderCell: (row) => formatDate(row.last_transaction_date),
    },
  ], [theme, isReceivables, accentColor]);

  // ─── KPI 카드 렌더링 헬퍼 ───
  const renderKpiBlock = (
    label: string,
    amount: number,
    icon: React.ReactNode,
    color: string,
    bold?: boolean,
  ) => (
    <Box sx={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center" sx={{ mb: 0.25 }}>
        {icon}
        <Typography variant="caption" color="text.secondary" fontWeight={600} noWrap>
          {label}
        </Typography>
      </Stack>
      <Typography
        variant="subtitle1"
        fontWeight={bold ? 800 : 600}
        noWrap
        sx={{ ...TABULAR_NUMS_SX, color: color, lineHeight: 1.3 }}
      >
        {formatCurrency(amount)}
      </Typography>
    </Box>
  );

  const renderArrow = () => (
    <ArrowForwardIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0, mx: 0.5 }} />
  );

  const salesRate = filteredOverview.totalSales > 0 ? Math.round((filteredOverview.totalDeposit / filteredOverview.totalSales) * 100) : 0;
  const purchaseRate = filteredOverview.totalPurchase > 0 ? Math.round((filteredOverview.totalWithdrawal / filteredOverview.totalPurchase) * 100) : 0;

  return (
    <AppPageContainer sx={{ maxWidth: 1600, mx: 'auto' }}>
      {/* ─── 헤더 ─── */}
      <AppPageHeader
        icon={<BusinessIcon />}
        title="거래처 현황"
        description="매출/매입 미수·미지급 현황 종합"
        color="info"
        loading={loading}
        onRefresh={handleRefresh}
        chips={favoritesOnly ? [
          <Chip
            key="fav-filter"
            icon={<StarIcon sx={{ fontSize: '13px !important' }} />}
            label="즐겨찾기 필터 적용 중"
            size="small"
            color="warning"
            variant="outlined"
            sx={{ fontWeight: 600, height: 22, fontSize: '0.7rem' }}
          />
        ] : []}
      />

      {/* ─── KPI 요약: 매출→입금→미수 | 매입→출금→미지급 ─── */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        {/* 미수 현황 */}
        <AppSectionCard noPadding sx={{
          flex: 1, p: 2, mb: 0,
          borderColor: alpha(theme.palette.success.main, 0.3),
          background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.06)} 0%, transparent 100%)`,
        }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
            <TrendingUpIcon sx={{ fontSize: 18, color: 'success.main' }} />
            <Typography variant="body2" fontWeight={700} color="success.main">미수 현황</Typography>
            {isFiltered && isReceivables && (
              <Chip label={`${filteredData.length}개 거래처 기준`} size="small" variant="outlined" color="info"
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }} />
            )}
            <Chip
              label={`수금률 ${salesRate}%`}
              size="small"
              color={salesRate >= 80 ? 'success' : salesRate >= 50 ? 'warning' : 'error'}
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, ml: 'auto' }}
            />
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {renderKpiBlock('총 매출', filteredOverview.totalSales,
              <ReceiptLongIcon sx={{ fontSize: 14, color: 'text.secondary' }} />, 'text.primary')}
            {renderArrow()}
            {renderKpiBlock('입금 완료', filteredOverview.totalDeposit,
              <CallReceivedIcon sx={{ fontSize: 14, color: 'info.main' }} />, theme.palette.info.main)}
            {renderArrow()}
            {renderKpiBlock('미수 잔액', filteredOverview.totalReceivable,
              <TrendingUpIcon sx={{ fontSize: 14, color: 'success.main' }} />, theme.palette.success.main, true)}
          </Stack>
          {filteredOverview.totalSales > 0 && (
            <LinearProgress
              variant="determinate"
              value={salesRate}
              color="success"
              sx={{ mt: 1.5, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.1) }}
            />
          )}
        </AppSectionCard>

        {/* 미지급 현황 */}
        <AppSectionCard noPadding sx={{
          flex: 1, p: 2, mb: 0,
          borderColor: alpha(theme.palette.error.main, 0.3),
          background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.06)} 0%, transparent 100%)`,
        }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
            <TrendingDownIcon sx={{ fontSize: 18, color: 'error.main' }} />
            <Typography variant="body2" fontWeight={700} color="error.main">미지급 현황</Typography>
            {isFiltered && !isReceivables && (
              <Chip label={`${filteredData.length}개 거래처 기준`} size="small" variant="outlined" color="info"
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }} />
            )}
            <Chip
              label={`지급률 ${purchaseRate}%`}
              size="small"
              color={purchaseRate >= 80 ? 'success' : purchaseRate >= 50 ? 'warning' : 'error'}
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, ml: 'auto' }}
            />
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {renderKpiBlock('총 매입', filteredOverview.totalPurchase,
              <ReceiptLongIcon sx={{ fontSize: 14, color: 'text.secondary' }} />, 'text.primary')}
            {renderArrow()}
            {renderKpiBlock('출금 완료', filteredOverview.totalWithdrawal,
              <CallMadeIcon sx={{ fontSize: 14, color: 'warning.main' }} />, theme.palette.warning.main)}
            {renderArrow()}
            {renderKpiBlock('미지급 잔액', filteredOverview.totalPayable,
              <TrendingDownIcon sx={{ fontSize: 14, color: 'error.main' }} />, theme.palette.error.main, true)}
          </Stack>
          {filteredOverview.totalPurchase > 0 && (
            <LinearProgress
              variant="determinate"
              value={purchaseRate}
              color="error"
              sx={{ mt: 1.5, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.1) }}
            />
          )}
        </AppSectionCard>
      </Stack>

      {/* ─── 탭 ─── */}
      <AppSectionCard noPadding sx={{ mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => { setTab(v); setPage(0); }}
          sx={{ px: 2, '& .MuiTab-root': { fontWeight: 600, py: 1.5, minHeight: 44 } }}
        >
          <Tab value="receivables" icon={<TrendingUpIcon />} iconPosition="start" label="미수 현황 (판매)" />
          <Tab value="payables" icon={<TrendingDownIcon />} iconPosition="start" label="미지급 현황 (매입)" />
        </Tabs>
      </AppSectionCard>

      {/* ─── 기간 필터 ─── */}
      <AppPageToolbar
        left={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <ToggleButtonGroup
              value={datePreset}
              exclusive
              onChange={(_, v) => v && handlePreset(v)}
              size="small"
            >
              {DATE_PRESETS.map((p) => (
                <ToggleButton
                  key={p.value}
                  value={p.value}
                  sx={{ px: 1.5, py: 0.5, textTransform: 'none', fontSize: '0.8125rem' }}
                >
                  {p.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {dateFrom && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" onClick={() => handleMonthNav(-1)}>
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>
                <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center', fontWeight: 500 }}>
                  {periodLabel}
                </Typography>
                <IconButton size="small" onClick={() => handleMonthNav(1)}>
                  <ChevronRightIcon fontSize="small" />
                </IconButton>
                <CalendarIcon fontSize="small" color="action" />
              </Box>
            )}

            {datePreset === 'custom' && (
              <>
                <TextField
                  size="small" type="date" label="시작일"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 150 }}
                />
                <TextField
                  size="small" type="date" label="종료일"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 150 }}
                />
              </>
            )}

            {datePreset !== 'all' && (
              <Chip
                label="전표 거래일 기준"
                size="small"
                variant="outlined"
                color="info"
                sx={{ height: 24, fontSize: '0.75rem', fontWeight: 600 }}
              />
            )}
          </Box>
        }
      />

      {/* ─── 검색 + 즐겨찾기 필터 ─── */}
      <AppPageToolbar
        sx={favoritesOnly ? {
          background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.05)} 0%, transparent 100%)`,
        } : undefined}
        left={
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              placeholder="거래처명 검색..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 280 }}
            />

            <Divider orientation="vertical" flexItem />

            <ToggleButtonGroup
              value={favoritesOnly ? 'favorites' : 'all'}
              exclusive
              size="small"
              onChange={(_, v) => {
                if (v !== null) { setFavoritesOnly(v === 'favorites'); setPage(0); }
              }}
            >
              <ToggleButton value="all" sx={{ px: 2, fontWeight: 600 }}>
                <FilterListIcon sx={{ mr: 0.5, fontSize: 16 }} />
                전체
              </ToggleButton>
              <ToggleButton value="favorites" sx={{ px: 2, fontWeight: 600 }}>
                <StarIcon sx={{ mr: 0.5, fontSize: 16, color: favoritesOnly ? 'warning.main' : 'inherit' }} />
                즐겨찾기
                {favoriteIds.size > 0 && (
                  <Chip
                    label={favoriteIds.size}
                    size="small"
                    color="warning"
                    sx={{ ml: 0.8, height: 18, fontSize: '0.65rem', fontWeight: 700, '& .MuiChip-label': { px: 0.8 } }}
                  />
                )}
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        }
        right={
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title={`${isReceivables ? '미수' : '미지급'} 현황 엑셀 다운로드 (업체 전달용)`}>
              <Button
                variant="outlined"
                size="small"
                startIcon={excelLoading ? <CircularProgress size={14} /> : <DownloadIcon />}
                onClick={handleExcelDownload}
                disabled={excelLoading || filteredData.length === 0}
                sx={{ fontWeight: 600, minWidth: 80 }}
              >
                엑셀
              </Button>
            </Tooltip>
            <Typography variant="caption" color="text.secondary">
              {filteredData.length}개 거래처
            </Typography>
          </Stack>
        }
      />

      {/* ─── 테이블 ─── */}
      <AppDataTable<CounterpartyStatus>
        columns={columns}
        rows={paginatedData}
        getRowKey={(r) => r.id}
        defaultSortField="balance"
        defaultSortOrder="desc"
        loading={loading}
        {...emptyStateProps}
        count={filteredData.length}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[25, 50, 100]}
        maxHeight="calc(100vh - 340px)"
        onRowClick={(row) => router.push(`/settlement/counterparties/${row.id}?from=status`)}
        getRowSx={() => ({
          cursor: 'pointer',
          transition: 'background 0.15s',
          '&:hover': { bgcolor: alpha(accentColor, 0.04) },
        })}
        headerRowSx={{
          background: `linear-gradient(90deg, ${alpha(accentColor, 0.07)} 0%, transparent 60%)`,
        }}
        skeletonRows={10}
        renderLeadingColumns={(row, index) => (
          <>
            <TableCell sx={{
              color: 'text.secondary',
              ...(row.is_favorite && {
                borderLeft: `3px solid ${theme.palette.warning.main}`,
              }),
            }}>
              {page * rowsPerPage + index + 1}
            </TableCell>
            <TableCell>
              <Tooltip title={row.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} placement="right">
                <IconButton
                  size="small"
                  onClick={(e) => handleToggleFavorite(row, e)}
                  sx={{
                    color: row.is_favorite ? 'warning.main' : 'text.disabled',
                    transition: 'all 0.2s',
                    '&:hover': { color: 'warning.main', transform: 'scale(1.2)' },
                  }}
                >
                  {row.is_favorite
                    ? <StarIcon fontSize="small" />
                    : <StarBorderIcon fontSize="small" />
                  }
                </IconButton>
              </Tooltip>
            </TableCell>
          </>
        )}
        leadingColumnHeaders={
          <>
            <TableCell sx={{ fontWeight: 700, width: 40 }}>#</TableCell>
            <TableCell sx={{ fontWeight: 700, width: 52 }}>
              <Tooltip title="즐겨찾기">
                <StarBorderIcon sx={{ fontSize: 18, color: 'text.secondary', verticalAlign: 'middle' }} />
              </Tooltip>
            </TableCell>
          </>
        }
        leadingSumColSpan={2}
        renderActions={(row) => (
          <Tooltip title="상세 보기">
            <IconButton
              size="small"
              color="primary"
              onClick={() => router.push(`/settlement/counterparties/${row.id}?from=status`)}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        actionsHeader="상세"
        actionsWidth={70}
      />
    </AppPageContainer>
  );
}
