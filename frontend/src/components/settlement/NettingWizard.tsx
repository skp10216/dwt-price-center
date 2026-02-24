'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Typography, Box,
  Table, TableBody, TableCell, TableHead, TableRow,
  Stepper, Step, StepLabel, Alert, Chip,
  FormControl, InputLabel, Select, MenuItem,
  InputAdornment, Divider, CircularProgress,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { settlementApi } from '@/lib/api';

// ─── 타입 ──────────────────────────────────────────────────────────

interface CounterpartyOption {
  id: string;
  name: string;
}

interface EligibleVoucher {
  id: string;
  voucher_number: string;
  trade_date: string;
  voucher_type: string; // SALES | PURCHASE
  total_amount: number;
  settled_amount: number;
  balance: number; // 미정산 잔액
}

interface NettingWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const STEPS = ['거래처 선택', '전표 선택 및 금액 입력', '확인'];
const formatAmount = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

export default function NettingWizard({ open, onClose, onCreated }: NettingWizardProps) {
  const { enqueueSnackbar } = useSnackbar();
  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: 거래처 선택
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [cpLoading, setCpLoading] = useState(false);
  const [selectedCpId, setSelectedCpId] = useState('');
  const [selectedCpName, setSelectedCpName] = useState('');

  // Step 2: 전표 선택
  const [eligibleVouchers, setEligibleVouchers] = useState<EligibleVoucher[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [nettingAmounts, setNettingAmounts] = useState<Record<string, string>>({}); // voucher_id → 상계금액
  const [nettingDate, setNettingDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');

  // ─── 거래처 목록 로드 ──────────────────────────────────────────

  const loadCounterparties = useCallback(async () => {
    setCpLoading(true);
    try {
      const res = await settlementApi.listCounterparties({ page_size: 200 });
      const data = res.data as unknown as { counterparties: CounterpartyOption[] };
      setCounterparties(data.counterparties || []);
    } catch {
      enqueueSnackbar('거래처 목록 로드에 실패했습니다.', { variant: 'error' });
    } finally {
      setCpLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    if (open) {
      setActiveStep(0);
      setSelectedCpId('');
      setSelectedCpName('');
      setEligibleVouchers([]);
      setNettingAmounts({});
      setMemo('');
      setNettingDate(new Date().toISOString().slice(0, 10));
      loadCounterparties();
    }
  }, [open, loadCounterparties]);

  // ─── 상계 가능 전표 로드 ──────────────────────────────────────

  const loadEligible = useCallback(async () => {
    if (!selectedCpId) return;
    setEligibleLoading(true);
    try {
      const res = await settlementApi.getNettingEligible(selectedCpId);
      const data = res.data as unknown as {
        sales_vouchers: EligibleVoucher[];
        purchase_vouchers: EligibleVoucher[];
      };
      setEligibleVouchers([
        ...(data.sales_vouchers || []),
        ...(data.purchase_vouchers || []),
      ]);
      setNettingAmounts({});
    } catch {
      enqueueSnackbar('상계 가능 전표 조회에 실패했습니다.', { variant: 'error' });
    } finally {
      setEligibleLoading(false);
    }
  }, [selectedCpId, enqueueSnackbar]);

  // ─── 분류 ──────────────────────────────────────────────────────

  const salesVouchers = eligibleVouchers.filter((v) => v.voucher_type.toLowerCase() === 'sales');
  const purchaseVouchers = eligibleVouchers.filter((v) => v.voucher_type.toLowerCase() === 'purchase');

  const getSelectedAmount = (id: string) => Number(nettingAmounts[id] || 0);

  const totalSalesSelected = salesVouchers.reduce((s, v) => s + getSelectedAmount(v.id), 0);
  const totalPurchaseSelected = purchaseVouchers.reduce((s, v) => s + getSelectedAmount(v.id), 0);
  const isBalanced = totalSalesSelected > 0 && totalSalesSelected === totalPurchaseSelected;

  const handleAmountChange = (voucherId: string, value: string) => {
    setNettingAmounts((prev) => ({ ...prev, [voucherId]: value }));
  };

  // ─── 스텝 핸들러 ──────────────────────────────────────────────

  const handleNext = async () => {
    if (activeStep === 0) {
      if (!selectedCpId) {
        enqueueSnackbar('거래처를 선택해주세요.', { variant: 'warning' });
        return;
      }
      await loadEligible();
      setActiveStep(1);
    } else if (activeStep === 1) {
      if (!isBalanced) {
        enqueueSnackbar('매출(AR) 합계와 매입(AP) 합계가 일치해야 합니다.', { variant: 'error' });
        return;
      }
      setActiveStep(2);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    const vouchers = Object.entries(nettingAmounts)
      .filter(([, amt]) => Number(amt) > 0)
      .map(([voucher_id, amt]) => ({
        voucher_id,
        amount: Number(amt),
      }));

    if (vouchers.length === 0) return;

    setSubmitting(true);
    try {
      await settlementApi.createNetting({
        counterparty_id: selectedCpId,
        netting_date: nettingDate,
        netting_amount: totalSalesSelected,
        vouchers,
        memo: memo || undefined,
      });
      enqueueSnackbar('상계가 생성되었습니다.', { variant: 'success' });
      onCreated();
      onClose();
    } catch {
      enqueueSnackbar('상계 생성에 실패했습니다.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 전표 테이블 렌더 ────────────────────────────────────────

  const renderVoucherTable = (vouchers: EligibleVoucher[], label: string, color: 'info' | 'secondary') => (
    <Box sx={{ flex: 1, minWidth: 300 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        <Chip label={label} color={color} size="small" sx={{ mr: 1 }} />
        {vouchers.length}건
      </Typography>
      {vouchers.length === 0 ? (
        <Alert severity="info" variant="outlined">해당 유형의 미정산 전표가 없습니다.</Alert>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>전표번호</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>거래일</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>잔액</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>상계금액</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vouchers.map((v) => (
              <TableRow key={v.id}>
                <TableCell sx={{ fontSize: '0.75rem' }}>{v.voucher_number}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem' }}>{v.trade_date}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.75rem' }}>
                  {formatAmount(v.balance)}
                </TableCell>
                <TableCell align="right" sx={{ width: 130 }}>
                  <TextField
                    size="small"
                    type="number"
                    value={nettingAmounts[v.id] || ''}
                    onChange={(e) => handleAmountChange(v.id, e.target.value)}
                    placeholder="0"
                    InputProps={{
                      endAdornment: <InputAdornment position="end">원</InputAdornment>,
                      sx: { fontSize: '0.75rem' },
                    }}
                    inputProps={{ max: v.balance, min: 0 }}
                    sx={{ width: 130 }}
                  />
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={2} sx={{ fontWeight: 700, fontSize: '0.75rem' }}>소계</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                {formatAmount(vouchers.reduce((s, v) => s + v.balance, 0))}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem', color: 'primary.main' }}>
                {formatAmount(vouchers.reduce((s, v) => s + getSelectedAmount(v.id), 0))}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </Box>
  );

  // ─── 렌더 ──────────────────────────────────────────────────────

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>상계 생성</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* Step 1: 거래처 선택 */}
          {activeStep === 0 && (
            <Stack spacing={2}>
              <Alert severity="info" variant="outlined">
                상계할 거래처를 선택하세요. 매출(AR)과 매입(AP) 전표가 모두 있는 거래처만 상계 가능합니다.
              </Alert>
              {cpLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <FormControl size="small" fullWidth>
                  <InputLabel>거래처</InputLabel>
                  <Select
                    value={selectedCpId}
                    label="거래처"
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedCpId(id);
                      const cp = counterparties.find((c) => c.id === id);
                      setSelectedCpName(cp?.name || '');
                    }}
                  >
                    {counterparties.map((cp) => (
                      <MenuItem key={cp.id} value={cp.id}>{cp.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Stack>
          )}

          {/* Step 2: 전표 선택 + 금액 입력 */}
          {activeStep === 1 && (
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  거래처: <strong>{selectedCpName}</strong>
                </Typography>
                <TextField
                  size="small"
                  type="date"
                  label="상계일"
                  value={nettingDate}
                  onChange={(e) => setNettingDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 160 }}
                />
                <TextField
                  size="small"
                  label="메모"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  sx={{ flex: 1 }}
                  placeholder="상계 사유 (선택)"
                />
              </Box>

              {eligibleLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <>
                  {/* 2컬럼 레이아웃: AR / AP */}
                  <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {renderVoucherTable(salesVouchers, '매출 (AR)', 'info')}
                    {renderVoucherTable(purchaseVouchers, '매입 (AP)', 'secondary')}
                  </Box>

                  <Divider />

                  {/* 합계 검증 */}
                  <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">매출(AR) 상계 합계</Typography>
                      <Typography variant="h6" fontWeight={700} color="info.main">
                        {formatAmount(totalSalesSelected)}원
                      </Typography>
                    </Box>
                    <Typography variant="h5" color={isBalanced ? 'success.main' : 'error.main'} fontWeight={700}>
                      {isBalanced ? '=' : '≠'}
                    </Typography>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">매입(AP) 상계 합계</Typography>
                      <Typography variant="h6" fontWeight={700} color="secondary.main">
                        {formatAmount(totalPurchaseSelected)}원
                      </Typography>
                    </Box>
                  </Box>

                  {!isBalanced && totalSalesSelected > 0 && (
                    <Alert severity="error" variant="outlined">
                      매출(AR) 합계와 매입(AP) 합계가 일치해야 상계를 진행할 수 있습니다.
                      차이: {formatAmount(Math.abs(totalSalesSelected - totalPurchaseSelected))}원
                    </Alert>
                  )}
                </>
              )}
            </Stack>
          )}

          {/* Step 3: 확인 */}
          {activeStep === 2 && (
            <Stack spacing={2}>
              <Alert severity="success" variant="outlined">
                아래 내용으로 상계를 생성합니다. 확인 후 &quot;생성&quot;을 클릭하세요.
              </Alert>
              <Box sx={{ display: 'flex', gap: 4 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">거래처</Typography>
                  <Typography fontWeight={600}>{selectedCpName}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">상계일</Typography>
                  <Typography fontWeight={600}>{nettingDate}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">상계금액</Typography>
                  <Typography fontWeight={700} color="primary.main">
                    {formatAmount(totalSalesSelected)}원
                  </Typography>
                </Box>
              </Box>

              {memo && (
                <Box>
                  <Typography variant="caption" color="text.secondary">메모</Typography>
                  <Typography>{memo}</Typography>
                </Box>
              )}

              <Divider />

              <Typography variant="subtitle2" fontWeight={700}>상계 전표 내역</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>유형</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>전표번호</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>거래일</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>상계금액</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {eligibleVouchers
                    .filter((v) => getSelectedAmount(v.id) > 0)
                    .map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <Chip
                            label={v.voucher_type === 'SALES' ? '매출' : '매입'}
                            color={v.voucher_type === 'SALES' ? 'info' : 'secondary'}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{v.voucher_number}</TableCell>
                        <TableCell>{v.trade_date}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatAmount(getSelectedAmount(v.id))}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        {activeStep > 0 && (
          <Button onClick={handleBack}>이전</Button>
        )}
        {activeStep < 2 ? (
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={activeStep === 0 ? !selectedCpId : !isBalanced}
          >
            다음
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? '생성 중...' : '생성'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
