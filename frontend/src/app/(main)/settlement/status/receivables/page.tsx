'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, Stack, TextField,
  InputAdornment, alpha, useTheme, IconButton, Tooltip, Card, CardContent, Grid,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { settlementApi } from '@/lib/api';

interface ReceivableRow {
  counterparty_id: string;
  counterparty_name: string;
  total_sales: number;
  total_received: number;
  outstanding: number;
  voucher_count: number;
  oldest_open_date: string | null;
}

interface ReceivableSummary {
  total_outstanding: number;
  counterparty_count: number;
  overdue_count: number;
}

/**
 * 미수 현황 (Receivables)
 */
export default function ReceivablesPage() {
  const theme = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [summary, setSummary] = useState<ReceivableSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.getReceivables({ page: page + 1, page_size: pageSize, search: search || undefined });
      const data = res.data as unknown as { rows: ReceivableRow[]; total: number; summary: ReceivableSummary };
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setSummary(data.summary || null);
    } catch {
      // handle
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { loadData(); }, [loadData]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>미수 현황</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        판매 전표 기준 거래처별 미수금 현황을 확인합니다.
      </Typography>

      {/* 요약 카드 */}
      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.04) }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">미수 총액</Typography>
                <Typography variant="h5" fontWeight={700} color="error.main">{formatAmount(summary.total_outstanding)}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">미수 거래처 수</Typography>
                <Typography variant="h5" fontWeight={700}>{summary.counterparty_count}개</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">연체 건수</Typography>
                <Typography variant="h5" fontWeight={700} color="warning.main">{summary.overdue_count}건</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* 검색 */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            size="small"
            placeholder="거래처명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData()}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 250 }}
          />
          <Tooltip title="새로고침"><IconButton onClick={loadData}><RefreshIcon /></IconButton></Tooltip>
        </Stack>
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.error.main, 0.04) }}>
              <TableCell sx={{ fontWeight: 700 }}>거래처</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>판매 총액</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>수금 총액</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>미수 잔액</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>전표 수</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>최초 미정산일</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>상세</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 8 }}>로딩 중...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                <TrendingUpIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">미수 내역이 없습니다</Typography>
              </TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.counterparty_id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{row.counterparty_name}</TableCell>
                  <TableCell align="right">{formatAmount(row.total_sales)}</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>{formatAmount(row.total_received)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>{formatAmount(row.outstanding)}</TableCell>
                  <TableCell align="right">{row.voucher_count}</TableCell>
                  <TableCell>{row.oldest_open_date || '-'}</TableCell>
                  <TableCell align="center">
                    <Tooltip title="거래처 전표 보기">
                      <IconButton size="small" onClick={() => router.push(`/settlement/vouchers?counterparty=${row.counterparty_id}&type=sales`)}>
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
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
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="페이지당 행:"
        />
      </TableContainer>
    </Box>
  );
}
