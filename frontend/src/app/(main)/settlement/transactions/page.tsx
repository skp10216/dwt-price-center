'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, TextField, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableFooter, TableHead, TableRow,
  Chip, Tooltip, Button, alpha, InputAdornment, useTheme,
  TableSortLabel, Typography, IconButton,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  SwapHoriz as SwapHorizIcon,
  AccountTree as AllocIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import {
  AppPageContainer,
  AppPageHeader,
  AppPageToolbar,
  AppTableShell,
} from '@/components/ui';
import TransactionCreateDialog from '@/components/settlement/TransactionCreateDialog';
import AllocationDialog from '@/components/settlement/AllocationDialog';

// ─── 타입 ──────────────────────────────────────────────────────────

interface TransactionRow {
  id: string;
  counterparty_id: string;
  counterparty_name: string;
  transaction_type: string;
  transaction_date: string;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  memo: string | null;
  source: string;
  status: string;
  created_at: string;
}

type SortField = 'transaction_date' | 'counterparty_name' | 'amount' | 'allocated_amount' | 'unallocated_amount';
type SortOrder = 'asc' | 'desc';

// ─── 유틸리티 ──────────────────────────────────────────────────────

const formatAmount = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

const TYPE_LABELS: Record<string, { label: string; color: 'info' | 'secondary' }> = {
  DEPOSIT: { label: '입금', color: 'info' },
  WITHDRAWAL: { label: '출금', color: 'secondary' },
};

const STATUS_LABELS: Record<string, { label: string; color: 'error' | 'warning' | 'success' | 'default' }> = {
  PENDING: { label: '미배분', color: 'error' },
  PARTIAL: { label: '부분배분', color: 'warning' },
  ALLOCATED: { label: '전액배분', color: 'success' },
  CANCELLED: { label: '취소', color: 'default' },
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: '수동',
  BANK_IMPORT: '은행',
  NETTING: '상계',
};

/**
 * 입출금 관리 페이지
 * 거래처 수준 입출금 이벤트 목록 + 등록 + 배분 관리
 */
export default function TransactionsPage() {
  const router = useRouter();
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  // 데이터
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);

  // 필터
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // 정렬
  const [sortField, setSortField] = useState<SortField>('transaction_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // 다이얼로그
  const [createOpen, setCreateOpen] = useState(false);
  const [allocDialogOpen, setAllocDialogOpen] = useState(false);
  const [selectedTxnId, setSelectedTxnId] = useState('');

  // ─── 데이터 로드 ──────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = {
        page: page + 1,
        page_size: pageSize,
      };
      if (search) params.search = search;
      if (typeFilter) params.transaction_type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source = sourceFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await settlementApi.listTransactions(params);
      const data = res.data as unknown as { transactions: TransactionRow[]; total: number };
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch {
      enqueueSnackbar('입출금 목록 조회에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, typeFilter, statusFilter, sourceFilter, dateFrom, dateTo, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── 정렬 ──────────────────────────────────────────────────────

  const sortedTransactions = useMemo(() => {
    const sorted = [...transactions];
    sorted.sort((a, b) => {
      let cmp = 0;
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av || '').localeCompare(String(bv || ''));
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [transactions, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // ─── 취소 ──────────────────────────────────────────────────────

  const handleCancel = async (id: string) => {
    if (!confirm('이 입출금을 취소하시겠습니까? 연결된 배분도 모두 해제됩니다.')) return;
    try {
      await settlementApi.cancelTransaction(id);
      enqueueSnackbar('입출금이 취소되었습니다.', { variant: 'success' });
      loadData();
    } catch {
      enqueueSnackbar('취소에 실패했습니다.', { variant: 'error' });
    }
  };

  // ─── 합계 ──────────────────────────────────────────────────────

  const totalAmount = transactions.reduce((s, t) => s + (t.amount || 0), 0);
  const totalAllocated = transactions.reduce((s, t) => s + (t.allocated_amount || 0), 0);
  const totalUnallocated = transactions.reduce((s, t) => s + (t.unallocated_amount || 0), 0);

  // ─── 렌더 ──────────────────────────────────────────────────────

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<SwapHorizIcon />}
        title="입출금 관리"
        description="거래처 수준 입출금 이벤트 등록 및 전표 배분"
        color="info"
        count={total}
        actions={[
          {
            label: '입출금 등록',
            onClick: () => setCreateOpen(true),
            variant: 'contained' as const,
            icon: <AddIcon />,
          },
        ]}
      />

      {/* 필터 */}
      <AppPageToolbar
        left={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="거래처명/메모 검색"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              sx={{ minWidth: 180 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>유형</InputLabel>
              <Select value={typeFilter} label="유형" onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}>
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="DEPOSIT">입금</MenuItem>
                <MenuItem value="WITHDRAWAL">출금</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>상태</InputLabel>
              <Select value={statusFilter} label="상태" onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="PENDING">미배분</MenuItem>
                <MenuItem value="PARTIAL">부분배분</MenuItem>
                <MenuItem value="ALLOCATED">전액배분</MenuItem>
                <MenuItem value="CANCELLED">취소</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>출처</InputLabel>
              <Select value={sourceFilter} label="출처" onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}>
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="MANUAL">수동</MenuItem>
                <MenuItem value="BANK_IMPORT">은행</MenuItem>
                <MenuItem value="NETTING">상계</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              type="date"
              label="시작일"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 150 }}
            />
            <TextField
              size="small"
              type="date"
              label="종료일"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 150 }}
            />
          </Box>
        }
      />

      {/* 테이블 */}
      <AppTableShell
        loading={loading}
        isEmpty={transactions.length === 0}
        emptyMessage="입출금 내역이 없습니다."
        page={page}
        rowsPerPage={pageSize}
        count={total}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableSortLabel
                active={sortField === 'transaction_date'}
                direction={sortField === 'transaction_date' ? sortOrder : 'desc'}
                onClick={() => handleSort('transaction_date')}
              >
                <TableCell sx={{ fontWeight: 700 }}>일자</TableCell>
              </TableSortLabel>
              <TableCell sx={{ fontWeight: 700 }}>유형</TableCell>
              <TableSortLabel
                active={sortField === 'counterparty_name'}
                direction={sortField === 'counterparty_name' ? sortOrder : 'asc'}
                onClick={() => handleSort('counterparty_name')}
              >
                <TableCell sx={{ fontWeight: 700 }}>거래처</TableCell>
              </TableSortLabel>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                <TableSortLabel
                  active={sortField === 'amount'}
                  direction={sortField === 'amount' ? sortOrder : 'desc'}
                  onClick={() => handleSort('amount')}
                >
                  금액
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                <TableSortLabel
                  active={sortField === 'allocated_amount'}
                  direction={sortField === 'allocated_amount' ? sortOrder : 'desc'}
                  onClick={() => handleSort('allocated_amount')}
                >
                  배분액
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                <TableSortLabel
                  active={sortField === 'unallocated_amount'}
                  direction={sortField === 'unallocated_amount' ? sortOrder : 'desc'}
                  onClick={() => handleSort('unallocated_amount')}
                >
                  미배분
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>출처</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>메모</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>액션</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedTransactions.map((txn) => {
              const typeInfo = TYPE_LABELS[txn.transaction_type] || { label: txn.transaction_type, color: 'default' as const };
              const statusInfo = STATUS_LABELS[txn.status] || { label: txn.status, color: 'default' as const };
              const isCancelled = txn.status === 'CANCELLED';

              return (
                <TableRow
                  key={txn.id}
                  hover
                  sx={{ opacity: isCancelled ? 0.5 : 1 }}
                >
                  <TableCell>{txn.transaction_date}</TableCell>
                  <TableCell>
                    <Chip
                      label={typeInfo.label}
                      color={typeInfo.color}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { textDecoration: 'underline' },
                        fontWeight: 500,
                      }}
                      onClick={() => router.push(`/settlement/counterparties/${txn.counterparty_id}`)}
                    >
                      {txn.counterparty_name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatAmount(txn.amount)}</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>
                    {formatAmount(txn.allocated_amount)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: txn.unallocated_amount > 0 ? 700 : 400,
                      color: txn.unallocated_amount > 0 ? 'error.main' : 'text.secondary',
                    }}
                  >
                    {formatAmount(txn.unallocated_amount)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={SOURCE_LABELS[txn.source] || txn.source}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={statusInfo.label}
                      color={statusInfo.color}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 150 }}>
                      {txn.memo || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      {!isCancelled && txn.status !== 'ALLOCATED' && (
                        <Tooltip title="배분 관리">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => {
                              setSelectedTxnId(txn.id);
                              setAllocDialogOpen(true);
                            }}
                          >
                            <AllocIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {txn.status === 'ALLOCATED' && (
                        <Tooltip title="배분 상세">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedTxnId(txn.id);
                              setAllocDialogOpen(true);
                            }}
                          >
                            <AllocIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {txn.status === 'PENDING' && (
                        <Tooltip title="취소">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleCancel(txn.id)}
                          >
                            <CancelIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {transactions.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} sx={{ fontWeight: 700 }}>합계</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{formatAmount(totalAmount)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>
                  {formatAmount(totalAllocated)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>
                  {formatAmount(totalUnallocated)}
                </TableCell>
                <TableCell colSpan={4} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </AppTableShell>

      {/* 다이얼로그 */}
      <TransactionCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={loadData}
      />

      <AllocationDialog
        open={allocDialogOpen}
        onClose={() => setAllocDialogOpen(false)}
        onAllocated={loadData}
        transactionId={selectedTxnId}
      />
    </AppPageContainer>
  );
}
