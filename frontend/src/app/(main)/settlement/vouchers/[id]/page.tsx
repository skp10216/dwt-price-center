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
  Delete as DeleteIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  AccountTree as AllocIcon,
  Edit as AdjustIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

interface AllocationRow {
  id: string;
  transaction_id: string;
  voucher_id: string;
  allocated_amount: number;
  allocation_order: number;
  memo: string | null;
  created_at: string;
  transaction_type?: string;
  transaction_date?: string;
  counterparty_name?: string;
}

interface AdjustmentRow {
  id: string;
  voucher_number: string;
  trade_date: string;
  total_amount: number;
  adjustment_type: string;
  adjustment_reason: string;
  settlement_status: string;
}

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
 * 전표 상세 - 배분 내역 + 잔액 + 마감 + 조정전표
 */
export default function VoucherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const voucherId = params.id as string;

  const [voucher, setVoucher] = useState<VoucherDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // 배분 내역 + 조정전표
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);

  // 조정전표 다이얼로그
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjType, setAdjType] = useState('correction');
  const [adjReason, setAdjReason] = useState('');
  const [adjDate, setAdjDate] = useState(new Date().toISOString().slice(0, 10));
  const [adjAmount, setAdjAmount] = useState('');
  const [adjMemo, setAdjMemo] = useState('');

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

  const loadAllocationsAndAdjustments = useCallback(async () => {
    try {
      const adjRes = await settlementApi.listAdjustmentVouchers(voucherId);
      setAdjustments((adjRes.data as unknown as AdjustmentRow[]) || []);
    } catch { /* ignore */ }
  }, [voucherId]);

  useEffect(() => { loadVoucher(); }, [loadVoucher]);
  useEffect(() => { loadAllocationsAndAdjustments(); }, [loadAllocationsAndAdjustments]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ko-KR').format(amount);

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

  const handleCreateAdjustment = async () => {
    if (!adjReason.trim() || !adjAmount) {
      enqueueSnackbar('조정 사유와 금액을 입력해주세요.', { variant: 'warning' });
      return;
    }
    try {
      await settlementApi.createAdjustmentVoucher(voucherId, {
        adjustment_type: adjType,
        adjustment_reason: adjReason,
        trade_date: adjDate,
        total_amount: parseFloat(adjAmount),
        quantity: 0,
        memo: adjMemo || null,
      });
      enqueueSnackbar('조정전표가 생성되었습니다', { variant: 'success' });
      setAdjOpen(false);
      setAdjReason(''); setAdjAmount(''); setAdjMemo('');
      loadAllocationsAndAdjustments();
    } catch {
      enqueueSnackbar('조정전표 생성에 실패했습니다', { variant: 'error' });
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
        {isLocked && (
          <Button variant="outlined" size="small" startIcon={<AdjustIcon />} onClick={() => setAdjOpen(true)}>
            조정전표 생성
          </Button>
        )}
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

      {/* 거래처 입출금 안내 */}
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        입출금은 <strong>입출금 관리</strong> 페이지 또는 거래처 상세에서 등록하세요.
        거래처 수준으로 입출금을 등록하면 전표에 자동/수동 배분됩니다.
        <Button
          size="small"
          sx={{ ml: 1 }}
          onClick={() => router.push('/settlement/transactions')}
        >
          입출금 관리 →
        </Button>
      </Alert>

      {/* 입금 이력 (레거시 — 읽기 전용) */}
      {voucher.receipts.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6" fontWeight={600}>입금(수금) 이력</Typography>
              <Chip label="레거시" size="small" variant="outlined" color="default" />
            </Stack>
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
                {voucher.receipts.map((r) => (
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
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* 송금 이력 (레거시 — 읽기 전용) */}
      {voucher.payments.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6" fontWeight={600}>송금(지급) 이력</Typography>
              <Chip label="레거시" size="small" variant="outlined" color="default" />
            </Stack>
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
                {voucher.payments.map((p) => (
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
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* 조정전표 이력 */}
      {adjustments.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              <AllocIcon sx={{ mr: 1, verticalAlign: 'middle', fontSize: 20 }} />
              조정전표 이력 ({adjustments.length}건)
            </Typography>
          </Box>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>전표번호</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>거래일</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>조정유형</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>금액</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>사유</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {adjustments.map((adj) => (
                  <TableRow
                    key={adj.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/settlement/vouchers/${adj.id}`)}
                  >
                    <TableCell sx={{ fontWeight: 600 }}>{adj.voucher_number}</TableCell>
                    <TableCell>{adj.trade_date}</TableCell>
                    <TableCell>
                      <Chip
                        label={
                          adj.adjustment_type === 'correction' ? '수정' :
                          adj.adjustment_type === 'return_' ? '반품' :
                          adj.adjustment_type === 'write_off' ? '대손' :
                          adj.adjustment_type === 'discount' ? '할인' :
                          adj.adjustment_type
                        }
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatAmount(adj.total_amount)}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                        {adj.adjustment_reason}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={statusLabels[adj.settlement_status] || adj.settlement_status}
                        color={statusColors[adj.settlement_status] || 'default'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* 조정전표 생성 다이얼로그 */}
      <Dialog open={adjOpen} onClose={() => setAdjOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>조정전표 생성</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
            마감된 전표 <strong>{voucher?.voucher_number}</strong>에 대한 조정전표를 생성합니다.
            원본 전표는 변경되지 않습니다.
          </Alert>
          <Stack spacing={2}>
            <TextField
              label="조정 유형"
              select
              value={adjType}
              onChange={(e) => setAdjType(e.target.value)}
              size="small"
              fullWidth
            >
              {[
                { value: 'correction', label: '수정 (Correction)' },
                { value: 'return_', label: '반품 (Return)' },
                { value: 'write_off', label: '대손 (Write-off)' },
                { value: 'discount', label: '할인 (Discount)' },
              ].map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </TextField>
            <TextField
              label="조정 사유"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              size="small"
              fullWidth
              required
              multiline
              rows={2}
            />
            <TextField
              label="거래일"
              type="date"
              value={adjDate}
              onChange={(e) => setAdjDate(e.target.value)}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="금액"
              type="number"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              size="small"
              fullWidth
              helperText="음수 가능 (반품/대손 시)"
            />
            <TextField
              label="메모"
              value={adjMemo}
              onChange={(e) => setAdjMemo(e.target.value)}
              size="small"
              fullWidth
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjOpen(false)}>취소</Button>
          <Button variant="contained" onClick={handleCreateAdjustment} disabled={!adjReason.trim() || !adjAmount}>
            생성
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
