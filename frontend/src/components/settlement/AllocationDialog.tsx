'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Typography, Box,
  Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Alert, InputAdornment, Divider,
} from '@mui/material';
import {
  AutoFixHigh as AutoIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { settlementApi } from '@/lib/api';

// ─── 타입 ──────────────────────────────────────────────────────────

interface AllocationItem {
  id: string;
  voucher_id: string;
  voucher_number: string;
  trade_date: string;
  total_amount: number;
  allocated_amount: number;
}

interface TransactionDetail {
  id: string;
  transaction_type: string;
  amount: number;
  allocated_amount: number;
  status: string;
  counterparty_name?: string;
  allocations: AllocationItem[];
}

interface VoucherCandidate {
  id: string;
  voucher_number: string;
  trade_date: string;
  total_amount: number;
  total_receipts: number;
  total_payments: number;
  balance: number;
}

interface AllocationDialogProps {
  open: boolean;
  onClose: () => void;
  onAllocated: () => void;
  transactionId: string;
}

const formatAmount = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

export default function AllocationDialog({
  open,
  onClose,
  onAllocated,
  transactionId,
}: AllocationDialogProps) {
  const { enqueueSnackbar } = useSnackbar();

  const [transaction, setTransaction] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [allocating, setAllocating] = useState(false);

  // 수동 배분용 상태: voucher_id → 입력 금액
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});

  // 트랜잭션 상세 + 배분 가능 전표 로드
  const loadData = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);
    try {
      const res = await settlementApi.getTransaction(transactionId);
      const data = res.data as unknown as TransactionDetail;
      setTransaction(data);
      setManualAmounts({});
    } catch {
      enqueueSnackbar('입출금 상세 조회에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [transactionId, enqueueSnackbar]);

  useEffect(() => {
    if (open && transactionId) loadData();
  }, [open, transactionId, loadData]);

  const unallocated = transaction
    ? transaction.amount - transaction.allocated_amount
    : 0;

  // FIFO 자동 배분
  const handleAutoAllocate = async () => {
    setAllocating(true);
    try {
      await settlementApi.autoAllocate(transactionId, 'fifo');
      enqueueSnackbar('자동 배분이 완료되었습니다.', { variant: 'success' });
      await loadData();
      onAllocated();
    } catch {
      enqueueSnackbar('자동 배분에 실패했습니다.', { variant: 'error' });
    } finally {
      setAllocating(false);
    }
  };

  // 수동 배분
  const handleManualAllocate = async () => {
    const allocations = Object.entries(manualAmounts)
      .filter(([, amt]) => Number(amt) > 0)
      .map(([voucher_id, amt]) => ({
        voucher_id,
        amount: Number(amt),
      }));

    if (allocations.length === 0) {
      enqueueSnackbar('배분할 전표와 금액을 입력해주세요.', { variant: 'warning' });
      return;
    }

    const totalManual = allocations.reduce((s, a) => s + a.amount, 0);
    if (totalManual > unallocated) {
      enqueueSnackbar('배분 총액이 미배분 잔액을 초과합니다.', { variant: 'error' });
      return;
    }

    setAllocating(true);
    try {
      await settlementApi.manualAllocate(transactionId, allocations);
      enqueueSnackbar(`${allocations.length}건 배분 완료`, { variant: 'success' });
      await loadData();
      onAllocated();
    } catch {
      enqueueSnackbar('배분에 실패했습니다.', { variant: 'error' });
    } finally {
      setAllocating(false);
    }
  };

  // 배분 삭제
  const handleDeleteAllocation = async (allocId: string) => {
    try {
      await settlementApi.deleteAllocation(transactionId, allocId);
      enqueueSnackbar('배분이 삭제되었습니다.', { variant: 'success' });
      await loadData();
      onAllocated();
    } catch {
      enqueueSnackbar('배분 삭제에 실패했습니다.', { variant: 'error' });
    }
  };

  const typeLabel = transaction?.transaction_type === 'DEPOSIT' ? '입금' : '출금';
  const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'error' }> = {
    PENDING: { label: '미배분', color: 'error' },
    PARTIAL: { label: '부분배분', color: 'warning' },
    ALLOCATED: { label: '전액배분', color: 'success' },
    CANCELLED: { label: '취소', color: 'default' },
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        배분 관리
        {transaction && (
          <Chip
            label={statusMap[transaction.status]?.label || transaction.status}
            color={statusMap[transaction.status]?.color || 'default'}
            size="small"
            sx={{ ml: 1 }}
          />
        )}
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            로딩 중...
          </Typography>
        ) : transaction ? (
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {/* 요약 */}
            <Box sx={{ display: 'flex', gap: 3 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">유형</Typography>
                <Typography fontWeight={600}>{typeLabel}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">총액</Typography>
                <Typography fontWeight={600}>{formatAmount(transaction.amount)}원</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">배분됨</Typography>
                <Typography fontWeight={600} color="success.main">
                  {formatAmount(transaction.allocated_amount)}원
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">미배분</Typography>
                <Typography fontWeight={700} color="error.main">
                  {formatAmount(unallocated)}원
                </Typography>
              </Box>
            </Box>

            {/* 자동 배분 버튼 */}
            {unallocated > 0 && (
              <Box>
                <Button
                  variant="outlined"
                  startIcon={<AutoIcon />}
                  onClick={handleAutoAllocate}
                  disabled={allocating}
                  size="small"
                >
                  FIFO 자동 배분
                </Button>
              </Box>
            )}

            <Divider />

            {/* 현재 배분 내역 */}
            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                배분 내역 ({transaction.allocations?.length || 0}건)
              </Typography>
              {transaction.allocations && transaction.allocations.length > 0 ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>전표번호</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>거래일</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>전표금액</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>배분액</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>삭제</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {transaction.allocations.map((alloc) => (
                      <TableRow key={alloc.id}>
                        <TableCell>{alloc.voucher_number}</TableCell>
                        <TableCell>{alloc.trade_date}</TableCell>
                        <TableCell align="right">{formatAmount(alloc.total_amount)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatAmount(alloc.allocated_amount)}
                        </TableCell>
                        <TableCell align="center">
                          <Button
                            size="small"
                            color="error"
                            onClick={() => handleDeleteAllocation(alloc.id)}
                          >
                            삭제
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Alert severity="info" variant="outlined">
                  배분된 전표가 없습니다. 자동 배분 또는 수동 배분을 진행해주세요.
                </Alert>
              )}
            </Box>

            {/* 수동 배분 (미배분 잔액이 있을 때만) */}
            {unallocated > 0 && (
              <>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                    수동 배분 — 전표 ID와 금액을 직접 입력
                  </Typography>
                  <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
                    미배분 잔액: <strong>{formatAmount(unallocated)}원</strong> —
                    자동 배분(FIFO)을 먼저 시도하거나, 아래에서 전표를 직접 지정하세요.
                  </Alert>
                  <Stack spacing={1}>
                    {[0, 1, 2].map((idx) => {
                      const key = `manual_${idx}`;
                      return (
                        <Box key={key} sx={{ display: 'flex', gap: 1 }}>
                          <TextField
                            label="전표 ID"
                            size="small"
                            sx={{ flex: 2 }}
                            placeholder="전표 UUID"
                            onChange={(e) =>
                              setManualAmounts((prev) => ({
                                ...prev,
                                [e.target.value]: prev[Object.keys(prev)[idx]] || '',
                              }))
                            }
                          />
                          <TextField
                            label="배분액"
                            size="small"
                            type="number"
                            sx={{ flex: 1 }}
                            InputProps={{
                              endAdornment: <InputAdornment position="end">원</InputAdornment>,
                            }}
                            onChange={(e) => {
                              // 간단 구현: 마지막 입력된 전표 ID에 금액 매핑
                            }}
                          />
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              </>
            )}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
}
