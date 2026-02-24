'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, TextField, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Tooltip, Typography, IconButton, InputAdornment,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Balance as BalanceIcon,
  Visibility as ViewIcon,
  CheckCircle as ConfirmIcon,
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
import NettingWizard from '@/components/settlement/NettingWizard';
import NettingDetailDialog from '@/components/settlement/NettingDetailDialog';

// ─── 타입 ──────────────────────────────────────────────────────────

interface NettingRow {
  id: string;
  counterparty_id: string;
  counterparty_name: string;
  netting_date: string;
  netting_amount: number;
  status: string;
  memo: string | null;
  created_by_name: string;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  created_at: string;
  voucher_count: number;
}

// ─── 상수 ──────────────────────────────────────────────────────────

const formatAmount = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

const STATUS_MAP: Record<string, { label: string; color: 'warning' | 'success' | 'default' }> = {
  draft: { label: '초안', color: 'warning' },
  confirmed: { label: '확정', color: 'success' },
  cancelled: { label: '취소', color: 'default' },
};

/**
 * 상계 관리 페이지
 * AR/AP 상계 목록 + 위자드를 통한 상계 생성
 */
export default function NettingPage() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();

  // 데이터
  const [nettings, setNettings] = useState<NettingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);

  // 필터
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // 다이얼로그
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  // ─── 데이터 로드 ──────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = {
        page: page + 1,
        page_size: pageSize,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await settlementApi.listNettings(params);
      const data = res.data as unknown as { records: NettingRow[]; total: number };
      setNettings(data.records || []);
      setTotal(data.total || 0);
    } catch {
      enqueueSnackbar('상계 목록 조회에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, dateFrom, dateTo, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── 액션 ──────────────────────────────────────────────────────

  const handleConfirm = async (id: string) => {
    if (!confirm('이 상계를 확정하시겠습니까? 확정 후 입출금이 자동 생성됩니다.')) return;
    try {
      await settlementApi.confirmNetting(id);
      enqueueSnackbar('상계가 확정되었습니다.', { variant: 'success' });
      loadData();
    } catch {
      enqueueSnackbar('상계 확정에 실패했습니다.', { variant: 'error' });
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('이 상계를 취소하시겠습니까?')) return;
    try {
      await settlementApi.cancelNetting(id);
      enqueueSnackbar('상계가 취소되었습니다.', { variant: 'success' });
      loadData();
    } catch {
      enqueueSnackbar('상계 취소에 실패했습니다.', { variant: 'error' });
    }
  };

  // ─── 합계 ──────────────────────────────────────────────────────

  const totalNettingAmount = nettings.reduce((s, n) => s + (n.netting_amount || 0), 0);

  // ─── 렌더 ──────────────────────────────────────────────────────

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<BalanceIcon />}
        title="상계 관리"
        description="AR/AP 상계 처리 — 동일 거래처의 매출·매입 전표를 상쇄"
        color="info"
        count={total}
        actions={[
          {
            label: '상계 생성',
            onClick: () => setWizardOpen(true),
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
              placeholder="거래처명 검색"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              sx={{ minWidth: 180 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>상태</InputLabel>
              <Select value={statusFilter} label="상태" onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="draft">초안</MenuItem>
                <MenuItem value="confirmed">확정</MenuItem>
                <MenuItem value="cancelled">취소</MenuItem>
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
        isEmpty={nettings.length === 0}
        emptyMessage="상계 내역이 없습니다."
        page={page}
        rowsPerPage={pageSize}
        count={total}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>상계일</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>거래처</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>상계금액</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>전표수</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>생성자</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>확정일</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>메모</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>액션</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {nettings.map((row) => {
              const statusInfo = STATUS_MAP[row.status] || { label: row.status, color: 'default' as const };
              const isCancelled = row.status === 'cancelled';

              return (
                <TableRow key={row.id} hover sx={{ opacity: isCancelled ? 0.5 : 1 }}>
                  <TableCell>{row.netting_date}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, fontWeight: 500 }}
                      onClick={() => router.push(`/settlement/counterparties/${row.counterparty_id}`)}
                    >
                      {row.counterparty_name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {formatAmount(row.netting_amount)}
                  </TableCell>
                  <TableCell align="center">{row.voucher_count}</TableCell>
                  <TableCell>
                    <Chip label={statusInfo.label} color={statusInfo.color} size="small" />
                  </TableCell>
                  <TableCell>{row.created_by_name}</TableCell>
                  <TableCell>
                    {row.confirmed_at
                      ? new Date(row.confirmed_at).toLocaleDateString('ko-KR')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 150 }}>
                      {row.memo || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <Tooltip title="상세 보기">
                        <IconButton
                          size="small"
                          onClick={() => { setSelectedId(row.id); setDetailOpen(true); }}
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {row.status === 'draft' && (
                        <>
                          <Tooltip title="확정">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleConfirm(row.id)}
                            >
                              <ConfirmIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="취소">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleCancel(row.id)}
                            >
                              <CancelIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {nettings.length > 0 && (
            <TableRow>
              <TableCell colSpan={2} sx={{ fontWeight: 700 }}>합계</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                {formatAmount(totalNettingAmount)}
              </TableCell>
              <TableCell colSpan={6} />
            </TableRow>
          )}
        </Table>
      </AppTableShell>

      {/* 상계 생성 위자드 */}
      <NettingWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={loadData}
      />

      {/* 상계 상세 다이얼로그 */}
      <NettingDetailDialog
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedId(''); }}
        nettingId={selectedId}
        onAction={loadData}
      />
    </AppPageContainer>
  );
}
