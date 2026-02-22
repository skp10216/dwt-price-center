'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, TextField, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Chip, IconButton, Tooltip, Button, Stack, alpha, InputAdornment, useTheme,
  Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, Alert, AlertTitle,
  TableSortLabel,
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  Receipt as ReceiptIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

interface VoucherRow {
  id: string;
  trade_date: string;
  counterparty_name: string;
  voucher_number: string;
  voucher_type: string;
  quantity: number;
  total_amount: number;
  settlement_status: string;
  payment_status: string;
  total_receipts: number;
  total_payments: number;
  balance: number;
}

type SortField = 'trade_date' | 'counterparty_name' | 'voucher_number' | 'quantity' | 'total_amount' | 'balance';
type SortOrder = 'asc' | 'desc';

const statusColors: Record<string, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
  open: 'error',
  settling: 'warning',
  settled: 'success',
  locked: 'default',
  unpaid: 'error',
  partial: 'warning',
  paid: 'success',
};

const statusLabels: Record<string, string> = {
  open: '미정산',
  settling: '정산중',
  settled: '정산완료',
  locked: '마감',
  unpaid: '미지급',
  partial: '부분지급',
  paid: '지급완료',
};

/**
 * 전표 원장 - 전표 목록 (필터/검색/페이징/정렬/다중선택/일괄삭제)
 */
export default function VouchersPage() {
  const router = useRouter();
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [search, setSearch] = useState('');
  const [voucherType, setVoucherType] = useState('');
  const [loading, setLoading] = useState(true);

  // 정렬 상태
  const [sortField, setSortField] = useState<SortField>('trade_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // 다중 선택 상태
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 삭제 다이얼로그 상태
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadVouchers = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = {
        page: page + 1,
        page_size: pageSize,
      };
      if (search) params.search = search;
      if (voucherType) params.voucher_type = voucherType;

      const res = await settlementApi.listVouchers(params);
      const data = res.data as unknown as { vouchers: VoucherRow[]; total: number };
      setVouchers(data.vouchers || []);
      setTotal(data.total || 0);
      // 페이지 변경 시 선택 초기화
      setSelected(new Set());
    } catch {
      enqueueSnackbar('전표 목록 조회에 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, voucherType, enqueueSnackbar]);

  useEffect(() => { loadVouchers(); }, [loadVouchers]);

  // 클라이언트 정렬 (서버 정렬이 없는 경우)
  const sortedVouchers = useMemo(() => {
    const sorted = [...vouchers];
    sorted.sort((a, b) => {
      let aVal: string | number = a[sortField];
      let bVal: string | number = b[sortField];

      // 숫자 필드
      if (['quantity', 'total_amount', 'balance'].includes(sortField)) {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
        return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      }

      // 문자열 필드
      aVal = String(aVal || '');
      bVal = String(bVal || '');
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return sorted;
  }, [vouchers, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // 선택 핸들러
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // 마감되지 않은 전표만 선택
      const selectable = sortedVouchers.filter(v => v.settlement_status !== 'locked' && v.payment_status !== 'locked');
      setSelected(new Set(selectable.map(v => v.id)));
    } else {
      setSelected(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectableVouchers = sortedVouchers.filter(v => v.settlement_status !== 'locked' && v.payment_status !== 'locked');
  const isAllSelected = selectableVouchers.length > 0 && selectableVouchers.every(v => selected.has(v.id));
  const isSomeSelected = selectableVouchers.some(v => selected.has(v.id)) && !isAllSelected;

  // 일괄 삭제
  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await settlementApi.batchDeleteVouchers(Array.from(selected));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (res.data as any)?.data ?? res.data;
      enqueueSnackbar(
        `${result.deleted_count}건 삭제 완료${result.skipped_count > 0 ? ` / ${result.skipped_count}건 건너뜀` : ''}`,
        { variant: result.deleted_count > 0 ? 'success' : 'warning' }
      );
      if (result.errors && result.errors.length > 0) {
        result.errors.slice(0, 3).forEach((err: string) => enqueueSnackbar(err, { variant: 'warning' }));
      }
      setDeleteDialogOpen(false);
      setSelected(new Set());
      loadVouchers();
    } catch {
      enqueueSnackbar('삭제에 실패했습니다', { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ko-KR').format(amount);

  const isLocked = (v: VoucherRow) => v.settlement_status === 'locked' || v.payment_status === 'locked';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>전표 원장</Typography>
          <Typography variant="body2" color="text.secondary">
            UPM 판매/매입 전표 SSOT
          </Typography>
        </Box>
        {selected.size > 0 && (
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteDialogOpen(true)}
          >
            {selected.size}건 삭제
          </Button>
        )}
      </Box>

      {/* 필터 바 */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            size="small"
            placeholder="전표번호/거래처명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadVouchers()}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            }}
            sx={{ minWidth: 250 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>전표 타입</InputLabel>
            <Select
              label="전표 타입"
              value={voucherType}
              onChange={(e) => { setVoucherType(e.target.value); setPage(0); }}
            >
              <MenuItem value="">전체</MenuItem>
              <MenuItem value="sales">판매</MenuItem>
              <MenuItem value="purchase">매입</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" size="small" onClick={loadVouchers}>
            조회
          </Button>
        </Stack>
      </Paper>

      {/* 전표 테이블 */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.info.main, 0.04) }}>
              <TableCell padding="checkbox" sx={{ width: 42 }}>
                <Checkbox
                  size="small"
                  indeterminate={isSomeSelected}
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>
                <TableSortLabel
                  active={sortField === 'trade_date'}
                  direction={sortField === 'trade_date' ? sortOrder : 'desc'}
                  onClick={() => handleSort('trade_date')}
                >
                  매입/판매일
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>
                <TableSortLabel
                  active={sortField === 'counterparty_name'}
                  direction={sortField === 'counterparty_name' ? sortOrder : 'desc'}
                  onClick={() => handleSort('counterparty_name')}
                >
                  거래처
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>
                <TableSortLabel
                  active={sortField === 'voucher_number'}
                  direction={sortField === 'voucher_number' ? sortOrder : 'desc'}
                  onClick={() => handleSort('voucher_number')}
                >
                  전표번호
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>타입</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                <TableSortLabel
                  active={sortField === 'quantity'}
                  direction={sortField === 'quantity' ? sortOrder : 'desc'}
                  onClick={() => handleSort('quantity')}
                >
                  수량
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                <TableSortLabel
                  active={sortField === 'total_amount'}
                  direction={sortField === 'total_amount' ? sortOrder : 'desc'}
                  onClick={() => handleSort('total_amount')}
                >
                  금액
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>정산상태</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>지급상태</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                <TableSortLabel
                  active={sortField === 'balance'}
                  direction={sortField === 'balance' ? sortOrder : 'desc'}
                  onClick={() => handleSort('balance')}
                >
                  잔액
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>상세</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              // Skeleton 로딩 상태
              [...Array(8)].map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell padding="checkbox"><Box sx={{ width: 18, height: 18, bgcolor: 'action.hover', borderRadius: 0.5 }} /></TableCell>
                  <TableCell><Box sx={{ width: 80, height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                  <TableCell><Box sx={{ width: '80%', height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                  <TableCell><Box sx={{ width: 60, height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                  <TableCell><Box sx={{ width: 50, height: 22, bgcolor: 'action.hover', borderRadius: 2 }} /></TableCell>
                  <TableCell align="right"><Box sx={{ width: 40, height: 20, bgcolor: 'action.hover', borderRadius: 1, ml: 'auto' }} /></TableCell>
                  <TableCell align="right"><Box sx={{ width: 70, height: 20, bgcolor: 'action.hover', borderRadius: 1, ml: 'auto' }} /></TableCell>
                  <TableCell align="center"><Box sx={{ width: 50, height: 22, bgcolor: 'action.hover', borderRadius: 2, mx: 'auto' }} /></TableCell>
                  <TableCell align="right"><Box sx={{ width: 60, height: 20, bgcolor: 'action.hover', borderRadius: 1, ml: 'auto' }} /></TableCell>
                  <TableCell align="right"><Box sx={{ width: 60, height: 20, bgcolor: 'action.hover', borderRadius: 1, ml: 'auto' }} /></TableCell>
                  <TableCell align="center"><Box sx={{ width: 28, height: 28, bgcolor: 'action.hover', borderRadius: 1, mx: 'auto' }} /></TableCell>
                </TableRow>
              ))
            ) : sortedVouchers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 10 }}>
                  <Box sx={{
                    width: 72, height: 72, borderRadius: '50%', mx: 'auto', mb: 2,
                    bgcolor: alpha(theme.palette.info.main, 0.08),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ReceiptIcon sx={{ fontSize: 36, color: 'info.main' }} />
                  </Box>
                  <Typography variant="h6" fontWeight={600} gutterBottom>전표가 없습니다</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    UPM 전표를 업로드하여 시작하세요
                  </Typography>
                  <Button variant="contained" onClick={() => router.push('/settlement/upload/sales')}
                    sx={{ borderRadius: 2, fontWeight: 600 }}>
                    전표 업로드하기
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              sortedVouchers.map((v) => {
                const locked = isLocked(v);
                const isChecked = selected.has(v.id);
                return (
                  <TableRow
                    key={v.id}
                    hover
                    selected={isChecked}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.04) },
                      opacity: locked ? 0.7 : 1,
                    }}
                    onClick={() => router.push(`/settlement/vouchers/${v.id}`)}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={isChecked}
                        disabled={locked}
                        onChange={(e) => handleSelectOne(v.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>{v.trade_date}</TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>{v.counterparty_name}</TableCell>
                    <TableCell><code style={{ fontSize: '0.85em' }}>{v.voucher_number}</code></TableCell>
                    <TableCell>
                      <Chip
                        label={v.voucher_type === 'sales' ? '판매' : '매입'}
                        size="small"
                        color={v.voucher_type === 'sales' ? 'primary' : 'secondary'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">{v.quantity}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatAmount(v.total_amount)}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={statusLabels[v.settlement_status] || v.settlement_status}
                        size="small"
                        color={statusColors[v.settlement_status] || 'default'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={statusLabels[v.payment_status] || v.payment_status}
                        size="small"
                        color={statusColors[v.payment_status] || 'default'}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: v.balance > 0 ? 'error.main' : 'success.main' }}>
                      {formatAmount(v.balance)}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="상세 보기">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); router.push(`/settlement/vouchers/${v.id}`); }}>
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage="페이지당 행:"
        />
      </TableContainer>

      {/* 일괄 삭제 확인 다이얼로그 */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="error" />
          전표 일괄 삭제
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>주의</AlertTitle>
            선택한 <strong>{selected.size}건</strong>의 전표를 삭제합니다.
          </Alert>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            • 마감된 전표는 삭제되지 않습니다.
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            • 입금/송금 내역이 연결된 전표는 삭제되지 않습니다.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • 삭제된 전표는 복구할 수 없습니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            취소
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleBatchDelete}
            disabled={deleting}
          >
            {deleting ? '삭제 중...' : `${selected.size}건 삭제`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
