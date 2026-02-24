'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Stack, Typography,
  FormControl, InputLabel, Select, InputAdornment,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { settlementApi } from '@/lib/api';

interface CounterpartyOption {
  id: string;
  name: string;
}

interface TransactionCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** 거래처가 사전 지정된 경우 (거래처 상세에서 호출 시) */
  counterpartyId?: string;
  counterpartyName?: string;
}

export default function TransactionCreateDialog({
  open,
  onClose,
  onCreated,
  counterpartyId: fixedCpId,
  counterpartyName: fixedCpName,
}: TransactionCreateDialogProps) {
  const { enqueueSnackbar } = useSnackbar();

  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [counterpartyId, setCounterpartyId] = useState(fixedCpId || '');
  const [transactionType, setTransactionType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 거래처 목록 로드 (고정 거래처가 없을 때만)
  const loadCounterparties = useCallback(async () => {
    if (fixedCpId) return;
    try {
      const res = await settlementApi.listCounterparties({ page_size: 500 });
      const data = res.data as unknown as { counterparties: CounterpartyOption[] };
      setCounterparties(data.counterparties || []);
    } catch { /* ignore */ }
  }, [fixedCpId]);

  useEffect(() => {
    if (open) {
      loadCounterparties();
      setCounterpartyId(fixedCpId || '');
      setTransactionType('DEPOSIT');
      setTransactionDate(new Date().toISOString().slice(0, 10));
      setAmount('');
      setMemo('');
    }
  }, [open, fixedCpId, loadCounterparties]);

  const handleSubmit = async () => {
    if (!counterpartyId || !amount || Number(amount) <= 0) {
      enqueueSnackbar('거래처, 금액을 올바르게 입력해주세요.', { variant: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      await settlementApi.createTransaction({
        counterparty_id: counterpartyId,
        transaction_type: transactionType,
        transaction_date: transactionDate,
        amount: Number(amount),
        memo: memo || undefined,
      });
      enqueueSnackbar(
        `${transactionType === 'DEPOSIT' ? '입금' : '출금'} 등록 완료`,
        { variant: 'success' },
      );
      onCreated();
      onClose();
    } catch {
      enqueueSnackbar('등록에 실패했습니다.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>입출금 등록</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {/* 거래처 */}
          {fixedCpId ? (
            <TextField
              label="거래처"
              value={fixedCpName || fixedCpId}
              disabled
              size="small"
            />
          ) : (
            <FormControl size="small" fullWidth>
              <InputLabel>거래처</InputLabel>
              <Select
                value={counterpartyId}
                label="거래처"
                onChange={(e) => setCounterpartyId(e.target.value)}
              >
                {counterparties.map((cp) => (
                  <MenuItem key={cp.id} value={cp.id}>{cp.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* 유형 */}
          <FormControl size="small" fullWidth>
            <InputLabel>유형</InputLabel>
            <Select
              value={transactionType}
              label="유형"
              onChange={(e) => setTransactionType(e.target.value as 'DEPOSIT' | 'WITHDRAWAL')}
            >
              <MenuItem value="DEPOSIT">입금 (수금)</MenuItem>
              <MenuItem value="WITHDRAWAL">출금 (송금)</MenuItem>
            </Select>
          </FormControl>

          {/* 날짜 */}
          <TextField
            label="입출금일"
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
          />

          {/* 금액 */}
          <TextField
            label="금액"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            size="small"
            fullWidth
            InputProps={{
              endAdornment: <InputAdornment position="end">원</InputAdornment>,
            }}
          />

          {/* 메모 */}
          <TextField
            label="메모"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !counterpartyId || !amount}
        >
          {submitting ? '등록 중...' : '등록'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
