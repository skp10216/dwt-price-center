'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, TextField, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Tooltip, Button, alpha, InputAdornment, useTheme,
  Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, Alert, AlertTitle,
  TableSortLabel, Typography,
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
import {
  AppPageContainer,
  AppPageHeader,
  AppPageToolbar,
  AppTableShell,
  AppIconActionButton,
  SettlementStatusChip,
  PaymentStatusChip,
} from '@/components/ui';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

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

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────
const formatAmount = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

/**
 * 전표 원장 - 전표 목록
 * 필터/검색/페이징/정렬/다중선택/일괄삭제
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

  // ─── 데이터 로드 ────────────────────────────────────────────────────────────

  const loadVouchers = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = { page: page + 1, page_size: pageSize };
      if (search) params.search = search;
      if (voucherType) params.voucher_type = voucherType;

      const res = await settlementApi.listVouchers(params);
      const data = res.data as unknown as { vouchers: VoucherRow[]; total: number };
      setVouchers(data.vouchers || []);
      setTotal(data.total || 0);
      setSelected(new Set());
    } catch {
      enqueueSnackbar('전표 목록 조회에 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, voucherType, enqueueSnackbar]);

  useEffect(() => { loadVouchers(); }, [loadVouchers]);

  // ─── 클라이언트 정렬 ────────────────────────────────────────────────────────

  const sortedVouchers = useMemo(() => {
    const sorted = [...vouchers];
    sorted.sort((a, b) => {
      let aVal: string | number = a[sortField];
      let bVal: string | number = b[sortField];
      if (['quantity', 'total_amount', 'balance'].includes(sortField)) {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
        return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      }
      aVal = String(aVal || '');
      bVal = String(bVal || '');
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return sorted;
  }, [vouchers, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  // ─── 선택 핸들러 ────────────────────────────────────────────────────────────

  const selectableVouchers = sortedVouchers.filter(
    v => v.settlement_status !== 'locked' && v.payment_status !== 'locked'
  );
  const isAllSelected = selectableVouchers.length > 0 && selectableVouchers.every(v => selected.has(v.id));
  const isSomeSelected = selectableVouchers.some(v => selected.has(v.id)) && !isAllSelected;

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelected(new Set(selectableVouchers.map(v => v.id)));
    else setSelected(new Set());
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  // ─── 일괄 삭제 ──────────────────────────────────────────────────────────────

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
      if (result.errors?.length > 0) {
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

  const isLocked = (v: VoucherRow) => v.settlement_status === 'locked' || v.payment_status === 'locked';

  // ─── 헤더 액션 ──────────────────────────────────────────────────────────────
  const headerActions = selected.size > 0 ? [
    {
      label: `${selected.size}건 삭제`,
      onClick: () => setDeleteDialogOpen(true),
      variant: 'contained' as const,
      color: 'error' as const,
      icon: <DeleteIcon />,
    },
  ] : [];

  // ─── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <AppPageContainer>
      {/* 페이지 헤더 */}
      <AppPageHeader
        icon={<ReceiptIcon />}
        title="전표 원장"
        description="UPM 판매/매입 전표 SSOT"
        color="info"
        count={loading ? null : total}
        onRefresh={loadVouchers}
        loading={loading}
        actions={headerActions}
      />

      {/* 필터 툴바 */}
      <AppPageToolbar
        left={
          <>
            <TextField
              size="small"
              placeholder="전표번호/거래처명 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadVouchers()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 240 }}
            />
            <FormControl size="small" sx={{ minWidth: 130 }}>
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
          </>
        }
        right={
          <Button variant="outlined" size="small" onClick={loadVouchers}>
            조회
          </Button>
        }
      />

      {/* 전표 테이블 */}
      <AppTableShell
        loading={loading}
        isEmpty={!loading && sortedVouchers.length === 0}
        emptyMessage="전표가 없습니다. UPM 전표를 업로드하여 시작하세요."
        emptyIcon={<ReceiptIcon sx={{ fontSize: 40, opacity: 0.4 }} />}
        count={total}
        page={page}
        rowsPerPage={pageSize}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[25, 50, 100]}
        stickyHeader
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ width: 42 }}>
                <Checkbox
                  size="small"
                  indeterminate={isSomeSelected}
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </TableCell>
              {([
                { field: 'trade_date', label: '매입/판매일', align: 'left' as const },
                { field: 'counterparty_name', label: '거래처', align: 'left' as const },
                { field: 'voucher_number', label: '전표번호', align: 'left' as const },
              ] as const).map(({ field, label, align }) => (
                <TableCell key={field} align={align}>
                  <TableSortLabel
                    active={sortField === field}
                    direction={sortField === field ? sortOrder : 'desc'}
                    onClick={() => handleSort(field)}
                  >
                    {label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell>타입</TableCell>
              {([
                { field: 'quantity', label: '수량', align: 'right' as const },
                { field: 'total_amount', label: '금액', align: 'right' as const },
              ] as const).map(({ field, label, align }) => (
                <TableCell key={field} align={align}>
                  <TableSortLabel
                    active={sortField === field}
                    direction={sortField === field ? sortOrder : 'desc'}
                    onClick={() => handleSort(field)}
                  >
                    {label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell align="center">정산상태</TableCell>
              <TableCell align="center">지급상태</TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortField === 'balance'}
                  direction={sortField === 'balance' ? sortOrder : 'desc'}
                  onClick={() => handleSort('balance')}
                >
                  잔액
                </TableSortLabel>
              </TableCell>
              <TableCell align="center">상세</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {[42, 90, '20%', 80, 55, 40, 80, 60, 60, 60, 32].map((w, j) => (
                    <TableCell key={j}>
                      <Box sx={{ width: w, height: 16, bgcolor: 'action.hover', borderRadius: 0.5, mx: j === 7 || j === 8 || j === 10 ? 'auto' : undefined }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
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
                    <TableCell>
                      <code style={{ fontSize: '0.8em', opacity: 0.8 }}>{v.voucher_number}</code>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={v.voucher_type === 'sales' ? '판매' : '매입'}
                        size="small"
                        color={v.voucher_type === 'sales' ? 'primary' : 'secondary'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    </TableCell>
                    <TableCell align="right">{v.quantity}</TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 600,
                        fontFeatureSettings: '"tnum"',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatAmount(v.total_amount)}
                    </TableCell>
                    <TableCell align="center">
                      <SettlementStatusChip
                        status={v.settlement_status as 'open' | 'settling' | 'settled' | 'locked'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <PaymentStatusChip
                        status={v.payment_status as 'unpaid' | 'partial' | 'paid' | 'locked'}
                      />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 700,
                        fontFeatureSettings: '"tnum"',
                        fontVariantNumeric: 'tabular-nums',
                        color: v.balance > 0 ? 'error.main' : 'success.main',
                      }}
                    >
                      {formatAmount(v.balance)}
                    </TableCell>
                    <TableCell align="center">
                      <AppIconActionButton
                        icon={<ViewIcon />}
                        tooltip="상세 보기"
                        onClick={(e) => { e.stopPropagation(); router.push(`/settlement/vouchers/${v.id}`); }}
                        color="primary"
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </AppTableShell>

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
          <Typography variant="body2" color="text.secondary" gutterBottom>• 마감된 전표는 삭제되지 않습니다.</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>• 입금/송금 내역이 연결된 전표는 삭제되지 않습니다.</Typography>
          <Typography variant="body2" color="text.secondary">• 삭제된 전표는 복구할 수 없습니다.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>취소</Button>
          <Button variant="contained" color="error" onClick={handleBatchDelete} disabled={deleting}>
            {deleting ? '삭제 중...' : `${selected.size}건 삭제`}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
