'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, Divider,
  Button, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, IconButton, Tooltip,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  alpha, useTheme, Skeleton, Alert, LinearProgress, Tabs, Tab,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Business as BusinessIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Receipt as ReceiptIcon,
  ShoppingCart as ShoppingCartIcon,
  Visibility as ViewIcon,
  LocalOffer as AliasIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  SwapHoriz as SwapHorizIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import TransactionCreateDialog from '@/components/settlement/TransactionCreateDialog';

interface CounterpartyDetail {
  id: string;
  name: string;
  code: string | null;
  counterparty_type: string;
  contact_info: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  aliases: Array<{ id: string; alias_name: string; created_at: string }>;
}

interface SummaryData {
  id: string;
  name: string;
  code: string | null;
  counterparty_type: string;
  total_sales_amount: number;
  total_purchase_amount: number;
  total_receivable: number;
  total_payable: number;
  voucher_count: number;
}

interface VoucherRow {
  id: string;
  trade_date: string;
  voucher_number: string;
  voucher_type: string;
  quantity: number;
  total_amount: number;
  settlement_status: string;
  payment_status: string;
  balance: number;
}

interface TimelineItem {
  id: string;
  transaction_type: string;
  transaction_date: string;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  source: string;
  status: string;
  memo: string | null;
}

const TXN_STATUS_MAP: Record<string, { label: string; color: 'error' | 'warning' | 'success' | 'default' }> = {
  PENDING: { label: '미배분', color: 'error' },
  PARTIAL: { label: '부분배분', color: 'warning' },
  ALLOCATED: { label: '전액배분', color: 'success' },
  CANCELLED: { label: '취소', color: 'default' },
};

const typeLabels: Record<string, string> = {
  seller: '매입처', buyer: '매출처', both: '매입/매출',
};

const statusLabels: Record<string, { label: string; color: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  open: { label: '미정산', color: 'warning' },
  settling: { label: '정산중', color: 'info' },
  settled: { label: '정산완료', color: 'success' },
  locked: { label: '마감', color: 'default' },
  unpaid: { label: '미지급', color: 'error' },
  partial: { label: '부분지급', color: 'warning' },
  paid: { label: '지급완료', color: 'success' },
};

export default function CounterpartyDetailPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const { enqueueSnackbar } = useSnackbar();
  const counterpartyId = params.id as string;

  const [detail, setDetail] = useState<CounterpartyDetail | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [voucherTotal, setVoucherTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vPage, setVPage] = useState(0);
  const [vPageSize, setVPageSize] = useState(10);

  // 탭 상태
  const [activeTab, setActiveTab] = useState(0);

  // 입출금 타임라인
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [tPage, setTPage] = useState(0);
  const [tPageSize, setTPageSize] = useState(10);
  const [txnCreateOpen, setTxnCreateOpen] = useState(false);

  // 별칭 관리
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [newAlias, setNewAlias] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [detailRes, summaryRes] = await Promise.all([
        settlementApi.getCounterparty(counterpartyId),
        settlementApi.getCounterpartySummary(counterpartyId),
      ]);
      setDetail(detailRes.data as unknown as CounterpartyDetail);
      setSummary(summaryRes.data as unknown as SummaryData);
    } catch {
      setError('거래처 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [counterpartyId]);

  const loadVouchers = useCallback(async () => {
    try {
      const res = await settlementApi.listVouchers({
        counterparty_id: counterpartyId,
        page: vPage + 1,
        page_size: vPageSize,
      });
      const data = res.data as unknown as { vouchers: VoucherRow[]; total: number };
      setVouchers(data.vouchers || []);
      setVoucherTotal(data.total || 0);
    } catch {
      // handled
    }
  }, [counterpartyId, vPage, vPageSize]);

  const loadTimeline = useCallback(async () => {
    try {
      const res = await settlementApi.getCounterpartyTimeline(counterpartyId, {
        page: tPage + 1,
        page_size: tPageSize,
      });
      const data = res.data as unknown as { timeline: TimelineItem[]; total: number };
      setTimeline(data.timeline || []);
      setTimelineTotal(data.total || 0);
    } catch {
      // handled
    }
  }, [counterpartyId, tPage, tPageSize]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadVouchers(); }, [loadVouchers]);
  useEffect(() => { if (activeTab === 1) loadTimeline(); }, [activeTab, loadTimeline]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount);

  const handleAddAlias = async () => {
    if (!newAlias.trim()) return;
    try {
      await settlementApi.createCounterpartyAlias(counterpartyId, newAlias.trim());
      enqueueSnackbar('별칭이 추가되었습니다', { variant: 'success' });
      setNewAlias('');
      loadData();
    } catch {
      enqueueSnackbar('별칭 추가에 실패했습니다', { variant: 'error' });
    }
  };

  const handleDeleteAlias = async (aliasId: string) => {
    try {
      await settlementApi.deleteCounterpartyAlias(counterpartyId, aliasId);
      enqueueSnackbar('별칭이 삭제되었습니다', { variant: 'success' });
      loadData();
    } catch {
      enqueueSnackbar('별칭 삭제에 실패했습니다', { variant: 'error' });
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton width={300} height={40} />
        <Grid container spacing={3} sx={{ mt: 2 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={300} sx={{ mt: 3 }} />
      </Box>
    );
  }

  if (error || !detail) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || '거래처를 찾을 수 없습니다.'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()} sx={{ mt: 2 }}>
          뒤로가기
        </Button>
      </Box>
    );
  }

  const receivableRate = summary && summary.total_sales_amount > 0
    ? ((summary.total_receivable / summary.total_sales_amount) * 100)
    : 0;
  const payableRate = summary && summary.total_purchase_amount > 0
    ? ((summary.total_payable / summary.total_purchase_amount) * 100)
    : 0;

  return (
    <Box>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => router.push('/settlement/counterparties')}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <BusinessIcon sx={{ fontSize: 28, color: 'info.main' }} />
            <Typography variant="h5" fontWeight={700}>{detail.name}</Typography>
            <Chip
              label={typeLabels[detail.counterparty_type] || detail.counterparty_type}
              size="small"
              variant="outlined"
              color="info"
            />
            {!detail.is_active && <Chip label="비활성" size="small" color="default" />}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 5.5 }}>
            {detail.code ? `코드: ${detail.code}` : ''}
            {detail.contact_info ? ` · ${detail.contact_info}` : ''}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AliasIcon />}
          onClick={() => setAliasDialogOpen(true)}
        >
          별칭 관리 ({detail.aliases.length})
        </Button>
      </Box>

      {/* 요약 카드 */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{
            borderRadius: 3, border: '1px solid',
            borderColor: alpha(theme.palette.error.main, 0.2),
            bgcolor: alpha(theme.palette.error.main, 0.04),
          }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <TrendingUpIcon sx={{ color: 'error.main', fontSize: 20 }} />
                <Typography variant="body2" color="text.secondary" fontWeight={500}>미수 잔액</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={700} color="error.main">
                {formatAmount(summary?.total_receivable ?? 0)}
              </Typography>
              <Box sx={{ mt: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">미수율</Typography>
                  <Typography variant="caption" fontWeight={600}>{receivableRate.toFixed(1)}%</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(receivableRate, 100)}
                  color="error"
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{
            borderRadius: 3, border: '1px solid',
            borderColor: alpha(theme.palette.warning.main, 0.2),
            bgcolor: alpha(theme.palette.warning.main, 0.04),
          }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <TrendingDownIcon sx={{ color: 'warning.main', fontSize: 20 }} />
                <Typography variant="body2" color="text.secondary" fontWeight={500}>미지급 잔액</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={700} color="warning.main">
                {formatAmount(summary?.total_payable ?? 0)}
              </Typography>
              <Box sx={{ mt: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">미지급율</Typography>
                  <Typography variant="caption" fontWeight={600}>{payableRate.toFixed(1)}%</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(payableRate, 100)}
                  color="warning"
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{
            borderRadius: 3, border: '1px solid',
            borderColor: alpha(theme.palette.info.main, 0.2),
            bgcolor: alpha(theme.palette.info.main, 0.04),
          }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <ReceiptIcon sx={{ color: 'info.main', fontSize: 20 }} />
                <Typography variant="body2" color="text.secondary" fontWeight={500}>총 매출액</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={700} color="info.main">
                {formatAmount(summary?.total_sales_amount ?? 0)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                입금 합계: {formatAmount((summary?.total_sales_amount ?? 0) - (summary?.total_receivable ?? 0))}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{
            borderRadius: 3, border: '1px solid',
            borderColor: alpha(theme.palette.success.main, 0.2),
            bgcolor: alpha(theme.palette.success.main, 0.04),
          }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <ShoppingCartIcon sx={{ color: 'success.main', fontSize: 20 }} />
                <Typography variant="body2" color="text.secondary" fontWeight={500}>총 매입액</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={700} color="success.main">
                {formatAmount(summary?.total_purchase_amount ?? 0)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                송금 합계: {formatAmount((summary?.total_purchase_amount ?? 0) - (summary?.total_payable ?? 0))}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 거래처 기본 정보 */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>기본 정보</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">거래처명</Typography>
            <Typography variant="body1" fontWeight={600}>{detail.name}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">거래처 코드</Typography>
            <Typography variant="body1">{detail.code || '-'}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">유형</Typography>
            <Typography variant="body1">{typeLabels[detail.counterparty_type] || detail.counterparty_type}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">연락처</Typography>
            <Typography variant="body1">{detail.contact_info || '-'}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">전표 수</Typography>
            <Typography variant="body1" fontWeight={600}>{summary?.voucher_count ?? 0}건</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">등록 별칭</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
              {detail.aliases.length === 0 ? (
                <Typography variant="body2" color="text.secondary">없음</Typography>
              ) : (
                detail.aliases.map((a) => (
                  <Chip key={a.id} label={a.alias_name} size="small" variant="outlined" color="info" />
                ))
              )}
            </Stack>
          </Grid>
          {detail.memo && (
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">메모</Typography>
              <Typography variant="body2">{detail.memo}</Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* 탭: 전표 이력 / 입출금 타임라인 */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab label={`전표 이력 (${voucherTotal})`} icon={<ReceiptIcon />} iconPosition="start" sx={{ minHeight: 48 }} />
            <Tab label={`입출금 (${timelineTotal})`} icon={<SwapHorizIcon />} iconPosition="start" sx={{ minHeight: 48 }} />
          </Tabs>
        </Box>

        {/* 탭 0: 전표 이력 */}
        {activeTab === 0 && (
          <>
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>일자</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>전표번호</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>유형</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>수량</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>금액</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>잔액</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>정산</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>지급</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, width: 50 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vouchers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                        <ReceiptIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography color="text.secondary">전표가 없습니다</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    vouchers.map((v) => {
                      const sStatus = statusLabels[v.settlement_status] || { label: v.settlement_status, color: 'default' as const };
                      const pStatus = statusLabels[v.payment_status] || { label: v.payment_status, color: 'default' as const };
                      return (
                        <TableRow
                          key={v.id}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => router.push(`/settlement/vouchers/${v.id}`)}
                        >
                          <TableCell>{v.trade_date}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{v.voucher_number}</TableCell>
                          <TableCell>
                            <Chip
                              label={v.voucher_type === 'sales' ? '판매' : '매입'}
                              size="small"
                              variant="outlined"
                              color={v.voucher_type === 'sales' ? 'info' : 'success'}
                            />
                          </TableCell>
                          <TableCell align="right">{v.quantity}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {new Intl.NumberFormat('ko-KR').format(v.total_amount)}
                          </TableCell>
                          <TableCell align="right" sx={{
                            fontWeight: 600,
                            color: v.balance > 0 ? 'error.main' : 'success.main',
                          }}>
                            {new Intl.NumberFormat('ko-KR').format(v.balance)}
                          </TableCell>
                          <TableCell align="center">
                            <Chip label={sStatus.label} size="small" color={sStatus.color} variant="outlined" />
                          </TableCell>
                          <TableCell align="center">
                            <Chip label={pStatus.label} size="small" color={pStatus.color} variant="outlined" />
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="전표 상세">
                              <IconButton size="small">
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
            </TableContainer>
            {voucherTotal > 0 && (
              <TablePagination
                component="div"
                count={voucherTotal}
                page={vPage}
                onPageChange={(_, p) => setVPage(p)}
                rowsPerPage={vPageSize}
                onRowsPerPageChange={(e) => { setVPageSize(parseInt(e.target.value, 10)); setVPage(0); }}
                rowsPerPageOptions={[5, 10, 25]}
                labelRowsPerPage="페이지당 행:"
              />
            )}
          </>
        )}

        {/* 탭 1: 입출금 타임라인 */}
        {activeTab === 1 && (
          <>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setTxnCreateOpen(true)}
              >
                입출금 등록
              </Button>
            </Box>
            <Divider />
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>일자</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>유형</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>금액</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>배분액</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>미배분</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>출처</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>메모</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {timeline.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                        <SwapHorizIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography color="text.secondary">입출금 내역이 없습니다</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    timeline.map((t) => {
                      const sInfo = TXN_STATUS_MAP[t.status] || { label: t.status, color: 'default' as const };
                      const isCancelled = t.status === 'CANCELLED';
                      return (
                        <TableRow key={t.id} hover sx={{ opacity: isCancelled ? 0.5 : 1 }}>
                          <TableCell>{t.transaction_date}</TableCell>
                          <TableCell>
                            <Chip
                              label={t.transaction_type === 'DEPOSIT' ? '입금' : '출금'}
                              size="small"
                              variant="outlined"
                              color={t.transaction_type === 'DEPOSIT' ? 'info' : 'secondary'}
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {new Intl.NumberFormat('ko-KR').format(t.amount)}
                          </TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>
                            {new Intl.NumberFormat('ko-KR').format(t.allocated_amount)}
                          </TableCell>
                          <TableCell align="right" sx={{
                            fontWeight: t.unallocated_amount > 0 ? 700 : 400,
                            color: t.unallocated_amount > 0 ? 'error.main' : 'text.secondary',
                          }}>
                            {new Intl.NumberFormat('ko-KR').format(t.unallocated_amount)}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={t.source === 'MANUAL' ? '수동' : t.source === 'BANK_IMPORT' ? '은행' : '상계'}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip label={sInfo.label} size="small" color={sInfo.color} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 150 }}>
                              {t.memo || '-'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            {timelineTotal > 0 && (
              <TablePagination
                component="div"
                count={timelineTotal}
                page={tPage}
                onPageChange={(_, p) => setTPage(p)}
                rowsPerPage={tPageSize}
                onRowsPerPageChange={(e) => { setTPageSize(parseInt(e.target.value, 10)); setTPage(0); }}
                rowsPerPageOptions={[5, 10, 25]}
                labelRowsPerPage="페이지당 행:"
              />
            )}
          </>
        )}
      </Paper>

      {/* 입출금 등록 다이얼로그 */}
      <TransactionCreateDialog
        open={txnCreateOpen}
        onClose={() => setTxnCreateOpen(false)}
        onCreated={() => { loadTimeline(); loadData(); }}
        counterpartyId={counterpartyId}
        counterpartyName={detail.name}
      />

      {/* 별칭 관리 다이얼로그 */}
      <Dialog open={aliasDialogOpen} onClose={() => setAliasDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AliasIcon color="info" />
            <span>별칭 관리 — {detail.name}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
            UPM에서 동일 거래처가 다른 이름으로 표기될 경우, 별칭을 등록하면 업로드 시 자동 매칭됩니다.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small"
              placeholder="새 별칭 입력"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
              fullWidth
            />
            <Button variant="contained" size="small" onClick={handleAddAlias} disabled={!newAlias.trim()}>
              추가
            </Button>
          </Stack>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={1}>
            {detail.aliases.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                등록된 별칭이 없습니다.
              </Typography>
            ) : (
              detail.aliases.map((a) => (
                <Stack key={a.id} direction="row" alignItems="center" justifyContent="space-between"
                  sx={{ p: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip label={a.alias_name} variant="outlined" color="info" />
                    <Typography variant="caption" color="text.disabled">
                      {new Date(a.created_at).toLocaleDateString('ko-KR')}
                    </Typography>
                  </Stack>
                  <IconButton size="small" color="error" onClick={() => handleDeleteAlias(a.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAliasDialogOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
