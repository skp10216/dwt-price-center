'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAppRouter } from '@/lib/navigation';
import {
  Box, Typography, Paper, Grid, Chip, Divider, Button, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, Alert, alpha, useTheme, Card, CardContent,
  LinearProgress, Skeleton,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  AccountTree as AllocIcon,
  Edit as AdjustIcon,
  OpenInNew as OpenInNewIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// ─── 타입 ──────────────────────────────────────────────────────────

interface AllocationRow {
  id: string;
  transaction_id: string;
  transaction_date: string | null;
  transaction_type: string | null; // DEPOSIT / WITHDRAWAL
  allocated_amount: number;
  memo: string | null;
  created_at: string;
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
  // 매입 필드
  purchase_cost?: number;
  deduction_amount?: number;
  actual_purchase_price?: number;
  avg_unit_price?: number;
  // 판매 필드
  sale_amount?: number;
  purchase_deduction?: number;
  as_cost?: number;
  sale_deduction?: number;
  actual_sale_price?: number;
  profit?: number;
  profit_rate?: number;
  avg_margin?: number;
  // UPM
  upm_settlement_status?: string;
  payment_info?: string;
  // 상태
  settlement_status: string;
  payment_status: string;
  // 계산
  total_receipts: number;
  total_payments: number;
  balance: number;
  memo?: string;
  // 하위 목록
  receipts: Array<{ id: string; receipt_date: string; amount: number; memo?: string; created_at: string }>;
  payments: Array<{ id: string; payment_date: string; amount: number; memo?: string; created_at: string }>;
  allocations: AllocationRow[];
  // 조정전표 메타
  is_adjustment: boolean;
  adjustment_type?: string;
  adjustment_reason?: string;
  original_voucher_id?: string;
  original_voucher_number?: string;
  // 업로드 출처
  upload_job_id?: string;
  // 타임스탬프
  created_at: string;
  updated_at: string;
}

// ─── 상수 ──────────────────────────────────────────────────────────

const statusLabels: Record<string, string> = {
  open: '미정산', settling: '정산중', settled: '정산완료', locked: '마감',
  unpaid: '미지급', partial: '부분지급', paid: '지급완료',
};

const statusColors: Record<string, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
  open: 'error', settling: 'warning', settled: 'success', locked: 'default',
  unpaid: 'error', partial: 'warning', paid: 'success',
};

const adjustmentTypeLabels: Record<string, string> = {
  correction: '수정', return_: '반품', write_off: '대손', discount: '할인',
};

const formatAmount = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR');
  } catch {
    return dateStr;
  }
};

// ─── InfoRow 헬퍼 ──────────────────────────────────────────────────

function InfoRow({ label, children, hide }: { label: string; children: React.ReactNode; hide?: boolean }) {
  if (hide) return null;
  return (
    <Box sx={{ display: 'flex', py: 0.75, gap: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {children}
      </Typography>
    </Box>
  );
}

function AmountRow({ label, amount, color, hide }: { label: string; amount?: number | null; color?: string; hide?: boolean }) {
  if (hide || amount == null || amount === 0) return null;
  return (
    <Box sx={{ display: 'flex', py: 0.75, gap: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, color: color || 'text.primary' }}>
        {formatAmount(amount)}
      </Typography>
    </Box>
  );
}

// ─── Skeleton 로딩 ─────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Skeleton variant="circular" width={40} height={40} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="40%" height={32} />
          <Skeleton width="25%" height={20} />
        </Box>
      </Stack>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[0, 1, 2, 3].map((i) => (
          <Grid item xs={12} sm={3} key={i}>
            <Skeleton variant="rounded" height={90} />
          </Grid>
        ))}
      </Grid>
      <Skeleton variant="rounded" height={200} sx={{ mb: 2 }} />
      <Skeleton variant="rounded" height={150} />
    </Box>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────

export default function VoucherDetailPage() {
  const params = useParams();
  const router = useAppRouter();
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const voucherId = params.id as string;

  const [voucher, setVoucher] = useState<VoucherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);

  // 삭제 확인 다이얼로그
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'receipt' | 'payment'; id: string } | null>(null);

  // 조정전표 다이얼로그
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjType, setAdjType] = useState('correction');
  const [adjReason, setAdjReason] = useState('');
  const [adjDate, setAdjDate] = useState(new Date().toISOString().slice(0, 10));
  const [adjAmount, setAdjAmount] = useState('');
  const [adjMemo, setAdjMemo] = useState('');

  // ─── 데이터 로드 ────────────────────────────────────────────────

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

  const loadAdjustments = useCallback(async () => {
    try {
      const adjRes = await settlementApi.listAdjustmentVouchers(voucherId);
      setAdjustments((adjRes.data as unknown as AdjustmentRow[]) || []);
    } catch { /* ignore */ }
  }, [voucherId]);

  useEffect(() => { loadVoucher(); }, [loadVoucher]);
  useEffect(() => { loadAdjustments(); }, [loadAdjustments]);

  // ─── 액션 핸들러 ────────────────────────────────────────────────

  const handleDeleteReceipt = async (receiptId: string) => {
    try {
      await settlementApi.deleteReceipt(voucherId, receiptId);
      enqueueSnackbar('입금이 삭제되었습니다', { variant: 'success' });
      loadVoucher();
    } catch {
      enqueueSnackbar('입금 삭제에 실패했습니다', { variant: 'error' });
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    try {
      await settlementApi.deletePayment(voucherId, paymentId);
      enqueueSnackbar('송금이 삭제되었습니다', { variant: 'success' });
      loadVoucher();
    } catch {
      enqueueSnackbar('송금 삭제에 실패했습니다', { variant: 'error' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'receipt') {
      await handleDeleteReceipt(deleteTarget.id);
    } else {
      await handleDeletePayment(deleteTarget.id);
    }
    setDeleteTarget(null);
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
      loadAdjustments();
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

  // ─── 로딩/에러 ──────────────────────────────────────────────────

  if (loading) return <DetailSkeleton />;
  if (!voucher) return (
    <Box sx={{ p: 3 }}>
      <Alert severity="error" action={
        <Button color="inherit" size="small" onClick={() => router.push('/settlement/vouchers')}>목록으로</Button>
      }>전표를 찾을 수 없습니다</Alert>
    </Box>
  );

  const isLocked = voucher.settlement_status === 'locked' || voucher.payment_status === 'locked';
  const isSales = voucher.voucher_type === 'sales';
  const settled = voucher.total_receipts + voucher.total_payments;
  const progressPct = voucher.total_amount > 0 ? Math.min((settled / voucher.total_amount) * 100, 100) : 0;
  const allocTotal = (voucher.allocations || []).reduce((s, a) => s + a.allocated_amount, 0);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* ── 헤더 ──────────────────────────────────────────────── */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <IconButton onClick={() => router.push('/settlement/vouchers')}><ArrowBackIcon /></IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            {voucher.voucher_number}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography
              variant="body2"
              color="primary"
              sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
              onClick={() => router.push(`/settlement/counterparties/${voucher.counterparty_id}`)}
            >
              {voucher.counterparty_name}
            </Typography>
            <Typography variant="body2" color="text.secondary">|</Typography>
            <Typography variant="body2" color="text.secondary">{voucher.trade_date}</Typography>
          </Stack>
        </Box>
        <Chip label={isSales ? '판매' : '매입'} color={isSales ? 'primary' : 'secondary'} variant="outlined" />
        <Chip label={statusLabels[voucher.settlement_status]} color={statusColors[voucher.settlement_status]} size="small" />
        <Chip label={statusLabels[voucher.payment_status]} color={statusColors[voucher.payment_status]} size="small" />
        {isLocked && (
          <Button variant="outlined" size="small" startIcon={<AdjustIcon />} onClick={() => setAdjOpen(true)}>
            조정전표
          </Button>
        )}
        {isLocked ? (
          <Button variant="outlined" color="warning" size="small" startIcon={<LockOpenIcon />} onClick={handleUnlock}>
            마감 해제
          </Button>
        ) : (
          <Button variant="outlined" color="error" size="small" startIcon={<LockIcon />} onClick={handleLock}>
            마감
          </Button>
        )}
      </Stack>

      {/* ── 조정전표 원본 링크 ───────────────────────────────── */}
      {voucher.is_adjustment && voucher.original_voucher_id && (
        <Alert
          severity="info"
          icon={<InfoIcon />}
          sx={{ mb: 2 }}
          action={
            <Button
              size="small"
              endIcon={<OpenInNewIcon fontSize="small" />}
              onClick={() => router.push(`/settlement/vouchers/${voucher.original_voucher_id}`)}
            >
              원본 전표
            </Button>
          }
        >
          이 전표는 <strong>{adjustmentTypeLabels[voucher.adjustment_type || ''] || '조정'}</strong> 전표입니다.
          원본: <strong>{voucher.original_voucher_number}</strong>
          {voucher.adjustment_reason && ` — ${voucher.adjustment_reason}`}
        </Alert>
      )}

      {/* ── 금액 요약 카드 ───────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Typography variant="body2" color="text.secondary">전표 금액</Typography>
              <Typography variant="h5" fontWeight={700}>{formatAmount(voucher.total_amount)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Typography variant="body2" color="text.secondary">누적 입금</Typography>
              <Typography variant="h5" fontWeight={700} color="success.main">{formatAmount(voucher.total_receipts)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Typography variant="body2" color="text.secondary">누적 송금</Typography>
              <Typography variant="h5" fontWeight={700} color="info.main">{formatAmount(voucher.total_payments)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{
            border: '1px solid', borderColor: 'divider', borderRadius: 2,
            bgcolor: voucher.balance > 0 ? alpha(theme.palette.error.main, 0.04) : alpha(theme.palette.success.main, 0.04),
          }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Typography variant="body2" color="text.secondary">잔액</Typography>
              <Typography variant="h5" fontWeight={700} color={voucher.balance > 0 ? 'error.main' : 'success.main'}>
                {formatAmount(voucher.balance)}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={progressPct}
                sx={{ mt: 1, height: 6, borderRadius: 3 }}
                color={progressPct >= 100 ? 'success' : 'primary'}
              />
              <Typography variant="caption" color="text.secondary">
                정산 {progressPct.toFixed(0)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── 전표 상세 정보 ───────────────────────────────────── */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3, p: 2.5 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>전표 상세 정보</Typography>
        <Grid container spacing={3}>
          {/* 기본 정보 */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>기본 정보</Typography>
            <Divider sx={{ mb: 1 }} />
            <InfoRow label="전표번호">{voucher.voucher_number}</InfoRow>
            <InfoRow label="거래일">{voucher.trade_date}</InfoRow>
            <InfoRow label="거래처">
              <Typography
                component="span"
                variant="body2"
                color="primary"
                sx={{ cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
                onClick={() => router.push(`/settlement/counterparties/${voucher.counterparty_id}`)}
              >
                {voucher.counterparty_name}
              </Typography>
            </InfoRow>
            <InfoRow label="유형">{isSales ? '판매' : '매입'}</InfoRow>
            <InfoRow label="수량">{voucher.quantity.toLocaleString()}</InfoRow>
            <InfoRow label="UPM 정산" hide={!voucher.upm_settlement_status}>{voucher.upm_settlement_status}</InfoRow>
            <InfoRow label="송금정보" hide={!voucher.payment_info}>{voucher.payment_info}</InfoRow>
            <InfoRow label="메모" hide={!voucher.memo}>{voucher.memo}</InfoRow>
            <InfoRow label="등록일">{formatDate(voucher.created_at)}</InfoRow>
            <InfoRow label="수정일">{formatDate(voucher.updated_at)}</InfoRow>
          </Grid>

          {/* 금액 상세 */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>금액 상세</Typography>
            <Divider sx={{ mb: 1 }} />
            {isSales ? (
              <>
                <AmountRow label="판매금액" amount={voucher.sale_amount} />
                <AmountRow label="매입차감" amount={voucher.purchase_deduction} />
                <AmountRow label="A/S비용" amount={voucher.as_cost} />
                <AmountRow label="판매차감" amount={voucher.sale_deduction} />
                <AmountRow label="실판매가" amount={voucher.actual_sale_price} color={theme.palette.primary.main} />
                <AmountRow label="손익" amount={voucher.profit} color={voucher.profit && voucher.profit >= 0 ? theme.palette.success.main : theme.palette.error.main} />
                {voucher.profit_rate != null && Number(voucher.profit_rate) !== 0 && (
                  <InfoRow label="수익율">
                    <Typography component="span" variant="body2" sx={{ fontWeight: 600, color: Number(voucher.profit_rate) >= 0 ? 'success.main' : 'error.main' }}>
                      {Number(voucher.profit_rate).toFixed(2)}%
                    </Typography>
                  </InfoRow>
                )}
                <AmountRow label="평균마진" amount={voucher.avg_margin} />
              </>
            ) : (
              <>
                <AmountRow label="매입원가" amount={voucher.purchase_cost} />
                <AmountRow label="차감금액" amount={voucher.deduction_amount} />
                <AmountRow label="실매입가" amount={voucher.actual_purchase_price} color={theme.palette.primary.main} />
                <AmountRow label="평균단가" amount={voucher.avg_unit_price} />
              </>
            )}
            <Divider sx={{ my: 1 }} />
            <AmountRow label="전표 금액" amount={voucher.total_amount} color={theme.palette.text.primary} />
          </Grid>
        </Grid>
      </Paper>

      {/* ── 입출금 안내 ──────────────────────────────────────── */}
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        입출금은 <strong>입출금 관리</strong> 페이지 또는 거래처 상세에서 등록하세요.
        거래처 수준으로 입출금을 등록하면 전표에 자동/수동 배분됩니다.
        <Button size="small" sx={{ ml: 1 }} onClick={() => router.push('/settlement/transactions')}>
          입출금 관리 →
        </Button>
      </Alert>

      {/* ── 배분 내역 ────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AllocIcon fontSize="small" color="action" />
            <Typography variant="h6" fontWeight={600}>배분 내역</Typography>
            {voucher.allocations.length > 0 && (
              <Chip label={`${voucher.allocations.length}건`} size="small" color="primary" variant="outlined" />
            )}
          </Stack>
        </Box>
        <Divider />
        {voucher.allocations.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              아직 배분된 입출금이 없습니다.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>배분일</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>유형</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>배분금액</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>메모</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>등록일</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {voucher.allocations.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>{a.transaction_date || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        label={a.transaction_type === 'DEPOSIT' ? '입금' : a.transaction_type === 'WITHDRAWAL' ? '출금' : a.transaction_type || '-'}
                        size="small"
                        color={a.transaction_type === 'DEPOSIT' ? 'success' : 'info'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatAmount(a.allocated_amount)}
                    </TableCell>
                    <TableCell>{a.memo || '-'}</TableCell>
                    <TableCell>{formatDate(a.created_at)}</TableCell>
                  </TableRow>
                ))}
                {/* 합계 행 */}
                <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                  <TableCell colSpan={2} sx={{ fontWeight: 700 }}>합계</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {formatAmount(allocTotal)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* ── 입금 이력 (레거시) ────────────────────────────────── */}
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
                    <TableCell>{formatDate(r.created_at)}</TableCell>
                    {!isLocked && (
                      <TableCell align="center">
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget({ type: 'receipt', id: r.id })}>
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

      {/* ── 송금 이력 (레거시) ────────────────────────────────── */}
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
                    <TableCell>{formatDate(p.created_at)}</TableCell>
                    {!isLocked && (
                      <TableCell align="center">
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget({ type: 'payment', id: p.id })}>
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

      {/* ── 조정전표 이력 ────────────────────────────────────── */}
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
                      <Chip label={adjustmentTypeLabels[adj.adjustment_type] || adj.adjustment_type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{formatAmount(adj.total_amount)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{adj.adjustment_reason}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={statusLabels[adj.settlement_status] || adj.settlement_status} color={statusColors[adj.settlement_status] || 'default'} size="small" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ── 조정전표 생성 다이얼로그 ─────────────────────────── */}
      <Dialog open={adjOpen} onClose={() => setAdjOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>조정전표 생성</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
            마감된 전표 <strong>{voucher.voucher_number}</strong>에 대한 조정전표를 생성합니다.
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

      {/* ── 삭제 확인 다이얼로그 ───────────────────────────── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.type === 'receipt' ? '입금 내역 삭제' : '송금 내역 삭제'}
        message={deleteTarget?.type === 'receipt' ? '이 입금 내역을 삭제하시겠습니까?' : '이 송금 내역을 삭제하시겠습니까?'}
        confirmColor="error"
        confirmLabel="삭제"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
