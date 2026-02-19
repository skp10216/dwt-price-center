'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, TextField, MenuItem, Select, InputLabel, FormControl,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Chip, IconButton, Tooltip, Button, Stack, alpha, InputAdornment, useTheme,
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { settlementApi } from '@/lib/api';

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
 * 전표 원장 - 전표 목록 (필터/검색/페이징)
 */
export default function VouchersPage() {
  const router = useRouter();
  const theme = useTheme();
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [voucherType, setVoucherType] = useState('');
  const [loading, setLoading] = useState(true);

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
      const data = res.data as { vouchers: VoucherRow[]; total: number };
      setVouchers(data.vouchers || []);
      setTotal(data.total || 0);
    } catch {
      // 에러 핸들링
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, voucherType]);

  useEffect(() => { loadVouchers(); }, [loadVouchers]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ko-KR').format(amount);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>전표 원장</Typography>
          <Typography variant="body2" color="text.secondary">
            UPM 판매/매입 전표 SSOT
          </Typography>
        </Box>
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
              <TableCell sx={{ fontWeight: 700 }}>매입/판매일</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>거래처</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>전표번호</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>타입</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>수량</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>금액</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>정산상태</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>지급상태</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>잔액</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>상세</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 8 }}>
                  <Typography color="text.secondary">로딩 중...</Typography>
                </TableCell>
              </TableRow>
            ) : vouchers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 8 }}>
                  <ReceiptIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">전표가 없습니다</Typography>
                </TableCell>
              </TableRow>
            ) : (
              vouchers.map((v) => (
                <TableRow
                  key={v.id}
                  hover
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.04) } }}
                  onClick={() => router.push(`/settlement/vouchers/${v.id}`)}
                >
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
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="페이지당 행:"
        />
      </TableContainer>
    </Box>
  );
}
