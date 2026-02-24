'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, Typography, Box,
  Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Alert, Divider,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { settlementApi } from '@/lib/api';

// ─── 타입 ──────────────────────────────────────────────────────────

interface NettingVoucher {
  id: string;
  voucher_id: string;
  voucher_number: string;
  voucher_type: string;
  trade_date: string;
  total_amount: number;
  netted_amount: number;
}

interface NettingDetail {
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
  voucher_links: NettingVoucher[];
}

interface NettingDetailDialogProps {
  open: boolean;
  onClose: () => void;
  nettingId: string;
  onAction?: () => void;
}

const formatAmount = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

const STATUS_MAP: Record<string, { label: string; color: 'warning' | 'success' | 'default' }> = {
  draft: { label: '초안', color: 'warning' },
  confirmed: { label: '확정', color: 'success' },
  cancelled: { label: '취소', color: 'default' },
};

export default function NettingDetailDialog({
  open, onClose, nettingId, onAction,
}: NettingDetailDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const [detail, setDetail] = useState<NettingDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!nettingId) return;
    setLoading(true);
    try {
      const res = await settlementApi.getNetting(nettingId);
      setDetail(res.data as unknown as NettingDetail);
    } catch {
      enqueueSnackbar('상계 상세 조회에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [nettingId, enqueueSnackbar]);

  useEffect(() => {
    if (open && nettingId) loadDetail();
  }, [open, nettingId, loadDetail]);

  const handleConfirm = async () => {
    if (!detail || !confirm('이 상계를 확정하시겠습니까?')) return;
    try {
      await settlementApi.confirmNetting(detail.id);
      enqueueSnackbar('상계가 확정되었습니다.', { variant: 'success' });
      loadDetail();
      onAction?.();
    } catch {
      enqueueSnackbar('상계 확정에 실패했습니다.', { variant: 'error' });
    }
  };

  const handleCancel = async () => {
    if (!detail || !confirm('이 상계를 취소하시겠습니까?')) return;
    try {
      await settlementApi.cancelNetting(detail.id);
      enqueueSnackbar('상계가 취소되었습니다.', { variant: 'success' });
      loadDetail();
      onAction?.();
    } catch {
      enqueueSnackbar('상계 취소에 실패했습니다.', { variant: 'error' });
    }
  };

  const statusInfo = detail ? STATUS_MAP[detail.status] || { label: detail.status, color: 'default' as const } : null;

  const salesLinks = detail?.voucher_links?.filter((v) => v.voucher_type === 'SALES') || [];
  const purchaseLinks = detail?.voucher_links?.filter((v) => v.voucher_type === 'PURCHASE') || [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        상계 상세
        {statusInfo && (
          <Chip label={statusInfo.label} color={statusInfo.color} size="small" sx={{ ml: 1 }} />
        )}
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            로딩 중...
          </Typography>
        ) : detail ? (
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {/* 요약 */}
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="caption" color="text.secondary">거래처</Typography>
                <Typography fontWeight={600}>{detail.counterparty_name}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">상계일</Typography>
                <Typography fontWeight={600}>{detail.netting_date}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">상계금액</Typography>
                <Typography fontWeight={700} color="primary.main">
                  {formatAmount(detail.netting_amount)}원
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">생성자</Typography>
                <Typography>{detail.created_by_name}</Typography>
              </Box>
              {detail.confirmed_at && (
                <Box>
                  <Typography variant="caption" color="text.secondary">확정</Typography>
                  <Typography>
                    {detail.confirmed_by_name} ({new Date(detail.confirmed_at).toLocaleDateString('ko-KR')})
                  </Typography>
                </Box>
              )}
            </Box>

            {detail.memo && (
              <Alert severity="info" variant="outlined">
                메모: {detail.memo}
              </Alert>
            )}

            <Divider />

            {/* 매출(AR) 전표 */}
            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                <Chip label="매출 (AR)" color="info" size="small" sx={{ mr: 1 }} />
                {salesLinks.length}건
              </Typography>
              {salesLinks.length > 0 ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>전표번호</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>거래일</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>전표금액</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>상계금액</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {salesLinks.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>{v.voucher_number}</TableCell>
                        <TableCell>{v.trade_date}</TableCell>
                        <TableCell align="right">{formatAmount(v.total_amount)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatAmount(v.netted_amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography variant="body2" color="text.secondary">매출 전표 없음</Typography>
              )}
            </Box>

            {/* 매입(AP) 전표 */}
            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                <Chip label="매입 (AP)" color="secondary" size="small" sx={{ mr: 1 }} />
                {purchaseLinks.length}건
              </Typography>
              {purchaseLinks.length > 0 ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>전표번호</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>거래일</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>전표금액</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>상계금액</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {purchaseLinks.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>{v.voucher_number}</TableCell>
                        <TableCell>{v.trade_date}</TableCell>
                        <TableCell align="right">{formatAmount(v.total_amount)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatAmount(v.netted_amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography variant="body2" color="text.secondary">매입 전표 없음</Typography>
              )}
            </Box>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        {detail?.status === 'draft' && (
          <>
            <Button color="error" onClick={handleCancel}>취소</Button>
            <Button variant="contained" color="success" onClick={handleConfirm}>
              확정
            </Button>
          </>
        )}
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
}
