'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, TextField, MenuItem, Select, InputLabel, FormControl,
  Chip, Button, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, AlertTitle,
  Typography,
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
  AppDataTable,
  AppIconActionButton,
  SettlementStatusChip,
  PaymentStatusChip,
  type AppColumnDef,
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

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────
const formatAmount = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

const TABULAR_NUMS_SX = { fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' };

/**
 * 전표 원장 - 전표 목록
 * 필터/검색/페이징/정렬/다중선택/일괄삭제
 */
export default function VouchersPage() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();

  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [search, setSearch] = useState('');
  const [voucherType, setVoucherType] = useState('');
  const [loading, setLoading] = useState(true);

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

  // ─── 컬럼 정의 ──────────────────────────────────────────────────────────────

  const columns = useMemo<AppColumnDef<VoucherRow>[]>(() => [
    {
      field: 'trade_date',
      headerName: '매입/판매일',
    },
    {
      field: 'counterparty_name',
      headerName: '거래처',
      cellSx: { fontWeight: 500 },
    },
    {
      field: 'voucher_number',
      headerName: '전표번호',
      renderCell: (row) => (
        <code style={{ fontSize: '0.8em', opacity: 0.8 }}>{row.voucher_number}</code>
      ),
    },
    {
      field: 'voucher_type',
      headerName: '타입',
      sortable: false,
      renderCell: (row) => (
        <Chip
          label={row.voucher_type === 'sales' ? '판매' : '매입'}
          size="small"
          color={row.voucher_type === 'sales' ? 'primary' : 'secondary'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'quantity',
      headerName: '수량',
      align: 'right',
      sum: true,
      renderCell: (row) => formatAmount(row.quantity),
      renderSumCell: (v) => formatAmount(v as number),
    },
    {
      field: 'total_amount',
      headerName: '금액',
      align: 'right',
      sum: true,
      renderCell: (row) => formatAmount(row.total_amount),
      renderSumCell: (v) => formatAmount(v as number),
      cellSx: { fontWeight: 600, ...TABULAR_NUMS_SX },
    },
    {
      field: 'settlement_status',
      headerName: '정산상태',
      align: 'center',
      sortable: false,
      renderCell: (row) => (
        <SettlementStatusChip status={row.settlement_status as 'open' | 'settling' | 'settled' | 'locked'} />
      ),
    },
    {
      field: 'payment_status',
      headerName: '지급상태',
      align: 'center',
      sortable: false,
      renderCell: (row) => (
        <PaymentStatusChip status={row.payment_status as 'unpaid' | 'partial' | 'paid' | 'locked'} />
      ),
    },
    {
      field: 'balance',
      headerName: '잔액',
      align: 'right',
      sum: true,
      renderCell: (row) => formatAmount(row.balance),
      renderSumCell: (v) => {
        const num = v as number;
        return (
          <Box component="span" sx={{ color: num > 0 ? 'error.main' : 'success.main' }}>
            {formatAmount(num)}
          </Box>
        );
      },
      cellSxFn: (row: VoucherRow) => ({
        fontWeight: 700,
        ...TABULAR_NUMS_SX,
        color: row.balance > 0 ? 'error.main' : 'success.main',
      }),
    },
  ], []);

  // ─── 전체 삭제 ──────────────────────────────────────────────────────────────
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const batchSize = 200;
      let totalDeleted = 0;

      // 반복: 항상 page 1 조회 → 삭제 → 남은 게 없거나 더 못 지우면 종료
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await settlementApi.listVouchers({ page: 1, page_size: batchSize });
        const data = res.data as unknown as { vouchers: VoucherRow[]; total: number };
        const ids = (data.vouchers || []).map((v) => v.id);
        if (ids.length === 0) break;

        const delRes = await settlementApi.batchDeleteVouchers(ids);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (delRes.data as any)?.data ?? delRes.data;
        totalDeleted += result.deleted_count ?? 0;

        // 하나도 삭제 못했으면 (전부 마감/연결) 무한루프 방지
        if ((result.deleted_count ?? 0) === 0) break;
      }

      enqueueSnackbar(
        totalDeleted > 0 ? `전체 ${totalDeleted}건 삭제 완료` : '삭제할 전표가 없습니다',
        { variant: totalDeleted > 0 ? 'success' : 'info' },
      );
      setDeleteAllDialogOpen(false);
      setSelected(new Set());
      loadVouchers();
    } catch {
      enqueueSnackbar('전체 삭제에 실패했습니다', { variant: 'error' });
    } finally {
      setDeletingAll(false);
    }
  };

  // ─── 헤더 액션 ──────────────────────────────────────────────────────────────
  const headerActions = [
    ...(selected.size > 0 ? [{
      label: `${selected.size}건 삭제`,
      onClick: () => setDeleteDialogOpen(true),
      variant: 'contained' as const,
      color: 'error' as const,
      icon: <DeleteIcon />,
    }] : []),
    {
      label: '전체 삭제 (테스트)',
      onClick: () => setDeleteAllDialogOpen(true),
      variant: 'outlined' as const,
      color: 'error' as const,
      icon: <DeleteIcon />,
    },
  ];

  // ─── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <AppPageContainer>
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
              <InputLabel shrink>전표 타입</InputLabel>
              <Select
                label="전표 타입"
                value={voucherType}
                onChange={(e) => { setVoucherType(e.target.value); setPage(0); }}
                displayEmpty
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

      <AppDataTable<VoucherRow>
        columns={columns}
        rows={vouchers}
        getRowKey={(r) => r.id}
        defaultSortField="trade_date"
        defaultSortOrder="desc"
        loading={loading}
        emptyMessage="전표가 없습니다. UPM 전표를 업로드하여 시작하세요."
        emptyIcon={<ReceiptIcon sx={{ fontSize: 40, opacity: 0.4 }} />}
        count={total}
        page={page}
        rowsPerPage={pageSize}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[25, 50, 100]}
        selectable
        selected={selected}
        onSelectionChange={setSelected}
        isRowSelectable={(v) => !isLocked(v)}
        onRowClick={(v) => router.push(`/settlement/vouchers/${v.id}`)}
        getRowSx={(v) => ({
          cursor: 'pointer',
          opacity: isLocked(v) ? 0.7 : 1,
        })}
        renderActions={(v) => (
          <AppIconActionButton
            icon={<ViewIcon />}
            tooltip="상세 보기"
            onClick={() => router.push(`/settlement/vouchers/${v.id}`)}
            color="primary"
          />
        )}
      />

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

      {/* 전체 삭제 확인 다이얼로그 */}
      <Dialog open={deleteAllDialogOpen} onClose={() => setDeleteAllDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="error" />
          테스트용 전체 삭제
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>경고</AlertTitle>
            모든 전표 <strong>{total}건</strong>을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
          </Alert>
          <Typography variant="body2" color="text.secondary">• 마감된 전표는 건너뛰어질 수 있습니다.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteAllDialogOpen(false)} disabled={deletingAll}>취소</Button>
          <Button variant="contained" color="error" onClick={handleDeleteAll} disabled={deletingAll}>
            {deletingAll ? '삭제 중...' : '전체 삭제'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
