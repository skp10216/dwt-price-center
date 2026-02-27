'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Typography,
  InputAdornment, Autocomplete,
  Chip, Box, Paper, alpha, Skeleton, Divider,
  Stepper, Step, StepLabel,
  LinearProgress, Alert, Tooltip,
  Checkbox, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import { useSnackbar } from 'notistack';
import { settlementApi } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui';

// ─── 타입 ──────────────────────────────────────────────────────────

interface CounterpartyOption {
  id: string;
  name: string;
}

interface CpSummary {
  total_sales_amount: number;
  total_purchase_amount: number;
  total_receivable: number;
  total_payable: number;
  voucher_count: number;
}

interface VoucherItem {
  id: string;
  voucher_number: string;
  trade_date: string;
  voucher_type: string;
  total_amount: number;
  balance: number;
  settlement_status: string;
  payment_status: string;
}

interface AllocEntry {
  amount: number;
  checked: boolean;
}

interface TransactionCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** 거래처가 사전 지정된 경우 (거래처 상세에서 호출 시) */
  counterpartyId?: string;
  counterpartyName?: string;
}

// ─── 최근 거래처 (localStorage) ────────────────────────────────────

const RECENT_CP_KEY = 'txn-recent-counterparties';
const MAX_RECENT = 3;

function getRecentCounterparties(): CounterpartyOption[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_CP_KEY) || '[]');
  } catch { return []; }
}

function saveRecentCounterparty(cp: CounterpartyOption) {
  const recent = getRecentCounterparties().filter(r => r.id !== cp.id);
  recent.unshift(cp);
  localStorage.setItem(RECENT_CP_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

// ─── 금액 포맷 ────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(n);

const fmtNumber = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

function formatAmountDisplay(val: string): string {
  const num = val.replace(/[^\d]/g, '');
  return num ? Number(num).toLocaleString('ko-KR') : '';
}

function parseAmountValue(display: string): string {
  return display.replace(/[^\d]/g, '');
}

// ─── 상수 ─────────────────────────────────────────────────────────

const MAX_AMOUNT = 9_999_999_999; // 99억

// ─── 유형별 스타일 ────────────────────────────────────────────────

const TYPE_CONFIG = {
  deposit: {
    label: '입금 (수금)',
    icon: CallReceivedIcon,
    color: '#1565c0',
    lightBg: '#e3f2fd',
  },
  withdrawal: {
    label: '출금 (송금)',
    icon: CallMadeIcon,
    color: '#e65100',
    lightBg: '#fff3e0',
  },
} as const;

const STEPS = ['거래 정보', '전표 배분'];

const TABULAR_NUMS_SX = { fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' };

// ─── 유틸 함수 ────────────────────────────────────────────────────

function getDisabledReason(v: VoucherItem): string {
  if (v.settlement_status === 'locked')
    return '마감 처리된 전표입니다. 마감 해제 후 배분 가능합니다.';
  if (v.payment_status === 'locked')
    return '결제 마감된 전표입니다. 결제 마감 해제 후 배분 가능합니다.';
  if (v.balance <= 0)
    return '잔액이 0원입니다. 이미 전액 배분/정산 완료된 전표입니다.';
  return '';
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────

export default function TransactionCreateDialog({
  open,
  onClose,
  onCreated,
  counterpartyId: fixedCpId,
  counterpartyName: fixedCpName,
}: TransactionCreateDialogProps) {
  const { enqueueSnackbar } = useSnackbar();

  // ─── Step 관리 ──────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(0);

  // ─── Step 1: 거래 정보 ──────────────────────────────────────
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [loadingCps, setLoadingCps] = useState(false);
  const [selectedCp, setSelectedCp] = useState<CounterpartyOption | null>(null);
  const [transactionType, setTransactionType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountDisplay, setAmountDisplay] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recentCps, setRecentCps] = useState<CounterpartyOption[]>([]);

  // 거래처 요약
  const [cpSummary, setCpSummary] = useState<CpSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // ─── Step 2: 전표 배분 ──────────────────────────────────────
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [allocMap, setAllocMap] = useState<Map<string, AllocEntry>>(new Map());
  const [lastLoadKey, setLastLoadKey] = useState('');

  // ─── 확인 다이얼로그 ───────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'withAlloc' | 'withoutAlloc' | null>(null);

  // ─── Computed ───────────────────────────────────────────────
  const numericAmount = Number(parseAmountValue(amountDisplay));
  const activeConfig = TYPE_CONFIG[transactionType];

  const totalAllocated = useMemo(() => {
    let sum = 0;
    allocMap.forEach((entry) => {
      if (entry.checked) sum += entry.amount;
    });
    return sum;
  }, [allocMap]);

  const remaining = numericAmount - totalAllocated;
  const overAllocated = totalAllocated > numericAmount;

  const relevantBalance = cpSummary
    ? (transactionType === 'deposit' ? cpSummary.total_receivable : cpSummary.total_payable)
    : 0;

  const isLocked = (v: VoucherItem) =>
    v.settlement_status === 'locked' || v.payment_status === 'locked';

  const activeVouchers = useMemo(
    () => vouchers.filter(v => !isLocked(v) && v.balance > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vouchers],
  );

  // 금액 검증
  const amountError = useMemo(() => {
    if (amountDisplay === '') return null;
    if (numericAmount <= 0) return '1원 이상 입력해주세요.';
    if (numericAmount > MAX_AMOUNT) return `최대 ${fmtNumber(MAX_AMOUNT)}원까지 입력 가능합니다.`;
    return null;
  }, [amountDisplay, numericAmount]);

  // Step 1 비활성 사유
  const getStep1DisabledReason = (): string | null => {
    if (!selectedCp) return '거래처를 선택해주세요';
    if (amountDisplay === '') return '금액을 입력해주세요';
    if (amountError) return amountError;
    if (numericAmount <= 0) return '금액을 입력해주세요';
    return null;
  };

  // ─── 거래처 로드 ────────────────────────────────────────────

  const loadCounterparties = useCallback(async () => {
    if (fixedCpId) return;
    setLoadingCps(true);
    try {
      const res = await settlementApi.listCounterparties({ page_size: 200 });
      const data = res.data as unknown as { counterparties: CounterpartyOption[] };
      setCounterparties(data.counterparties || []);
    } catch { /* ignore */ }
    finally { setLoadingCps(false); }
  }, [fixedCpId]);

  // ─── 다이얼로그 오픈 시 초기화 ─────────────────────────────

  useEffect(() => {
    if (open) {
      loadCounterparties();
      if (fixedCpId && fixedCpName) {
        setSelectedCp({ id: fixedCpId, name: fixedCpName });
      } else {
        setSelectedCp(null);
      }
      setActiveStep(0);
      setTransactionType('deposit');
      setTransactionDate(new Date().toISOString().slice(0, 10));
      setAmountDisplay('');
      setMemo('');
      setCpSummary(null);
      setRecentCps(getRecentCounterparties());
      setVouchers([]);
      setAllocMap(new Map());
      setLastLoadKey('');
      setConfirmOpen(false);
      setPendingAction(null);
    }
  }, [open, fixedCpId, fixedCpName, loadCounterparties]);

  // ─── 거래처 선택 시 요약 로드 ──────────────────────────────

  useEffect(() => {
    if (!selectedCp) { setCpSummary(null); return; }
    let cancelled = false;
    setLoadingSummary(true);
    settlementApi.getCounterpartySummary(selectedCp.id)
      .then((res) => {
        if (!cancelled) setCpSummary(res.data as unknown as CpSummary);
      })
      .catch(() => { if (!cancelled) setCpSummary(null); })
      .finally(() => { if (!cancelled) setLoadingSummary(false); });
    return () => { cancelled = true; };
  }, [selectedCp]);

  // ─── Step 2 진입 시 전표 로드 ──────────────────────────────

  const loadVouchers = useCallback(async () => {
    if (!selectedCp) return;
    setLoadingVouchers(true);
    try {
      const voucherType = transactionType === 'deposit' ? 'sales' : 'purchase';
      const res = await settlementApi.listVouchers({
        counterparty_id: selectedCp.id,
        voucher_type: voucherType,
        page_size: 200,
      });
      const data = res.data as unknown as { vouchers: VoucherItem[] };
      // Decimal → number 변환 (백엔드에서 문자열로 직렬화됨)
      const parsed = (data.vouchers || []).map((v) => ({
        ...v,
        total_amount: Number(v.total_amount) || 0,
        balance: Number(v.balance) || 0,
      }));
      // trade_date ASC 정렬 (FIFO)
      const sorted = parsed.sort(
        (a, b) => a.trade_date.localeCompare(b.trade_date) || a.voucher_number.localeCompare(b.voucher_number),
      );
      setVouchers(sorted);
      setAllocMap(new Map());
    } catch {
      enqueueSnackbar('전표 목록 로드에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoadingVouchers(false);
    }
  }, [selectedCp, transactionType, enqueueSnackbar]);

  // ─── 금액 핸들러 ───────────────────────────────────────────

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseAmountValue(e.target.value);
    setAmountDisplay(formatAmountDisplay(raw));
  };

  const handleFillBalance = () => {
    if (relevantBalance > 0) {
      setAmountDisplay(formatAmountDisplay(String(Math.floor(relevantBalance))));
    }
  };

  // ─── FIFO 자동배분 ─────────────────────────────────────────

  const handleAutoAllocate = () => {
    const newMap = new Map<string, AllocEntry>();
    let rem = numericAmount;
    for (const v of vouchers) {
      if (rem <= 0 || v.balance <= 0 || isLocked(v)) {
        newMap.set(v.id, { amount: 0, checked: false });
        continue;
      }
      const alloc = Math.min(rem, v.balance);
      newMap.set(v.id, { amount: alloc, checked: true });
      rem -= alloc;
    }
    setAllocMap(newMap);
  };

  const handleClearAlloc = () => {
    setAllocMap(new Map());
  };

  // ─── 체크박스 토글 ─────────────────────────────────────────

  const handleCheckToggle = (voucherId: string, balance: number) => {
    setAllocMap(prev => {
      const next = new Map(prev);
      const entry = next.get(voucherId);
      if (entry?.checked) {
        // 체크 해제 → 금액 0
        next.set(voucherId, { amount: 0, checked: false });
      } else {
        // 체크 ON → 미배분 잔액과 전표 잔액 중 작은 값
        const currentRemaining = numericAmount - totalAllocated + (entry?.amount || 0);
        const autoAmount = Math.min(balance, Math.max(currentRemaining, 0));
        // 배분 가능 금액이 0이면 체크 자체를 막음
        if (autoAmount <= 0) return prev;
        next.set(voucherId, { amount: autoAmount, checked: true });
      }
      return next;
    });
  };

  // ─── 배분 금액 직접 입력 ───────────────────────────────────

  const handleAllocAmountChange = (voucherId: string, rawValue: string, balance: number) => {
    const num = Number(rawValue.replace(/[^\d]/g, ''));
    setAllocMap(prev => {
      const next = new Map(prev);
      // 다른 전표들의 배분 합계
      let othersTotal = 0;
      prev.forEach((entry, id) => {
        if (id !== voucherId && entry.checked) othersTotal += entry.amount;
      });
      // 최대 배분 가능 금액 = min(전표잔액, 남은 배분 가능 금액)
      const maxAlloc = Math.min(balance, numericAmount - othersTotal);
      const capped = Math.min(Math.max(num, 0), Math.max(maxAlloc, 0));
      next.set(voucherId, { amount: capped, checked: capped > 0 });
      return next;
    });
  };

  // ─── Step 이동 ─────────────────────────────────────────────

  const handleGoToAllocation = async () => {
    setActiveStep(1);
    // 거래처+유형이 변경되지 않았으면 전표 재로드 스킵 (배분 상태 유지)
    const currentKey = `${selectedCp?.id}_${transactionType}`;
    if (currentKey !== lastLoadKey) {
      await loadVouchers();
      setLastLoadKey(currentKey);
    }
  };

  const handleBackToStep1 = () => {
    setActiveStep(0);
  };

  // ─── 확인 다이얼로그 연동 ─────────────────────────────────

  const handleRequestSubmit = (action: 'withAlloc' | 'withoutAlloc') => {
    setPendingAction(action);
    setConfirmOpen(true);
  };

  const handleConfirmSubmit = () => {
    setConfirmOpen(false);
    if (pendingAction === 'withAlloc') handleSubmitWithAlloc();
    else handleSubmitWithoutAlloc();
  };

  // ─── 제출 (배분 없이) ──────────────────────────────────────

  const handleSubmitWithoutAlloc = async () => {
    if (!selectedCp || numericAmount <= 0) {
      enqueueSnackbar('거래처, 금액을 올바르게 입력해주세요.', { variant: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      await settlementApi.createTransaction({
        counterparty_id: selectedCp.id,
        transaction_type: transactionType,
        transaction_date: transactionDate,
        amount: numericAmount,
        memo: memo || undefined,
      });
      if (!fixedCpId) saveRecentCounterparty(selectedCp);
      enqueueSnackbar(
        `${activeConfig.label} ${fmtNumber(numericAmount)}원 등록 완료`,
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

  // ─── 제출 (배분 포함) ──────────────────────────────────────

  const handleSubmitWithAlloc = async () => {
    if (!selectedCp || numericAmount <= 0) return;
    if (overAllocated) {
      enqueueSnackbar('배분 합계가 입금액을 초과합니다.', { variant: 'error' });
      return;
    }

    const allocations: { voucher_id: string; amount: number }[] = [];
    allocMap.forEach((entry, voucherId) => {
      if (entry.checked && entry.amount > 0) {
        allocations.push({ voucher_id: voucherId, amount: entry.amount });
      }
    });

    setSubmitting(true);
    try {
      // 1) 입출금 등록
      const txnRes = await settlementApi.createTransaction({
        counterparty_id: selectedCp.id,
        transaction_type: transactionType,
        transaction_date: transactionDate,
        amount: numericAmount,
        memo: memo || undefined,
      });

      if (!fixedCpId) saveRecentCounterparty(selectedCp);

      // 2) 배분 처리
      if (allocations.length > 0) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const txnData = (txnRes.data as any)?.data ?? txnRes.data;
          const txnId = txnData.id;
          await settlementApi.manualAllocate(txnId, allocations);
          enqueueSnackbar(
            `${activeConfig.label} ${fmtNumber(numericAmount)}원 등록 + ${allocations.length}건 배분 완료`,
            { variant: 'success' },
          );
        } catch {
          enqueueSnackbar(
            '입출금 등록 완료, 배분 실패 (배분 관리에서 재시도해주세요)',
            { variant: 'warning' },
          );
        }
      } else {
        enqueueSnackbar(
          `${activeConfig.label} ${fmtNumber(numericAmount)}원 등록 완료`,
          { variant: 'success' },
        );
      }
      onCreated();
      onClose();
    } catch {
      enqueueSnackbar('등록에 실패했습니다.', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 유형 선택 카드 ────────────────────────────────────────

  const renderTypeCard = (type: 'deposit' | 'withdrawal') => {
    const config = TYPE_CONFIG[type];
    const Icon = config.icon;
    const isSelected = transactionType === type;
    return (
      <Box
        onClick={() => {
          setTransactionType(type);
          // 유형 변경 시 배분 초기화
          if (activeStep === 0) setAllocMap(new Map());
        }}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.5,
          py: 1.5,
          px: 1,
          borderRadius: 2,
          cursor: 'pointer',
          border: '2px solid',
          borderColor: isSelected ? config.color : 'divider',
          bgcolor: isSelected ? config.color : 'transparent',
          color: isSelected ? '#fff' : 'text.secondary',
          transition: 'all 0.15s ease-in-out',
          '&:hover': {
            borderColor: config.color,
            bgcolor: isSelected ? config.color : alpha(config.color, 0.06),
          },
        }}
      >
        <Icon sx={{ fontSize: 26 }} />
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: isSelected ? 700 : 500, color: 'inherit', lineHeight: 1.2 }}
        >
          {config.label}
        </Typography>
      </Box>
    );
  };

  // ─── 거래처 요약 미니카드 ──────────────────────────────────

  const renderCpSummary = () => {
    if (!selectedCp) return null;

    if (loadingSummary) {
      return (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Stack spacing={1}>
            <Skeleton width="60%" height={20} />
            <Skeleton width="80%" height={32} />
          </Stack>
        </Paper>
      );
    }

    if (!cpSummary) return null;

    const isDeposit = transactionType === 'deposit';
    const primaryLabel = isDeposit ? '미수 잔액' : '미지급 잔액';
    const primaryValue = isDeposit ? cpSummary.total_receivable : cpSummary.total_payable;
    const primaryIcon = isDeposit ? <TrendingUpIcon sx={{ fontSize: 16 }} /> : <TrendingDownIcon sx={{ fontSize: 16 }} />;
    const secondaryLabel = isDeposit ? '미지급 잔액' : '미수 잔액';
    const secondaryValue = isDeposit ? cpSummary.total_payable : cpSummary.total_receivable;
    const totalLabel = isDeposit ? '총 매출' : '총 매입';
    const totalValue = isDeposit ? cpSummary.total_sales_amount : cpSummary.total_purchase_amount;
    const paidLabel = isDeposit ? '입금 합계' : '출금 합계';
    const paidValue = totalValue - primaryValue;
    const paidRate = totalValue > 0 ? Math.round((paidValue / totalValue) * 100) : 0;

    return (
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 2,
          overflow: 'hidden',
          borderColor: alpha(activeConfig.color, 0.25),
          transition: 'all 0.2s',
        }}
      >
        <Box sx={{
          px: 2, py: 1.5,
          bgcolor: alpha(activeConfig.color, 0.06),
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Box>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.25 }}>
              {primaryIcon}
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {primaryLabel}
              </Typography>
              <Chip
                label={isDeposit ? '수금 대상' : '지급 대상'}
                size="small"
                sx={{
                  height: 18, fontSize: '0.6rem', fontWeight: 700,
                  bgcolor: alpha(activeConfig.color, 0.15),
                  color: activeConfig.color,
                }}
              />
            </Stack>
            <Typography variant="h6" fontWeight={800} sx={{
              color: primaryValue > 0 ? activeConfig.color : 'success.main',
              lineHeight: 1.2,
            }}>
              {primaryValue > 0 ? fmtCurrency(primaryValue) : '정산 완료'}
            </Typography>
          </Box>
          {primaryValue > 0 && (
            <Button
              size="small"
              variant="outlined"
              onClick={handleFillBalance}
              sx={{
                fontSize: '0.7rem',
                fontWeight: 700,
                borderColor: alpha(activeConfig.color, 0.4),
                color: activeConfig.color,
                whiteSpace: 'nowrap',
                '&:hover': { bgcolor: alpha(activeConfig.color, 0.08), borderColor: activeConfig.color },
              }}
            >
              잔액 전액
            </Button>
          )}
        </Box>
        <Divider />
        <Box sx={{ px: 2, py: 1, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>{totalLabel}</Typography>
            <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>{fmtCurrency(totalValue)}</Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>{paidLabel}</Typography>
            <Typography variant="body2" fontWeight={600} color="success.main" sx={{ lineHeight: 1.2 }}>{fmtCurrency(paidValue)}</Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>결제율</Typography>
            <Typography variant="body2" fontWeight={600} sx={{
              lineHeight: 1.2,
              color: paidRate >= 100 ? 'success.main' : paidRate >= 70 ? 'text.primary' : 'warning.main',
            }}>
              {paidRate}%
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>{secondaryLabel}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.2 }}>{fmtCurrency(secondaryValue)}</Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>전표</Typography>
            <Typography variant="body2" sx={{ lineHeight: 1.2 }}>{cpSummary.voucher_count}건</Typography>
          </Box>
        </Box>
      </Paper>
    );
  };

  // ─── Step 2: 배분 진행률 바 ────────────────────────────────

  const renderAllocProgress = () => {
    const pct = numericAmount > 0 ? Math.min((totalAllocated / numericAmount) * 100, 100) : 0;
    const progressColor = overAllocated ? 'error' : (pct === 100 ? 'success' : 'primary');

    const statusMessage = overAllocated
      ? `초과: ${fmtNumber(totalAllocated - numericAmount)}원`
      : remaining === 0
        ? '전액 배분 완료'
        : `미배분: ${fmtNumber(remaining)}원`;

    const statusChipColor = overAllocated
      ? 'error.main'
      : remaining === 0
        ? 'success.main'
        : 'warning.main';

    const statusChipBg = overAllocated
      ? alpha('#d32f2f', 0.12)
      : remaining === 0
        ? alpha('#2e7d32', 0.12)
        : alpha('#ed6c02', 0.12);

    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="body2" fontWeight={600} sx={{ ...TABULAR_NUMS_SX }}>
            배분: {fmtCurrency(totalAllocated)} / {fmtCurrency(numericAmount)}
          </Typography>
          <Chip
            label={statusMessage}
            size="small"
            sx={{
              fontWeight: 700,
              bgcolor: statusChipBg,
              color: statusChipColor,
              fontSize: '0.75rem',
              ...TABULAR_NUMS_SX,
            }}
          />
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(pct, 100)}
          color={progressColor}
          sx={{ height: 8, borderRadius: 4 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'right', ...TABULAR_NUMS_SX }}>
          {Math.round(pct)}%
        </Typography>
      </Paper>
    );
  };

  // ─── Step 2: 전표 테이블 ───────────────────────────────────

  const renderVoucherTable = () => {
    if (loadingVouchers) {
      return (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
        </Box>
      );
    }

    if (vouchers.length === 0) {
      return (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          배분 가능한 전표가 없습니다. 배분 없이 등록하려면 이전 단계에서 &quot;배분 없이 등록&quot;을 선택하세요.
        </Alert>
      );
    }

    // 합계 계산
    const totalVoucherAmount = vouchers.reduce((s, v) => s + v.total_amount, 0);
    const totalBalance = vouchers.reduce((s, v) => s + v.balance, 0);

    return (
      <TableContainer sx={{ maxHeight: 400, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ bgcolor: 'grey.50' }} />
              <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.50' }}>거래일</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.50' }}>전표번호</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'grey.50' }}>전표금액</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'grey.50' }}>잔액</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'grey.50', minWidth: 140 }}>배분액</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vouchers.map((v) => {
              const locked = isLocked(v);
              const noBalance = v.balance <= 0;
              const disabled = locked || noBalance;
              const entry = allocMap.get(v.id);
              const checked = entry?.checked ?? false;
              const allocAmount = entry?.amount ?? 0;

              return (
                <TableRow
                  key={v.id}
                  sx={{
                    opacity: disabled ? 0.45 : 1,
                    bgcolor: checked ? alpha(activeConfig.color, 0.04) : 'transparent',
                    '&:hover': { bgcolor: disabled ? 'transparent' : alpha(activeConfig.color, 0.06) },
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => handleCheckToggle(v.id, v.balance)}
                      sx={checked ? { color: activeConfig.color, '&.Mui-checked': { color: activeConfig.color } } : {}}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ ...TABULAR_NUMS_SX }}>
                      {v.trade_date.slice(0, 10)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500} sx={{ ...TABULAR_NUMS_SX }}>
                      {v.voucher_number}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ ...TABULAR_NUMS_SX }}>
                      {fmtNumber(v.total_amount)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {disabled ? (
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ ...TABULAR_NUMS_SX, color: v.balance > 0 ? 'error.main' : 'success.main' }}
                      >
                        {fmtNumber(v.balance)}
                      </Typography>
                    ) : (
                      <Tooltip title="클릭하여 잔액 전액 배분" arrow>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          onClick={() => handleAllocAmountChange(v.id, String(v.balance), v.balance)}
                          sx={{
                            ...TABULAR_NUMS_SX,
                            color: v.balance > 0 ? 'error.main' : 'success.main',
                            cursor: 'pointer',
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          {fmtNumber(v.balance)}
                        </Typography>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {disabled ? (
                      <Tooltip title={getDisabledReason(v)} arrow placement="left">
                        <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', cursor: 'help' }}>
                          {locked ? '마감' : '정산완료'}
                        </Typography>
                      </Tooltip>
                    ) : (
                      <TextField
                        size="small"
                        value={allocAmount > 0 ? fmtNumber(allocAmount) : ''}
                        onChange={(e) => handleAllocAmountChange(v.id, e.target.value, v.balance)}
                        placeholder="0"
                        disabled={disabled}
                        inputProps={{
                          style: { textAlign: 'right', padding: '4px 8px', ...TABULAR_NUMS_SX },
                        }}
                        sx={{
                          width: 140,
                          '& .MuiOutlinedInput-root': {
                            bgcolor: checked ? alpha(activeConfig.color, 0.06) : 'transparent',
                          },
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* 합계 행 */}
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell colSpan={3}>
                <Typography variant="body2" fontWeight={700}>
                  합계 ({vouchers.length}건, 활성 {activeVouchers.length}건)
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={700} sx={{ ...TABULAR_NUMS_SX }}>
                  {fmtNumber(totalVoucherAmount)}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={700} sx={{ ...TABULAR_NUMS_SX, color: 'error.main' }}>
                  {fmtNumber(totalBalance)}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={700} sx={{ ...TABULAR_NUMS_SX, color: activeConfig.color }}>
                  {fmtNumber(totalAllocated)}
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  // ─── Step 유효성 ───────────────────────────────────────────

  const step1Valid = !!selectedCp && numericAmount > 0 && !amountError;
  const step2Valid = !overAllocated;
  const allocCount = Array.from(allocMap.values()).filter(e => e.checked && e.amount > 0).length;

  // ─── 확인 다이얼로그 요약 렌더링 ──────────────────────────

  const renderConfirmContent = () => (
    <Stack spacing={1.5} sx={{ mt: 1 }}>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="caption" color="text.secondary">유형</Typography>
          <Typography fontWeight={600}>{activeConfig.label}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">거래처</Typography>
          <Typography fontWeight={600}>{selectedCp?.name}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">금액</Typography>
          <Typography fontWeight={700} sx={{ color: activeConfig.color, ...TABULAR_NUMS_SX }}>
            {fmtCurrency(numericAmount)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">일자</Typography>
          <Typography fontWeight={600} sx={{ ...TABULAR_NUMS_SX }}>{transactionDate}</Typography>
        </Box>
      </Box>
      {memo && (
        <Box>
          <Typography variant="caption" color="text.secondary">메모</Typography>
          <Typography variant="body2">{memo}</Typography>
        </Box>
      )}
      {pendingAction === 'withAlloc' && allocCount > 0 && (
        <>
          <Divider />
          <Box>
            <Typography variant="caption" color="text.secondary">배분 요약</Typography>
            <Typography variant="body2" sx={{ ...TABULAR_NUMS_SX }}>
              {allocCount}건, 합계 {fmtCurrency(totalAllocated)}
              {remaining > 0 ? ` (미배분: ${fmtCurrency(remaining)})` : ' (전액 배분)'}
            </Typography>
          </Box>
        </>
      )}
    </Stack>
  );

  // ─── 렌더링 ────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={activeStep === 0 ? 'sm' : 'md'}
      fullWidth
      TransitionProps={{ style: { transition: 'all 0.2s ease' } }}
    >
      {/* ─── 헤더 ─── */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: alpha(activeConfig.color, 0.06),
          borderBottom: '2px solid',
          borderColor: alpha(activeConfig.color, 0.2),
          transition: 'all 0.2s',
          pb: 1,
        }}
      >
        <SwapHorizIcon sx={{ color: activeConfig.color }} />
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>입출금 등록</Typography>
      </DialogTitle>

      {/* ─── Stepper ─── */}
      <Box sx={{ px: 3, pt: 2 }}>
        <Stepper activeStep={activeStep} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      <DialogContent sx={{ pt: '16px !important', pb: 1 }}>

        {/* ══════════════════ Step 1: 거래 정보 ══════════════════ */}
        {activeStep === 0 && (
          <Stack spacing={2}>

            {/* 유형 선택 */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontWeight: 600, letterSpacing: 0.5 }}>
                유형 선택
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                {renderTypeCard('deposit')}
                {renderTypeCard('withdrawal')}
              </Box>
            </Box>

            {/* 유형 안내 텍스트 */}
            {selectedCp && cpSummary && (
              <Typography variant="caption" sx={{
                color: activeConfig.color, fontWeight: 600,
                transition: 'color 0.2s',
                mt: -1,
              }}>
                {transactionType === 'deposit'
                  ? `${selectedCp.name}의 미수금 ${fmtCurrency(cpSummary.total_receivable)}을 수금합니다`
                  : `${selectedCp.name}에 미지급금 ${fmtCurrency(cpSummary.total_payable)}을 송금합니다`
                }
              </Typography>
            )}

            {/* 거래처 */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontWeight: 600, letterSpacing: 0.5 }}>
                거래처
              </Typography>
              {fixedCpId ? (
                <TextField
                  value={fixedCpName || fixedCpId}
                  disabled
                  size="small"
                  fullWidth
                />
              ) : (
                <>
                  {recentCps.length > 0 && !selectedCp && (
                    <Box sx={{ mb: 1, display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>최근:</Typography>
                      {recentCps.map((cp) => (
                        <Chip
                          key={cp.id}
                          label={cp.name}
                          size="small"
                          variant="outlined"
                          onClick={() => setSelectedCp(cp)}
                          clickable
                        />
                      ))}
                    </Box>
                  )}
                  <Autocomplete
                    options={counterparties}
                    getOptionLabel={(cp) => cp.name}
                    value={selectedCp}
                    loading={loadingCps}
                    loadingText="거래처 목록 로딩 중..."
                    onChange={(_, cp) => {
                      setSelectedCp(cp);
                      // 거래처 변경 시 배분 초기화
                      setAllocMap(new Map());
                    }}
                    renderInput={(params) => (
                      <TextField {...params} placeholder="거래처명 검색..." size="small" />
                    )}
                    noOptionsText="검색 결과 없음"
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    fullWidth
                  />
                </>
              )}
            </Box>

            {/* 거래처 요약 */}
            {renderCpSummary()}

            {/* 금액 + 날짜 */}
            <Paper
              variant="outlined"
              sx={{ p: 2, borderRadius: 2, bgcolor: alpha(activeConfig.color, 0.02), borderColor: alpha(activeConfig.color, 0.15), transition: 'all 0.2s' }}
            >
              <Stack spacing={2}>
                <TextField
                  label="금액"
                  value={amountDisplay}
                  onChange={handleAmountChange}
                  fullWidth
                  placeholder="0"
                  error={!!amountError}
                  helperText={amountError || (numericAmount > 0 ? fmtCurrency(numericAmount) : undefined)}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">원</InputAdornment>,
                    sx: { fontSize: '1.25rem', fontWeight: 600 },
                  }}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="입출금일"
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="메모"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="선택 사항"
                />
              </Stack>
            </Paper>

            {/* 잔액 초과 경고 */}
            {numericAmount > 0 && relevantBalance > 0 && numericAmount > relevantBalance && (
              <Alert severity="warning" sx={{ borderRadius: 1.5, py: 0.5 }} icon={false}>
                <Typography variant="caption">
                  입력 금액이 {transactionType === 'deposit' ? '미수' : '미지급'} 잔액
                  ({fmtCurrency(relevantBalance)})을 초과합니다.
                  의도적인 초과 {transactionType === 'deposit' ? '입금' : '출금'}이 아니라면 금액을 확인해주세요.
                </Typography>
              </Alert>
            )}
          </Stack>
        )}

        {/* ══════════════════ Step 2: 전표 배분 ══════════════════ */}
        {activeStep === 1 && (
          <Stack spacing={2}>

            {/* 컨텍스트 바 */}
            <Paper
              variant="outlined"
              sx={{
                px: 2, py: 1.5, borderRadius: 2,
                bgcolor: alpha(activeConfig.color, 0.04),
                borderColor: alpha(activeConfig.color, 0.2),
                display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
              }}
            >
              <Chip
                label={selectedCp?.name}
                size="small"
                sx={{ fontWeight: 700, bgcolor: alpha(activeConfig.color, 0.12), color: activeConfig.color, borderColor: alpha(activeConfig.color, 0.3), border: '1px solid' }}
              />
              <Chip
                icon={<activeConfig.icon sx={{ fontSize: 16, color: '#fff !important' }} />}
                label={activeConfig.label}
                size="small"
                sx={{ bgcolor: activeConfig.color, color: '#fff', fontWeight: 700, fontSize: '0.8rem', height: 28, '& .MuiChip-icon': { ml: '6px' } }}
              />
              <Typography variant="body2" fontWeight={700} sx={{ ...TABULAR_NUMS_SX }}>
                {fmtCurrency(numericAmount)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                · {transactionDate}
              </Typography>
              {cpSummary && relevantBalance > 0 && (
                <Chip
                  label={`${transactionType === 'deposit' ? '미수' : '미지급'}: ${fmtCurrency(relevantBalance)}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontWeight: 600, fontSize: '0.7rem',
                    borderColor: alpha(activeConfig.color, 0.3),
                    color: 'text.secondary',
                    ...TABULAR_NUMS_SX,
                  }}
                />
              )}
              {memo && (
                <Typography variant="caption" color="text.disabled" sx={{
                  maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  메모: {memo}
                </Typography>
              )}
            </Paper>

            {/* 배분 진행률 */}
            {renderAllocProgress()}

            {/* 과배분 경고 */}
            {overAllocated && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                배분 합계({fmtNumber(totalAllocated)}원)가 입금액({fmtNumber(numericAmount)}원)을 초과합니다. 금액을 조정해주세요.
              </Alert>
            )}

            {/* 액션 버튼 */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AutoFixHighIcon />}
                onClick={handleAutoAllocate}
                disabled={loadingVouchers || activeVouchers.length === 0}
                sx={{
                  fontWeight: 600,
                  borderColor: activeConfig.color,
                  color: activeConfig.color,
                  '&:hover': { bgcolor: alpha(activeConfig.color, 0.06), borderColor: activeConfig.color },
                }}
              >
                FIFO 자동배분
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ClearAllIcon />}
                onClick={handleClearAlloc}
                disabled={allocMap.size === 0}
                color="inherit"
                sx={{ fontWeight: 600 }}
              >
                전체 해제
              </Button>
            </Box>

            {/* 전표 테이블 */}
            {renderVoucherTable()}
          </Stack>
        )}
      </DialogContent>

      {/* ─── 액션 버튼 ─── */}
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5 }}>
        <Button onClick={onClose} sx={{ mr: 'auto' }}>취소</Button>

        {activeStep === 0 && (
          <>
            <Button
              variant="outlined"
              onClick={() => handleRequestSubmit('withoutAlloc')}
              disabled={submitting || !step1Valid}
              sx={{ fontWeight: 600 }}
            >
              {submitting ? '등록 중...' : '배분 없이 등록'}
            </Button>
            {(() => {
              const reason = getStep1DisabledReason();
              const btn = (
                <Button
                  variant="contained"
                  onClick={handleGoToAllocation}
                  disabled={!step1Valid}
                  sx={{
                    px: 3,
                    fontWeight: 700,
                    bgcolor: activeConfig.color,
                    '&:hover': { bgcolor: activeConfig.color, filter: 'brightness(0.9)' },
                  }}
                >
                  다음: 배분 →
                </Button>
              );
              return reason ? (
                <Tooltip title={reason} arrow>
                  <span>{btn}</span>
                </Tooltip>
              ) : btn;
            })()}
          </>
        )}

        {activeStep === 1 && (
          <>
            <Button onClick={handleBackToStep1} sx={{ fontWeight: 600 }}>
              ← 이전
            </Button>
            <Button
              variant="contained"
              onClick={() => handleRequestSubmit('withAlloc')}
              disabled={submitting || !step2Valid}
              sx={{
                px: 4,
                py: 1,
                fontWeight: 700,
                bgcolor: activeConfig.color,
                '&:hover': { bgcolor: activeConfig.color, filter: 'brightness(0.9)' },
              }}
            >
              {submitting ? '등록 중...' : (
                allocCount > 0
                  ? `등록 + ${allocCount}건 배분`
                  : '배분 없이 등록'
              )}
            </Button>
          </>
        )}
      </DialogActions>

      {/* ─── 확인 다이얼로그 ─── */}
      <ConfirmDialog
        open={confirmOpen}
        title="입출금 등록 확인"
        confirmLabel={
          pendingAction === 'withAlloc' && allocCount > 0
            ? `등록 + ${allocCount}건 배분`
            : '등록'
        }
        confirmColor={transactionType === 'deposit' ? 'primary' : 'warning'}
        loading={submitting}
        maxWidth="sm"
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirmOpen(false)}
      >
        {renderConfirmContent()}
      </ConfirmDialog>
    </Dialog>
  );
}
