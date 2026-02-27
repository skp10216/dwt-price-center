'use client';

/**
 * 거래처 현황 페이지 (미수/미지급 통합)
 * 즐겨찾기 기반 필터 + 탭으로 판매(미수)/매입(미지급) 현황 전환
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Stack, Tab, Tabs, TableCell,
  TextField, InputAdornment, Chip, IconButton, Tooltip, LinearProgress,
  alpha, useTheme, Avatar, Fade, ToggleButtonGroup, ToggleButton,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
  Business as BusinessIcon,
  Visibility as VisibilityIcon,
  AttachMoney as AttachMoneyIcon,
  MoneyOff as MoneyOffIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  FilterList as FilterListIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { useRouter } from 'next/navigation';
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

export default function CounterpartyStatusPage() {
  const theme = useTheme();
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();

  const [tab, setTab] = useState<TabValue>('receivables');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CounterpartyStatus[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  // ─── 즐겨찾기 목록 로드 ───
  const loadFavorites = useCallback(async () => {
    try {
      const res = await settlementApi.listCounterparties({ favorites_only: true, page_size: 200 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = (res.data as any).counterparties as Array<{ id: string }>;
      setFavoriteIds(new Set(list.map((c) => c.id)));
    } catch { /* silent */ }
  }, []);

  // ─── 거래처 현황 로드 ───
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // 즐겨찾기 필터 사용을 위해 잔액 0인 거래처도 포함
      const params = { page: 1, page_size: 200, include_zero_balance: true };
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
  }, [tab, enqueueSnackbar]);

  useEffect(() => { loadFavorites(); }, [loadFavorites]);
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

  const handleRefresh = () => { loadData(); loadFavorites(); };

  // ─── 데이터 가공 ───
  const baseData = useMemo(() => {
    const enriched = data.map((d) => ({ ...d, is_favorite: favoriteIds.has(d.id) }));
    return favoritesOnly ? enriched.filter((d) => d.is_favorite) : enriched;
  }, [data, favoriteIds, favoritesOnly]);

  const summary = useMemo(() => ({
    totalAmount: baseData.reduce((s, d) => s + d.total_amount, 0),
    paidAmount: baseData.reduce((s, d) => s + d.paid_amount, 0),
    balance: baseData.reduce((s, d) => s + d.balance, 0),
    totalCounterparties: baseData.length,
    withBalance: baseData.filter((d) => d.balance > 0).length,
  }), [baseData]);

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
      headerName: '총 금액',
      align: 'right',
      sum: true,
      cellSx: { fontWeight: 500 },
      renderCell: (row) => formatCurrency(row.total_amount),
      renderSumCell: (v) => formatCurrency(v as number),
    },
    {
      field: 'paid_amount',
      headerName: '정산 완료',
      align: 'right',
      sum: true,
      cellSx: { color: 'success.main', fontWeight: 500 },
      renderCell: (row) => formatCurrency(row.paid_amount),
      renderSumCell: (v) => formatCurrency(v as number),
    },
    {
      field: 'balance',
      headerName: '잔액',
      align: 'right',
      sum: true,
      renderCell: (row) => (
        <>
          <Typography
            variant="body2"
            fontWeight={700}
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

  return (
    <AppPageContainer sx={{ maxWidth: 1600, mx: 'auto' }}>
      {/* ─── 헤더 ─── */}
      <AppPageHeader
        icon={<BusinessIcon />}
        title="거래처 현황"
        description={isReceivables ? '판매 거래처의 미수금 현황' : '매입 거래처의 미지급금 현황'}
        color={isReceivables ? 'success' : 'error'}
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

      {/* ─── 요약 카드 ─── */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        {[
          {
            icon: <BusinessIcon sx={{ color: 'primary.main', fontSize: 22 }} />,
            bg: theme.palette.primary.main,
            value: formatNumber(summary.totalCounterparties),
            label: favoritesOnly ? '즐겨찾기 거래처' : '전체 거래처',
            sub: summary.withBalance > 0 ? `잔액 ${formatNumber(summary.withBalance)}개` : '',
          },
          {
            icon: <AccountBalanceIcon sx={{ color: 'info.main', fontSize: 22 }} />,
            bg: theme.palette.info.main,
            value: formatCurrency(summary.totalAmount),
            label: '총 거래액',
          },
          {
            icon: <AttachMoneyIcon sx={{ color: 'success.main', fontSize: 22 }} />,
            bg: theme.palette.success.main,
            value: formatCurrency(summary.paidAmount),
            label: '정산 완료',
          },
          {
            icon: <MoneyOffIcon sx={{ color: isReceivables ? 'success.main' : 'error.main', fontSize: 22 }} />,
            bg: accentColor,
            value: formatCurrency(summary.balance),
            label: isReceivables ? '미수금 잔액' : '미지급금 잔액',
            highlight: true,
          },
        ].map((card, i) => (
          <AppSectionCard key={i} noPadding sx={{
            minWidth: 180, flex: 1, p: 2, mb: 0,
            borderColor: card.highlight ? alpha(accentColor, 0.35) : 'divider',
            background: `linear-gradient(135deg, ${alpha(card.bg, card.highlight ? 0.09 : 0.04)} 0%, transparent 100%)`,
          }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{
                width: 36, height: 36, borderRadius: 1.5, flexShrink: 0,
                bgcolor: alpha(card.bg, 0.12),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {card.icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant={i === 0 ? 'h5' : 'subtitle1'} fontWeight={800} noWrap sx={{ lineHeight: 1.2 }}>
                  {card.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                {card.sub && (
                  <Typography variant="caption" color="warning.main" fontWeight={600} sx={{ display: 'block', lineHeight: 1 }}>{card.sub}</Typography>
                )}
              </Box>
            </Stack>
          </AppSectionCard>
        ))}
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
          <Typography variant="caption" color="text.secondary">
            {filteredData.length}개 거래처
          </Typography>
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
        count={filteredData.length}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[25, 50, 100]}
        maxHeight={580}
        onRowClick={(row) => router.push(`/settlement/counterparties/${row.id}?from=status`)}
        getRowSx={(row) => ({
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
