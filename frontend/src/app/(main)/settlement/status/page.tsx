'use client';

/**
 * 거래처 현황 페이지 (미수/미지급 통합)
 * 탭으로 판매(미수)/매입(미지급) 현황을 전환하여 조회
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, TablePagination,
  TextField, InputAdornment, Chip, IconButton, Tooltip, LinearProgress,
  alpha, useTheme, Button, Avatar, Skeleton, Fade,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
  Business as BusinessIcon,
  ArrowForward as ArrowForwardIcon,
  Visibility as VisibilityIcon,
  AttachMoney as AttachMoneyIcon,
  MoneyOff as MoneyOffIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { useRouter } from 'next/navigation';
import { visuallyHidden } from '@mui/utils';

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
}

type TabValue = 'receivables' | 'payables';
type SortField = 'name' | 'total_vouchers' | 'total_amount' | 'paid_amount' | 'balance' | 'last_transaction_date';
type SortDirection = 'asc' | 'desc';

// ─── 유틸리티 ───
const formatCurrency = (amount: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
const formatNumber = (n: number) => new Intl.NumberFormat('ko-KR').format(n);
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('ko-KR');
};

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

// ─── 테이블 헤더 ───
const headCells: { id: SortField; label: string; numeric: boolean }[] = [
  { id: 'name', label: '거래처명', numeric: false },
  { id: 'total_vouchers', label: '전표 수', numeric: true },
  { id: 'total_amount', label: '총 금액', numeric: true },
  { id: 'paid_amount', label: '정산 완료', numeric: true },
  { id: 'balance', label: '잔액', numeric: true },
  { id: 'last_transaction_date', label: '최근 거래일', numeric: false },
];

export default function CounterpartyStatusPage() {
  const theme = useTheme();
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();

  // ─── 상태 ───
  const [tab, setTab] = useState<TabValue>('receivables');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CounterpartyStatus[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [orderBy, setOrderBy] = useState<SortField>('balance');
  const [order, setOrder] = useState<SortDirection>('desc');

  // ─── 요약 통계 ───
  const summary = useMemo(() => {
    const totalAmount = data.reduce((sum, d) => sum + d.total_amount, 0);
    const paidAmount = data.reduce((sum, d) => sum + d.paid_amount, 0);
    const balance = data.reduce((sum, d) => sum + d.balance, 0);
    const totalCounterparties = data.length;
    const withBalance = data.filter(d => d.balance > 0).length;
    return { totalAmount, paidAmount, balance, totalCounterparties, withBalance };
  }, [data]);

  // ─── 데이터 로드 ───
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // TODO: 실제 API 연동 필요
      // const res = await settlementApi.getCounterpartyStatus({ type: tab });
      // setData(res.data.items);
      
      // 임시 더미 데이터
      const dummyData: CounterpartyStatus[] = Array.from({ length: 25 }, (_, i) => ({
        id: `cp-${i + 1}`,
        name: `거래처 ${String.fromCharCode(65 + (i % 26))}${i + 1}`,
        type: tab === 'receivables' ? 'customer' : 'vendor',
        total_vouchers: Math.floor(Math.random() * 50) + 5,
        total_amount: Math.floor(Math.random() * 50000000) + 1000000,
        paid_amount: Math.floor(Math.random() * 30000000),
        balance: Math.floor(Math.random() * 20000000),
        last_transaction_date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      }));
      setData(dummyData);
    } catch {
      enqueueSnackbar('데이터 로드에 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [tab, enqueueSnackbar]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── 정렬/필터 ───
  const filteredData = useMemo(() => {
    let result = [...data];
    
    // 검색 필터
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => d.name.toLowerCase().includes(q));
    }

    // 정렬
    result.sort((a, b) => {
      let aVal = a[orderBy];
      let bVal = b[orderBy];

      if (aVal === null) aVal = '';
      if (bVal === null) bVal = '';

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    return result;
  }, [data, searchQuery, orderBy, order]);

  const paginatedData = useMemo(() => {
    return filteredData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [filteredData, page, rowsPerPage]);

  const handleSort = (field: SortField) => {
    const isAsc = orderBy === field && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(field);
  };

  const handleViewDetail = (id: string) => {
    router.push(`/settlement/counterparties/${id}`);
  };

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto' }}>
      {/* ─── 헤더 ─── */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            거래처 현황
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tab === 'receivables' ? '판매 거래처의 미수금 현황을 조회합니다' : '매입 거래처의 미지급금 현황을 조회합니다'}
          </Typography>
        </Box>
        <IconButton onClick={loadData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Stack>

      {/* ─── 탭 ─── */}
      <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => { setTab(v); setPage(0); }}
          sx={{
            px: 2,
            '& .MuiTab-root': {
              fontWeight: 600,
              py: 2,
            },
          }}
        >
          <Tab
            value="receivables"
            icon={<TrendingUpIcon />}
            iconPosition="start"
            label="미수 현황 (판매)"
            sx={{ color: tab === 'receivables' ? 'success.main' : 'text.secondary' }}
          />
          <Tab
            value="payables"
            icon={<TrendingDownIcon />}
            iconPosition="start"
            label="미지급 현황 (매입)"
            sx={{ color: tab === 'payables' ? 'error.main' : 'text.secondary' }}
          />
        </Tabs>
      </Paper>

      {/* ─── 요약 카드 ─── */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <Paper elevation={0} sx={{
          p: 3, minWidth: 180, borderRadius: 3,
          border: '1px solid', borderColor: 'divider',
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, ${alpha(theme.palette.primary.main, 0.01)} 100%)`,
        }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{
              width: 48, height: 48, borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BusinessIcon sx={{ color: 'primary.main', fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={800}>{formatNumber(summary.totalCounterparties)}</Typography>
              <Typography variant="body2" color="text.secondary">전체 거래처</Typography>
            </Box>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{
          p: 3, minWidth: 200, borderRadius: 3,
          border: '1px solid', borderColor: 'divider',
          background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.04)} 0%, ${alpha(theme.palette.info.main, 0.01)} 100%)`,
        }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{
              width: 48, height: 48, borderRadius: 2,
              bgcolor: alpha(theme.palette.info.main, 0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AccountBalanceIcon sx={{ color: 'info.main', fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={800}>{formatCurrency(summary.totalAmount)}</Typography>
              <Typography variant="body2" color="text.secondary">총 거래액</Typography>
            </Box>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{
          p: 3, minWidth: 200, borderRadius: 3,
          border: '1px solid', borderColor: 'divider',
          background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.04)} 0%, ${alpha(theme.palette.success.main, 0.01)} 100%)`,
        }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{
              width: 48, height: 48, borderRadius: 2,
              bgcolor: alpha(theme.palette.success.main, 0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AttachMoneyIcon sx={{ color: 'success.main', fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={800}>{formatCurrency(summary.paidAmount)}</Typography>
              <Typography variant="body2" color="text.secondary">정산 완료</Typography>
            </Box>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{
          p: 3, minWidth: 200, borderRadius: 3,
          border: '1px solid',
          borderColor: tab === 'receivables' ? alpha(theme.palette.success.main, 0.3) : alpha(theme.palette.error.main, 0.3),
          background: tab === 'receivables'
            ? `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.08)} 0%, ${alpha(theme.palette.success.main, 0.02)} 100%)`
            : `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.08)} 0%, ${alpha(theme.palette.error.main, 0.02)} 100%)`,
        }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{
              width: 48, height: 48, borderRadius: 2,
              bgcolor: tab === 'receivables' ? alpha(theme.palette.success.main, 0.15) : alpha(theme.palette.error.main, 0.15),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MoneyOffIcon sx={{ color: tab === 'receivables' ? 'success.main' : 'error.main', fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={800} color={tab === 'receivables' ? 'success.main' : 'error.main'}>
                {formatCurrency(summary.balance)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {tab === 'receivables' ? '미수금 잔액' : '미지급금 잔액'}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Stack>

      {/* ─── 검색 ─── */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
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
          sx={{ width: 300 }}
        />
      </Paper>

      {/* ─── 테이블 ─── */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
        {loading && <LinearProgress />}
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{
                background: `linear-gradient(90deg, ${alpha(tab === 'receivables' ? theme.palette.success.main : theme.palette.error.main, 0.06)} 0%, ${alpha(theme.palette.background.paper, 1)} 100%)`,
              }}>
                <TableCell sx={{ fontWeight: 700, width: 50 }}>#</TableCell>
                {headCells.map((cell) => (
                  <TableCell
                    key={cell.id}
                    align={cell.numeric ? 'right' : 'left'}
                    sortDirection={orderBy === cell.id ? order : false}
                    sx={{ fontWeight: 700 }}
                  >
                    <TableSortLabel
                      active={orderBy === cell.id}
                      direction={orderBy === cell.id ? order : 'asc'}
                      onClick={() => handleSort(cell.id)}
                    >
                      {cell.label}
                      {orderBy === cell.id && (
                        <Box component="span" sx={visuallyHidden}>
                          {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                        </Box>
                      )}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ fontWeight: 700, width: 80 }}>상세</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton width={20} /></TableCell>
                    <TableCell><Skeleton width={150} /></TableCell>
                    <TableCell align="right"><Skeleton width={40} /></TableCell>
                    <TableCell align="right"><Skeleton width={100} /></TableCell>
                    <TableCell align="right"><Skeleton width={100} /></TableCell>
                    <TableCell align="right"><Skeleton width={100} /></TableCell>
                    <TableCell><Skeleton width={80} /></TableCell>
                    <TableCell align="center"><Skeleton width={30} /></TableCell>
                  </TableRow>
                ))
              ) : paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                    <BusinessIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                    <Typography color="text.secondary">
                      {searchQuery ? '검색 결과가 없습니다' : '데이터가 없습니다'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((row, index) => (
                  <Fade in key={row.id} timeout={300} style={{ transitionDelay: `${index * 30}ms` }}>
                    <TableRow
                      hover
                      sx={{
                        cursor: 'pointer',
                        '&:hover': {
                          bgcolor: alpha(theme.palette.primary.main, 0.04),
                        },
                      }}
                      onClick={() => handleViewDetail(row.id)}
                    >
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        {page * rowsPerPage + index + 1}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem', bgcolor: getAvatarColor(row.name) }}>
                            {getInitials(row.name)}
                          </Avatar>
                          <Typography fontWeight={600}>{row.name}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Chip label={formatNumber(row.total_vouchers)} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 500 }}>
                        {formatCurrency(row.total_amount)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'success.main', fontWeight: 500 }}>
                        {formatCurrency(row.paid_amount)}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          fontWeight={700}
                          color={row.balance > 0 ? (tab === 'receivables' ? 'success.main' : 'error.main') : 'text.secondary'}
                        >
                          {formatCurrency(row.balance)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                        {formatDate(row.last_transaction_date)}
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="상세 보기">
                          <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); handleViewDetail(row.id); }}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  </Fade>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filteredData.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelRowsPerPage="페이지당 행:"
          sx={{ borderTop: '1px solid', borderColor: 'divider' }}
        />
      </Paper>
    </Box>
  );
}
