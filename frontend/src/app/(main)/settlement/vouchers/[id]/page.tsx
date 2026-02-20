'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Grid, Chip, Divider, Button, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, Alert, alpha, useTheme, Card, CardContent,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

interface VoucherDetail {
  id: string;
  trade_date: string;
  counterparty_id: string;
  counterparty_name: string;
  voucher_number: string;
  voucher_type: string;
  quantity: number;
  total_amount: number;
  purchase_cost?: number;
  deduction_amount?: number;
  actual_purchase_price?: number;
  sale_amount?: number;
  actual_sale_price?: number;
  profit?: number;
  profit_rate?: number;
  settlement_status: string;
  payment_status: string;
  total_receipts: number;
  total_payments: number;
  balance: number;
  memo?: string;
  receipts: Array<{ id: string; receipt_date: string; amount: number; memo?: string; created_at: string }>;
  payments: Array<{ id: string; payment_date: string; amount: number; memo?: string; created_at: string }>;
  created_at: string;
  updated_at: string;
}

const statusLabels: Record<string, string> = {
  open: '미정산', settling: '정산중', settled: '정산완료', locked: '마감',
  unpaid: '미지급', partial: '부분지급', paid: '지급완료',
};

const statusColors: Record<string, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
  open: 'error', settling: 'warning', settled: 'success', locked: 'default',
  unpaid: 'error', partial: 'warning', paid: 'success',
};

/**
 * 전표 상세 - 입금/송금 이력 + 잔액 + 마감
 */
export default function VoucherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const voucherId = params.id as string;

  const [voucher, setVoucher] = useState<VoucherDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // 입금/송금 다이얼로그
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMemo, setFormMemo] = useState('');

  const loadVoucher = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.getVoucher(voucherId);
      setVoucher(res.data as unknown as VoucherDetail);
    } catch {
      enqueueSnackbar('전표를 불러오지 못했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [voucherId, enqueueSnackbar]);

  useEffect(() => { loadVoucher(); }, [loadVoucher]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ko-KR').format(amount);

  const handleAddReceipt = async () => {
    try {
      await settlementApi.createReceipt(voucherId, {
        receipt_date: formDate,
        amount: parseFloat(formAmount),
        memo: formMemo || null,
      });
      enqueueSnackbar('입금이 등록되었습니다', { variant: 'success' });
      setReceiptOpen(false);
      setFormDate(''); setFormAmount(''); setFormMemo('');
      loadVoucher();
    } catch {
      enqueueSnackbar('입금 등록에 실패했습니다', { variant: 'error' });
    }
  };

  const handleAddPayment = async () => {
    try {
      await settlementApi.createPayment(voucherId, {
        payment_date: formDate,
        amount: parseFloat(formAmount),
        memo: formMemo || null,
      });
      enqueueSnackbar('송금이 등록되었습니다', { variant: 'success' });
      setPaymentOpen(false);
      setFormDate(''); setFormAmount(''); setFormMemo('');
      loadVoucher();
    } catch {
      enqueueSnackbar('송금 등록에 실패했습니다', { variant: 'error' });
    }
  };

  const handleDeleteReceipt = async (receiptId: string) => {
    if (!confirm('이 입금 내역을 삭제하시겠습니까?')) return;
    try {
      await settlementApi.deleteReceipt(voucherId, receiptId);
      enqueueSnackbar('입금이 삭제되었습니다', { variant: 'success' });
      loadVoucher();
    } catch {
      enqueueSnackbar('입금 삭제에 실패했습니다', { variant: 'error' });
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('이 송금 내역을 삭제하시겠습니까?')) return;
    try {
      await settlementApi.deletePayment(voucherId, paymentId);
      enqueueSnackbar('송금이 삭제되었습니다', { variant: 'success' });
      loadVoucher();
    } catch {
      enqueueSnackbar('송금 삭제에 실패했습니다', { variant: 'error' });
    }
  };

  const handleLock = async () => {
    try {
      await settlementApi.lockVoucher(voucherId);
      enqueueSnackbar('마감 처리되었습니다', { variant: 'success' });
      loadVoucher();
    } catch {
      enqueueSnackbar('마감 처리에 실패했습니다', { variant: 'error' });
    }
  };

  const handleUnlock = async () => {
    try {
      await settlementApi.unlockVoucher(voucherId);
      enqueueSnackbar('마감 해제되었습니다', { variant: 'success' });
      loadVoucher();
    } catch {
      enqueueSnackbar('마감 해제에 실패했습니다', { variant: 'error' });
    }
  };

  if (loading) return <Typography>로딩 중...</Typography>;
  if (!voucher) return <Alert severity="error">전표를 찾을 수 없습니다</Alert>;

  const isLocked = voucher.settlement_status === 'locked' || voucher.payment_status === 'locked';
  const isSales = voucher.voucher_type === 'sales';

  return (
    <Box>
      {/* 헤더 */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => router.push('/settlement/vouchers')}><ArrowBackIcon /></IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            전표 상세 - {voucher.voucher_number}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {voucher.counterparty_name} | {voucher.trade_date}
          </Typography>
        </Box>
        <Chip
          label={isSales ? '판매' : '매입'}
          color={isSales ? 'primary' : 'secondary'}
          variant="outlined"
        />
        <Chip label={statusLabels[voucher.settlement_status]} color={statusColors[voucher.settlement_status]} />
        <Chip label={statusLabels[voucher.payment_status]} color={statusColors[voucher.payment_status]} />
        {isLocked ? (
          <Button variant="outlined" color="warning" startIcon={<LockOpenIcon />} onClick={handleUnlock}>
            마감 해제
          </Button>
        ) : (
          <Button variant="outlined" color="error" startIcon={<LockIcon />} onClick={handleLock}>
            마감
          </Button>
        )}
      </Stack>

      {/* 금액 요약 카드 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={3}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">전표 금액</Typography>
              <Typography variant="h5" fontWeight={700}>{formatAmount(voucher.total_amount)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">누적 입금</Typography>
              <Typography variant="h5" fontWeight={700} color="success.main">{formatAmount(voucher.total_receipts)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">누적 송금</Typography>
              <Typography variant="h5" fontWeight={700} color="info.main">{formatAmount(voucher.total_payments)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: voucher.balance > 0 ? alpha(theme.palette.error.main, 0.04) : alpha(theme.palette.success.main, 0.04) }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">잔액</Typography>
              <Typography variant="h5" fontWeight={700} color={voucher.balance > 0 ? 'error.main' : 'success.main'}>
                {formatAmount(voucher.balance)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 입금 이력 */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight={600}>입금(수금) 이력</Typography>
          {!isLocked && (
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setReceiptOpen(true)}>
              입금 등록
            </Button>
          )}
        </Box>
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>입금일</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>금액</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>메모</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>등록일</TableCell>
                {!isLocked && <TableCell align="center" sx={{ fontWeight: 700 }}>삭제</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {voucher.receipts.length === 0 ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>입금 내역이 없습니다</TableCell></TableRow>
              ) : (
                voucher.receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.receipt_date}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>+{formatAmount(r.amount)}</TableCell>
                    <TableCell>{r.memo || '-'}</TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleDateString('ko-KR')}</TableCell>
                    {!isLocked && (
                      <TableCell align="center">
                        <IconButton size="small" color="error" onClick={() => handleDeleteReceipt(r.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* 송금 이력 */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight={600}>송금(지급) 이력</Typography>
          {!isLocked && (
            <Button variant="contained" size="small" color="secondary" startIcon={<AddIcon />} onClick={() => setPaymentOpen(true)}>
              송금 등록
            </Button>
          )}
        </Box>
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>송금일</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>금액</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>메모</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>등록일</TableCell>
                {!isLocked && <TableCell align="center" sx={{ fontWeight: 700 }}>삭제</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {voucher.payments.length === 0 ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>송금 내역이 없습니다</TableCell></TableRow>
              ) : (
                voucher.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.payment_date}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: 'info.main' }}>-{formatAmount(p.amount)}</TableCell>
                    <TableCell>{p.memo || '-'}</TableCell>
                    <TableCell>{new Date(p.created_at).toLocaleDateString('ko-KR')}</TableCell>
                    {!isLocked && (
                      <TableCell align="center">
                        <IconButton size="small" color="error" onClick={() => handleDeletePayment(p.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* 입금 등록 다이얼로그 */}
      <Dialog open={receiptOpen} onClose={() => setReceiptOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>입금 등록</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="입금일" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="금액" type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} fullWidth />
            <TextField label="메모" value={formMemo} onChange={(e) => setFormMemo(e.target.value)} fullWidth multiline rows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiptOpen(false)}>취소</Button>
          <Button variant="contained" onClick={handleAddReceipt} disabled={!formDate || !formAmount}>등록</Button>
        </DialogActions>
      </Dialog>

      {/* 송금 등록 다이얼로그 */}
      <Dialog open={paymentOpen} onClose={() => setPaymentOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>송금 등록</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="송금일" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="금액" type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} fullWidth />
            <TextField label="메모" value={formMemo} onChange={(e) => setFormMemo(e.target.value)} fullWidth multiline rows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentOpen(false)}>취소</Button>
          <Button variant="contained" color="secondary" onClick={handleAddPayment} disabled={!formDate || !formAmount}>등록</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
