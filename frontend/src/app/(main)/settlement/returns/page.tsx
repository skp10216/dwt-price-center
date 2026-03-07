'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Button, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TableSortLabel, IconButton, Tooltip, Alert,
  alpha, useTheme, InputAdornment, MenuItem, Select, FormControl,
  InputLabel, Skeleton, Divider, CircularProgress, Dialog,
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  Search as SearchIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Receipt as ReceiptIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  OpenInNew as OpenInNewIcon,
  AssignmentReturn as ReturnIcon,
  Refresh as RefreshIcon,
  Clear as ClearIcon,
  PhoneAndroid as DeviceIcon,
  AttachMoney as MoneyIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { settlementApi, getErrorMessage } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { useAppRouter } from '@/lib/navigation';
import { AppPageContainer, AppPageHeader } from '@/components/ui';

interface ReturnItemRow {
  id: string;
  return_date: string;
  slip_number: string;
  counterparty_id: string;
  counterparty_name: string | null;
  pg_no: string | null;
  model_name: string | null;
  serial_number: string | null;
  imei: string | null;
  color: string | null;
  purchase_cost: number;
  purchase_deduction: number;
  return_amount: number;
  as_cost: number;
  remarks: string | null;
  memo: string | null;
  is_locked: boolean;
  source_voucher_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ReturnSummary {
  total_count: number;
  total_purchase_cost: number;
  total_purchase_deduction: number;
  total_return_amount: number;
  total_as_cost: number;
}

const formatAmount = (val: number) =>
  val === 0 ? '-' : val.toLocaleString('ko-KR');

export default function ReturnItemsPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const router = useAppRouter();

  const [items, setItems] = useState<ReturnItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ReturnSummary | null>(null);

  // 필터
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // 페이지네이션
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // 정렬
  const [sortBy, setSortBy] = useState('return_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 삭제 다이얼로그
  const [deleteTarget, setDeleteTarget] = useState<ReturnItemRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const buildParams = useCallback(() => {
    const params: Record<string, unknown> = {
      page: page + 1,
      page_size: rowsPerPage,
      sort_by: sortBy,
      sort_order: sortOrder,
    };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (search) params.search = search;
    return params;
  }, [page, rowsPerPage, sortBy, sortOrder, dateFrom, dateTo, search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      const [listRes, summaryRes] = await Promise.all([
        settlementApi.listReturnItems(params),
        settlementApi.getReturnSummary(params),
      ]);
      const listData = listRes.data as unknown as { items: ReturnItemRow[]; total: number };
      setItems(listData.items || []);
      setTotal(listData.total || 0);
      setSummary(summaryRes.data as unknown as ReturnSummary);
    } catch (e) {
      enqueueSnackbar(getErrorMessage(e), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [buildParams, enqueueSnackbar]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setSearchInput('');
    setPage(0);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(0);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await settlementApi.deleteReturnItem(deleteTarget.id);
      enqueueSnackbar('반품 내역이 삭제되었습니다', { variant: 'success' });
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      enqueueSnackbar(getErrorMessage(e), { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const params = buildParams();
      const res = await settlementApi.exportReturnExcel(params);
      const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `반품내역_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      enqueueSnackbar(getErrorMessage(e), { variant: 'error' });
    }
  };

  const hasFilters = dateFrom || dateTo || search;

  const columns = [
    { id: 'return_date', label: '반품일', width: 100, sortable: true },
    { id: 'slip_number', label: '전표번호', width: 80, sortable: true },
    { id: 'counterparty_name', label: '반품처', width: 140, sortable: false },
    { id: 'pg_no', label: 'P/G No', width: 120, sortable: false },
    { id: 'model_name', label: '모델명', width: 150, sortable: true },
    { id: 'imei', label: 'IMEI', width: 160, sortable: false },
    { id: 'color', label: '색상', width: 60, sortable: false },
    { id: 'purchase_cost', label: '매입원가', width: 100, sortable: true, align: 'right' as const },
    { id: 'purchase_deduction', label: '매입차감', width: 100, sortable: true, align: 'right' as const },
    { id: 'return_amount', label: '반품금액', width: 100, sortable: true, align: 'right' as const },
    { id: 'as_cost', label: 'A/S금액', width: 100, sortable: true, align: 'right' as const },
    { id: 'remarks', label: '특이사항', width: 200, sortable: false },
    { id: 'actions', label: '', width: 80, sortable: false },
  ];

  return (
    <AppPageContainer>
      <AppPageHeader
        title="반품 내역"
        description="UPM 반품 데이터를 조회하고 관리합니다"
        color="warning"
      />

      {/* ── 요약 카드 ── */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: '총 건수',
            value: summary ? `${summary.total_count.toLocaleString()}건` : '-',
            icon: <DeviceIcon />,
            color: theme.palette.primary.main,
          },
          {
            label: '총 매입원가',
            value: summary ? `${formatAmount(summary.total_purchase_cost)}` : '-',
            icon: <MoneyIcon />,
            color: theme.palette.info.main,
          },
          {
            label: '총 반품금액',
            value: summary ? `${formatAmount(summary.total_return_amount)}` : '-',
            icon: <ReturnIcon />,
            color: theme.palette.warning.main,
          },
          {
            label: '총 A/S금액',
            value: summary ? `${formatAmount(summary.total_as_cost)}` : '-',
            icon: <WarningIcon />,
            color: theme.palette.error.main,
          },
        ].map((card) => (
          <Paper
            key={card.label}
            elevation={0}
            sx={{
              flex: 1,
              p: 2.5,
              borderRadius: 3,
              border: `1px solid ${alpha(card.color, 0.15)}`,
              background: `linear-gradient(135deg, ${alpha(card.color, 0.04)} 0%, ${alpha(card.color, 0.01)} 100%)`,
              transition: 'all 0.2s',
              '&:hover': { borderColor: alpha(card.color, 0.3), transform: 'translateY(-1px)' },
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{
                p: 1, borderRadius: 2,
                bgcolor: alpha(card.color, 0.1),
                color: card.color, display: 'flex',
              }}>
                {card.icon}
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  {card.label}
                </Typography>
                <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                  {loading ? <Skeleton width={80} /> : card.value}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* ── 필터/검색/액션 바 ── */}
      <Paper
        elevation={0}
        sx={{
          mb: 2, p: 2, borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <TextField
            size="small"
            type="date"
            label="시작일"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <TextField
            size="small"
            type="date"
            label="종료일"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <TextField
            size="small"
            placeholder="IMEI / 일련번호 / P/G No / 모델명 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 320 }}
          />
          <Button variant="contained" size="small" onClick={handleSearch} sx={{ fontWeight: 600 }}>
            검색
          </Button>
          {hasFilters && (
            <Button
              variant="text"
              size="small"
              startIcon={<ClearIcon />}
              onClick={handleClearFilters}
              sx={{ color: 'text.secondary' }}
            >
              필터 초기화
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="새로고침">
            <IconButton size="small" onClick={fetchData}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleExportExcel}
            sx={{ fontWeight: 600 }}
          >
            엑셀 다운로드
          </Button>
        </Stack>
      </Paper>

      {/* ── 데이터 테이블 ── */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          overflow: 'hidden',
        }}
      >
        <TableContainer sx={{ maxHeight: 'calc(100vh - 420px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {columns.map((col) => (
                  <TableCell
                    key={col.id}
                    align={col.align || 'left'}
                    sx={{
                      width: col.width,
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      bgcolor: alpha(theme.palette.primary.main, 0.03),
                      borderBottom: `2px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                      whiteSpace: 'nowrap',
                      py: 1.2,
                    }}
                  >
                    {col.sortable ? (
                      <TableSortLabel
                        active={sortBy === col.id}
                        direction={sortBy === col.id ? sortOrder : 'asc'}
                        onClick={() => handleSort(col.id)}
                      >
                        {col.label}
                      </TableSortLabel>
                    ) : col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((col) => (
                      <TableCell key={col.id}><Skeleton variant="text" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center" sx={{ py: 8 }}>
                    <Stack alignItems="center" spacing={1}>
                      <ReturnIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                      <Typography color="text.secondary">
                        {hasFilters ? '검색 조건에 맞는 반품 내역이 없습니다' : '등록된 반품 내역이 없습니다'}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        UPM 업로드에서 반품 내역을 업로드해 주세요
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : items.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  sx={{
                    '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.5) },
                    ...(item.is_locked ? { opacity: 0.7, bgcolor: alpha(theme.palette.action.disabledBackground, 0.3) } : {}),
                  }}
                >
                  <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      {item.is_locked && (
                        <Tooltip title="마감됨">
                          <LockIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                        </Tooltip>
                      )}
                      <span>{item.return_date}</span>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {item.slip_number}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 130 }}>
                      {item.counterparty_name || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'text.secondary' }}>
                    {item.pg_no || '-'}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>
                      {item.model_name || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'text.secondary' }}>
                    {item.imei || '-'}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {item.color || '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                    {formatAmount(item.purchase_cost)}
                  </TableCell>
                  <TableCell align="right" sx={{
                    fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums',
                    color: item.purchase_deduction < 0 ? 'error.main' : 'text.primary',
                  }}>
                    {formatAmount(item.purchase_deduction)}
                  </TableCell>
                  <TableCell align="right" sx={{
                    fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    color: item.return_amount > 0 ? 'success.main' : 'text.primary',
                  }}>
                    {formatAmount(item.return_amount)}
                  </TableCell>
                  <TableCell align="right" sx={{
                    fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums',
                    color: item.as_cost > 0 ? 'warning.main' : 'text.primary',
                  }}>
                    {formatAmount(item.as_cost)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 190 }}>
                      {item.remarks || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0}>
                      {item.source_voucher_id && (
                        <Tooltip title="원전표 보기">
                          <IconButton
                            size="small"
                            onClick={() => router.push(`/settlement/vouchers/${item.source_voucher_id}`)}
                            sx={{ color: 'primary.main' }}
                          >
                            <OpenInNewIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!item.is_locked && (
                        <Tooltip title="삭제">
                          <IconButton
                            size="small"
                            onClick={() => setDeleteTarget(item)}
                            sx={{ color: 'error.main' }}
                          >
                            <DeleteIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}

              {/* ── 합계 행 ── */}
              {!loading && items.length > 0 && summary && (
                <TableRow sx={{
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  '& .MuiTableCell-root': {
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    borderTop: `2px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                    py: 1.5,
                  },
                }}>
                  <TableCell colSpan={7} sx={{ textAlign: 'right', pr: 2 }}>
                    <Chip
                      label={`합계 (${summary.total_count.toLocaleString()}건)`}
                      size="small"
                      sx={{
                        fontWeight: 700, fontSize: '0.75rem',
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: 'primary.main',
                      }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatAmount(summary.total_purchase_cost)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatAmount(summary.total_purchase_deduction)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'success.main' }}>
                    {formatAmount(summary.total_return_amount)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'warning.main' }}>
                    {formatAmount(summary.total_as_cost)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage="페이지당 행수"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count !== -1 ? count : `${to}+`}`}
          sx={{
            borderTop: `1px solid ${theme.palette.divider}`,
            '& .MuiTablePagination-toolbar': { px: 2 },
          }}
        />
      </Paper>

      {/* ── 삭제 확인 다이얼로그 ── */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>반품 내역 삭제</DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <Stack spacing={1}>
              <Typography variant="body2">
                다음 반품 내역을 삭제하시겠습니까?
              </Typography>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="body2" fontWeight={600}>
                  {deleteTarget.model_name || deleteTarget.pg_no || '-'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  IMEI: {deleteTarget.imei || '-'} | 반품일: {deleteTarget.return_date}
                </Typography>
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>취소</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
