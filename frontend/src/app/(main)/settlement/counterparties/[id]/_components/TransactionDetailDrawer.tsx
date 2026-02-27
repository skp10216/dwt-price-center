'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Chip, Divider, Skeleton,
  Table, TableBody, TableCell, TableHead, TableRow,
  LinearProgress, alpha, useTheme, Stack, Button,
} from '@mui/material';
import {
  ArrowDownward as DepositIcon,
  ArrowUpward as WithdrawalIcon,
  Receipt as VoucherIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import AppDetailDrawer from '@/components/ui/AppDetailDrawer';
import { useSnackbar } from 'notistack';

interface AllocationRow {
  id: string;
  voucher_id: string;
  voucher_number: string | null;
  voucher_trade_date: string | null;
  voucher_total_amount: number | null;
  allocated_amount: number;
  allocation_order: number;
  memo: string | null;
  created_at: string;
}

interface TransactionDetail {
  id: string;
  counterparty_id: string;
  counterparty_name: string | null;
  transaction_type: string;
  transaction_date: string;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  memo: string | null;
  source: string;
  bank_reference: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  allocations: AllocationRow[];
  hold_reason?: string | null;
  hide_reason?: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: 'error' | 'warning' | 'success' | 'default' | 'info' }> = {
  pending: { label: '미배분', color: 'error' },
  partial: { label: '부분배분', color: 'warning' },
  allocated: { label: '전액배분', color: 'success' },
  on_hold: { label: '보류', color: 'warning' },
  hidden: { label: '숨김', color: 'default' },
  cancelled: { label: '취소', color: 'default' },
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: '수동', manual: '수동',
  BANK_IMPORT: '은행', bank_import: '은행',
  NETTING: '상계', netting: '상계',
};

const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', py: 0.75, gap: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, flexShrink: 0, pt: 0.25 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1 }}>{children}</Box>
    </Box>
  );
}

interface TransactionDetailDrawerProps {
  transactionId: string | null;
  onClose: () => void;
}

export default function TransactionDetailDrawer({ transactionId, onClose }: TransactionDetailDrawerProps) {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);
    try {
      const res = await settlementApi.getTransaction(transactionId);
      setDetail(res.data as unknown as TransactionDetail);
    } catch {
      enqueueSnackbar('거래 상세 정보를 불러오지 못했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [transactionId, enqueueSnackbar]);

  useEffect(() => {
    if (transactionId) loadDetail();
    else setDetail(null);
  }, [transactionId, loadDetail]);

  const isDeposit = detail?.transaction_type === 'deposit';
  const allocPct = detail && detail.amount > 0 ? Math.min(100, (detail.allocated_amount / detail.amount) * 100) : 0;
  const statusInfo = detail ? STATUS_LABELS[detail.status] : null;
  const accentColor = isDeposit ? theme.palette.info.main : theme.palette.error.main;

  const handleCopyId = () => {
    if (detail) {
      navigator.clipboard.writeText(detail.id);
      enqueueSnackbar('ID가 복사되었습니다', { variant: 'info' });
    }
  };

  return (
    <AppDetailDrawer
      open={!!transactionId}
      onClose={onClose}
      title="입출금 상세"
      width={460}
    >
      {loading || !detail ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={120} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* 금액 + 유형 Hero */}
          <Box sx={{
            p: 2.5, borderRadius: 3,
            bgcolor: alpha(accentColor, 0.06),
            border: '1px solid', borderColor: alpha(accentColor, 0.15),
            textAlign: 'center',
          }}>
            <Box sx={{
              width: 48, height: 48, borderRadius: '50%', mx: 'auto', mb: 1.5,
              bgcolor: alpha(accentColor, 0.12),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isDeposit
                ? <DepositIcon sx={{ fontSize: 24, color: accentColor }} />
                : <WithdrawalIcon sx={{ fontSize: 24, color: accentColor }} />
              }
            </Box>
            <Typography variant="h4" fontWeight={800} sx={{ color: accentColor }}>
              {isDeposit ? '+' : '-'}{fmt(detail.amount)}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {isDeposit ? '입금' : '출금'} &middot; {detail.transaction_date}
            </Typography>
          </Box>

          {/* 배분 진행률 */}
          <Box sx={{ px: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="caption" color="text.secondary">배분 진행</Typography>
              <Typography variant="caption" fontWeight={600}>
                {fmt(detail.allocated_amount)} / {fmt(detail.amount)} ({Math.round(allocPct)}%)
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={allocPct}
              sx={{ height: 8, borderRadius: 4 }}
              color={allocPct >= 100 ? 'success' : allocPct > 0 ? 'primary' : 'error'}
            />
            {detail.unallocated_amount > 0 && (
              <Typography variant="caption" color="error.main" fontWeight={600} sx={{ mt: 0.5, display: 'block' }}>
                미배분: {fmt(detail.unallocated_amount)}
              </Typography>
            )}
          </Box>

          <Divider />

          {/* 기본 정보 */}
          <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>기본 정보</Typography>
            <InfoRow label="상태">
              <Chip
                label={statusInfo?.label ?? detail.status}
                color={statusInfo?.color ?? 'default'}
                size="small"
                sx={{ height: 22 }}
              />
            </InfoRow>
            <InfoRow label="출처">
              <Typography variant="body2">{SOURCE_LABELS[detail.source] || detail.source}</Typography>
            </InfoRow>
            {detail.bank_reference && (
              <InfoRow label="은행참조번호">
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{detail.bank_reference}</Typography>
              </InfoRow>
            )}
            {detail.memo && (
              <InfoRow label="메모">
                <Typography variant="body2">{detail.memo}</Typography>
              </InfoRow>
            )}
            {detail.hold_reason && (
              <InfoRow label="보류 사유">
                <Typography variant="body2" color="warning.main">{detail.hold_reason}</Typography>
              </InfoRow>
            )}
            <InfoRow label="등록일시">
              <Typography variant="body2">
                {new Date(detail.created_at).toLocaleString('ko-KR')}
              </Typography>
            </InfoRow>
            <InfoRow label="ID">
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }} color="text.disabled" noWrap>
                  {detail.id.slice(0, 8)}...
                </Typography>
                <Button size="small" sx={{ minWidth: 0, p: 0.25 }} onClick={handleCopyId}>
                  <CopyIcon sx={{ fontSize: 14 }} />
                </Button>
              </Stack>
            </InfoRow>
          </Box>

          <Divider />

          {/* 배분 내역 */}
          <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              배분 내역 ({detail.allocations?.length || 0}건)
            </Typography>
            {(!detail.allocations || detail.allocations.length === 0) ? (
              <Box sx={{
                py: 3, textAlign: 'center',
                border: '1px dashed', borderColor: 'divider', borderRadius: 2,
              }}>
                <VoucherIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 0.5 }} />
                <Typography variant="body2" color="text.secondary">아직 배분된 전표가 없습니다</Typography>
              </Box>
            ) : (
              <Table size="small" sx={{
                '& th': { fontWeight: 700, fontSize: '0.75rem', py: 0.75, bgcolor: alpha(theme.palette.text.primary, 0.03) },
                '& td': { fontSize: '0.8rem', py: 0.75 },
              }}>
                <TableHead>
                  <TableRow>
                    <TableCell>전표번호</TableCell>
                    <TableCell>전표일자</TableCell>
                    <TableCell align="right">배분금액</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.allocations.map((a) => (
                    <TableRow key={a.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} color="primary.main" sx={{ cursor: 'pointer' }}>
                          {a.voucher_number || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>{a.voucher_trade_date || '-'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {fmt(a.allocated_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={2} sx={{ fontWeight: 700 }}>합계</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {fmt(detail.allocations.reduce((s, a) => s + a.allocated_amount, 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </Box>
        </Box>
      )}
    </AppDetailDrawer>
  );
}
