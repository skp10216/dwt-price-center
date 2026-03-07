'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Button, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TableSortLabel, IconButton, Tooltip,
  alpha, useTheme, InputAdornment, MenuItem, Select, FormControl,
  InputLabel, Skeleton, CircularProgress, Dialog,
  DialogTitle, DialogContent, DialogActions, Menu,
} from '@mui/material';
import {
  Search as SearchIcon, Download as DownloadIcon,
  Lock as LockIcon, Delete as DeleteIcon,
  OpenInNew as OpenInNewIcon, MoveToInbox as IntakeIcon,
  Refresh as RefreshIcon, Clear as ClearIcon,
  PhoneAndroid as DeviceIcon, AttachMoney as MoneyIcon,
  TrendingDown as TrendingDownIcon, TrendingUp as TrendingUpIcon,
  Percent as PercentIcon,
} from '@mui/icons-material';
import { settlementApi, getErrorMessage } from '@/lib/api';
import { INTAKE_STATUS_LABELS, INTAKE_STATUS_OPTIONS, INTAKE_TYPE_LABELS } from '@/lib/settlement-constants';
import { useSnackbar } from 'notistack';
import { useAppRouter } from '@/lib/navigation';
import { AppPageContainer, AppPageHeader } from '@/components/ui';

interface IntakeRow {
  id: string;
  intake_date: string;
  slip_number: string;
  counterparty_id: string;
  counterparty_name: string | null;
  pg_no: string | null;
  model_name: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_counterparty_id: string | null;
  purchase_counterparty_name: string | null;
  actual_purchase_price: number;
  intake_price: number;
  margin: number;
  margin_rate: number;
  intake_type: string;
  current_status: string;
  remarks: string | null;
  memo: string | null;
  is_locked: boolean;
  source_voucher_id: string | null;
}

interface IntakeSummary {
  total_count: number;
  total_actual_purchase_price: number;
  total_intake_price: number;
  total_margin: number;
  avg_margin_rate: number;
}

const fmtAmt = (v: number) => (v === 0 ? '-' : v.toLocaleString('ko-KR'));

export default function IntakeItemsPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const router = useAppRouter();

  const [items, setItems] = useState<IntakeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<IntakeSummary | null>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [sortBy, setSortBy] = useState('intake_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [deleteTarget, setDeleteTarget] = useState<IntakeRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 상태 변경 메뉴
  const [statusAnchor, setStatusAnchor] = useState<null | HTMLElement>(null);
  const [statusTargetId, setStatusTargetId] = useState<string | null>(null);

  const buildParams = useCallback(() => {
    const p: Record<string, unknown> = { page: page + 1, page_size: rowsPerPage, sort_by: sortBy, sort_order: sortOrder };
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (search) p.search = search;
    if (statusFilter) p.current_status = statusFilter;
    return p;
  }, [page, rowsPerPage, sortBy, sortOrder, dateFrom, dateTo, search, statusFilter]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      const [listRes, summaryRes] = await Promise.all([
        settlementApi.listIntakeItems(params),
        settlementApi.getIntakeSummary(params),
      ]);
      const ld = listRes.data as unknown as { items: IntakeRow[]; total: number };
      setItems(ld.items || []);
      setTotal(ld.total || 0);
      setSummary(summaryRes.data as unknown as IntakeSummary);
    } catch (e) {
      enqueueSnackbar(getErrorMessage(e), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [buildParams, enqueueSnackbar]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearch = () => { setSearch(searchInput); setPage(0); };
  const handleClearFilters = () => { setDateFrom(''); setDateTo(''); setSearch(''); setSearchInput(''); setStatusFilter(''); setPage(0); };
  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('desc'); }
    setPage(0);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await settlementApi.deleteIntakeItem(deleteTarget.id);
      enqueueSnackbar('삭제 완료', { variant: 'success' });
      setDeleteTarget(null);
      fetchData();
    } catch (e) { enqueueSnackbar(getErrorMessage(e), { variant: 'error' }); }
    finally { setDeleting(false); }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!statusTargetId) return;
    try {
      await settlementApi.changeIntakeStatus(statusTargetId, newStatus);
      enqueueSnackbar('상태 변경 완료', { variant: 'success' });
      fetchData();
    } catch (e) { enqueueSnackbar(getErrorMessage(e), { variant: 'error' }); }
    setStatusAnchor(null);
    setStatusTargetId(null);
  };

  const handleExportExcel = async () => {
    try {
      const res = await settlementApi.exportIntakeExcel(buildParams());
      const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `반입내역_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) { enqueueSnackbar(getErrorMessage(e), { variant: 'error' }); }
  };

  const hasFilters = dateFrom || dateTo || search || statusFilter;

  const marginColor = (v: number) => v > 0 ? 'success.main' : v < 0 ? 'error.main' : 'text.disabled';

  const columns = [
    { id: 'intake_date', label: '반입일', w: 95, sort: true },
    { id: 'slip_number', label: '전표', w: 60, sort: true },
    { id: 'counterparty_name', label: '반입처', w: 120 },
    { id: 'model_name', label: '모델명', w: 150, sort: true },
    { id: 'serial_number', label: '일련번호', w: 130 },
    { id: 'purchase_date', label: '매입일', w: 95 },
    { id: 'purchase_counterparty_name', label: '매입처', w: 120 },
    { id: 'actual_purchase_price', label: '실매입가', w: 100, sort: true, align: 'right' as const },
    { id: 'intake_price', label: '반입가', w: 100, sort: true, align: 'right' as const },
    { id: 'margin', label: '마진', w: 100, align: 'right' as const },
    { id: 'current_status', label: '현상태', w: 90 },
    { id: 'remarks', label: '특이사항', w: 180 },
    { id: 'actions', label: '', w: 70 },
  ];

  return (
    <AppPageContainer>
      <AppPageHeader title="반입 내역" description="UPM 반입 데이터를 조회하고 관리합니다" color="info" />

      {/* 요약 카드 */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        {[
          { label: '총 건수', value: summary ? `${summary.total_count.toLocaleString()}건` : '-', icon: <DeviceIcon />, color: theme.palette.primary.main },
          { label: '총 실매입가', value: summary ? fmtAmt(summary.total_actual_purchase_price) : '-', icon: <MoneyIcon />, color: theme.palette.info.main },
          { label: '총 반입가', value: summary ? fmtAmt(summary.total_intake_price) : '-', icon: <IntakeIcon />, color: theme.palette.secondary.main },
          { label: '총 마진', value: summary ? fmtAmt(summary.total_margin) : '-', icon: summary && summary.total_margin >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />, color: summary && summary.total_margin >= 0 ? theme.palette.success.main : theme.palette.error.main },
          { label: '평균 마진율', value: summary ? `${summary.avg_margin_rate.toFixed(1)}%` : '-', icon: <PercentIcon />, color: theme.palette.warning.main },
        ].map((card) => (
          <Paper key={card.label} elevation={0} sx={{
            flex: 1, p: 2.5, borderRadius: 3,
            border: `1px solid ${alpha(card.color, 0.15)}`,
            background: `linear-gradient(135deg, ${alpha(card.color, 0.04)} 0%, ${alpha(card.color, 0.01)} 100%)`,
            transition: 'all 0.2s', '&:hover': { borderColor: alpha(card.color, 0.3), transform: 'translateY(-1px)' },
          }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(card.color, 0.1), color: card.color, display: 'flex' }}>{card.icon}</Box>
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>{card.label}</Typography>
                <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                  {loading ? <Skeleton width={80} /> : card.value}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* 필터 바 */}
      <Paper elevation={0} sx={{ mb: 2, p: 2, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <TextField size="small" type="date" label="시작일" value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            InputLabelProps={{ shrink: true }} sx={{ width: 155 }} />
          <TextField size="small" type="date" label="종료일" value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            InputLabelProps={{ shrink: true }} sx={{ width: 155 }} />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>현상태</InputLabel>
            <Select value={statusFilter} label="현상태"
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
              <MenuItem value="">전체</MenuItem>
              {INTAKE_STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" placeholder="일련번호 / P/G No / 모델명 검색" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="action" /></InputAdornment> }}
            sx={{ minWidth: 280 }} />
          <Button variant="contained" size="small" onClick={handleSearch} sx={{ fontWeight: 600 }}>검색</Button>
          {hasFilters && <Button variant="text" size="small" startIcon={<ClearIcon />} onClick={handleClearFilters} sx={{ color: 'text.secondary' }}>초기화</Button>}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="새로고침"><IconButton size="small" onClick={fetchData}><RefreshIcon /></IconButton></Tooltip>
          <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={handleExportExcel} sx={{ fontWeight: 600 }}>엑셀</Button>
        </Stack>
      </Paper>

      {/* 테이블 */}
      <Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 440px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {columns.map((col) => (
                  <TableCell key={col.id} align={col.align || 'left'} sx={{
                    width: col.w, fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap', py: 1.2,
                    bgcolor: alpha(theme.palette.primary.main, 0.03),
                    borderBottom: `2px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                  }}>
                    {col.sort ? <TableSortLabel active={sortBy === col.id} direction={sortBy === col.id ? sortOrder : 'asc'} onClick={() => handleSort(col.id)}>{col.label}</TableSortLabel> : col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>{columns.map((c) => <TableCell key={c.id}><Skeleton variant="text" /></TableCell>)}</TableRow>
              )) : items.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length} align="center" sx={{ py: 8 }}>
                  <Stack alignItems="center" spacing={1}>
                    <IntakeIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                    <Typography color="text.secondary">{hasFilters ? '검색 조건에 맞는 반입 내역이 없습니다' : '등록된 반입 내역이 없습니다'}</Typography>
                  </Stack>
                </TableCell></TableRow>
              ) : items.map((item) => (
                <TableRow key={item.id} hover sx={{
                  '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.5) },
                  ...(item.is_locked ? { opacity: 0.7, bgcolor: alpha(theme.palette.action.disabledBackground, 0.3) } : {}),
                }}>
                  <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      {item.is_locked && <Tooltip title="마감됨"><LockIcon sx={{ fontSize: 14, color: 'warning.main' }} /></Tooltip>}
                      <span>{item.intake_date}</span>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{item.slip_number}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}><Typography variant="body2" noWrap sx={{ maxWidth: 110 }}>{item.counterparty_name || '-'}</Typography></TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}><Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>{item.model_name || '-'}</Typography></TableCell>
                  <TableCell sx={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'text.secondary' }}>{item.serial_number || '-'}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{item.purchase_date || '-'}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}><Typography variant="body2" noWrap sx={{ maxWidth: 110 }}>{item.purchase_counterparty_name || '-'}</Typography></TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(item.actual_purchase_price)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(item.intake_price)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: marginColor(item.margin) }}>{fmtAmt(item.margin)}</TableCell>
                  <TableCell>
                    <Chip
                      label={INTAKE_STATUS_LABELS[item.current_status]?.label || item.current_status}
                      color={INTAKE_STATUS_LABELS[item.current_status]?.color || 'default'}
                      size="small"
                      sx={{ fontWeight: 600, fontSize: '0.7rem', cursor: item.is_locked ? 'default' : 'pointer', height: 24 }}
                      onClick={item.is_locked ? undefined : (e) => { setStatusAnchor(e.currentTarget); setStatusTargetId(item.id); }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}><Typography variant="body2" noWrap sx={{ maxWidth: 170 }}>{item.remarks || '-'}</Typography></TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0}>
                      {item.source_voucher_id && <Tooltip title="원전표"><IconButton size="small" onClick={() => router.push(`/settlement/vouchers/${item.source_voucher_id}`)} sx={{ color: 'primary.main' }}><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>}
                      {!item.is_locked && <Tooltip title="삭제"><IconButton size="small" onClick={() => setDeleteTarget(item)} sx={{ color: 'error.main' }}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}

              {/* 합계 행 */}
              {!loading && items.length > 0 && summary && (
                <TableRow sx={{
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  '& .MuiTableCell-root': { fontWeight: 700, fontSize: '0.8rem', borderTop: `2px solid ${alpha(theme.palette.primary.main, 0.2)}`, py: 1.5 },
                }}>
                  <TableCell colSpan={7} sx={{ textAlign: 'right', pr: 2 }}>
                    <Chip label={`합계 (${summary.total_count.toLocaleString()}건)`} size="small"
                      sx={{ fontWeight: 700, fontSize: '0.75rem', bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(summary.total_actual_purchase_price)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(summary.total_intake_price)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: marginColor(summary.total_margin) }}>{fmtAmt(summary.total_margin)}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={total} page={page} onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]} labelRowsPerPage="페이지당"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count !== -1 ? count : `${to}+`}`}
          sx={{ borderTop: `1px solid ${theme.palette.divider}` }} />
      </Paper>

      {/* 상태 변경 메뉴 */}
      <Menu anchorEl={statusAnchor} open={!!statusAnchor} onClose={() => { setStatusAnchor(null); setStatusTargetId(null); }}>
        {INTAKE_STATUS_OPTIONS.map((o) => (
          <MenuItem key={o.value} onClick={() => handleStatusChange(o.value)} sx={{ fontSize: '0.85rem' }}>
            <Chip label={o.label} color={INTAKE_STATUS_LABELS[o.value]?.color || 'default'} size="small" sx={{ mr: 1, height: 22, fontSize: '0.7rem' }} />
            {o.label}
          </MenuItem>
        ))}
      </Menu>

      {/* 삭제 다이얼로그 */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>반입 내역 삭제</DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <Stack spacing={1}>
              <Typography variant="body2">다음 반입 내역을 삭제하시겠습니까?</Typography>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="body2" fontWeight={600}>{deleteTarget.model_name || deleteTarget.pg_no || '-'}</Typography>
                <Typography variant="caption" color="text.secondary">
                  S/N: {deleteTarget.serial_number || '-'} | 반입일: {deleteTarget.intake_date}
                </Typography>
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>취소</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}>삭제</Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
