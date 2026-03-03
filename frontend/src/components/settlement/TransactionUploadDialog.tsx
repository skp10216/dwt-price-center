'use client';

import { useState, useRef, useCallback, useEffect, DragEvent } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, Stack, Chip, Divider, Alert, AlertTitle,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableFooter,
  Checkbox, LinearProgress, CircularProgress, alpha, useTheme, IconButton,
  Stepper, Step, StepLabel, Autocomplete, TextField, Tooltip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Close as CloseIcon,
  InsertDriveFile as FileIcon,
  ArrowDownward as DepositIcon,
  ArrowUpward as WithdrawalIcon,
  PersonAdd as PersonAddIcon,
  Link as LinkIcon,
  SkipNext as SkipIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

interface PreviewRow {
  row_number: number;
  transaction_date: string | null;
  counterparty_name: string;
  counterparty_id: string | null;
  category: string;
  description: string;
  transaction_type: 'deposit' | 'withdrawal' | null;
  amount: number;
  balance: number | null;
  status: 'ok' | 'error' | 'unmatched' | 'skipped';
  message: string | null;
}

interface PreviewSummary {
  total: number;
  valid: number;
  error: number;
  unmatched: number;
  skipped: number;
  total_deposit: number;
  total_withdrawal: number;
}

interface PreviewResult {
  rows: PreviewRow[];
  summary: PreviewSummary;
  unmatched_counterparties: string[];
}

interface ConfirmResult {
  created_count: number;
  skipped_count: number;
  errors: Array<{ row: number; error: string }>;
}

interface CounterpartyOption {
  id: string;
  name: string;
}

type MappingAction = 'create' | 'link' | 'skip';

interface MappingState {
  action: MappingAction;
  linkedCounterparty: CounterpartyOption | null;
}

const STEPS = ['파일 업로드', '미리보기 확인', '최종 확인', '등록 완료'];

interface CounterpartySummary {
  name: string;
  depositCount: number;
  depositAmount: number;
  withdrawalCount: number;
  withdrawalAmount: number;
  totalCount: number;
  net: number;
}
const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

interface TransactionUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function TransactionUploadDialog({ open, onClose, onCreated }: TransactionUploadDialogProps) {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // 미매칭 거래처 처리
  const [mappingActions, setMappingActions] = useState<Record<string, MappingState>>({});
  const [counterpartyOptions, setCounterpartyOptions] = useState<CounterpartyOption[]>([]);
  const [resolving, setResolving] = useState(false);

  // 업로드 진행률 시뮬레이션
  useEffect(() => {
    if (!uploading) { setUploadProgress(0); return; }
    setUploadProgress(5);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) { clearInterval(interval); return 90; }
        const increment = Math.max(1, Math.floor((90 - prev) * 0.15));
        return Math.min(90, prev + increment);
      });
    }, 200);
    return () => clearInterval(interval);
  }, [uploading]);

  // 거래처 목록 로드 (미매칭 존재 시)
  useEffect(() => {
    if (!preview?.unmatched_counterparties.length) return;
    settlementApi.listCounterparties({ page_size: 200 }).then((res) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res.data as any)?.data ?? res.data;
      const list = (data?.counterparties ?? []).map((c: { id: string; name: string }) => ({
        id: c.id,
        name: c.name,
      }));
      setCounterpartyOptions(list);
    }).catch(() => { /* ignore */ });
  }, [preview?.unmatched_counterparties.length]);

  const reset = () => {
    setStep(0);
    setFile(null);
    setUploading(false);
    setPreview(null);
    setSelectedRows(new Set());
    setConfirming(false);
    setResult(null);
    setDragOver(false);
    setMappingActions({});
    setResolving(false);
  };

  const handleClose = () => {
    if (result?.created_count) onCreated?.();
    reset();
    onClose();
  };

  // ─── 미리보기 데이터 적용 ─────────────────────────────
  const applyPreview = (data: PreviewResult) => {
    setPreview(data);
    const okSet = new Set<number>();
    data.rows.forEach((r, i) => { if (r.status === 'ok') okSet.add(i); });
    setSelectedRows(okSet);
    // 미매칭 거래처 초기 매핑 상태
    const actions: Record<string, MappingState> = {};
    data.unmatched_counterparties.forEach((name) => {
      actions[name] = mappingActions[name] ?? { action: 'create', linkedCounterparty: null };
    });
    setMappingActions(actions);
  };

  // ─── Step 0: 파일 업로드 ─────────────────────────────
  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    setUploading(true);
    try {
      const res = await settlementApi.previewTransactionUpload(f);
      const data = (res.data as unknown as { data: PreviewResult })?.data ?? res.data as unknown as PreviewResult;
      applyPreview(data);
      setUploadProgress(100);
      setStep(1);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '파일 처리에 실패했습니다.';
      enqueueSnackbar(msg, { variant: 'error' });
      setFile(null);
    } finally {
      setUploading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enqueueSnackbar]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) handleFileSelect(f);
    else enqueueSnackbar('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.', { variant: 'warning' });
  };

  // ─── 미매칭 거래처 처리 ────────────────────────────────
  const updateMapping = (name: string, update: Partial<MappingState>) => {
    setMappingActions((prev) => ({
      ...prev,
      [name]: { ...prev[name], ...update },
    }));
  };

  const handleResolveUnmatched = async () => {
    if (!file) return;
    setResolving(true);
    try {
      // 1) 신규 등록 대상 일괄 생성
      const createTargets = Object.entries(mappingActions)
        .filter(([, m]) => m.action === 'create')
        .map(([name]) => ({ name, counterparty_type: 'both' }));

      if (createTargets.length > 0) {
        const res = await settlementApi.batchCreateCounterparties(createTargets);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (res.data as any)?.data ?? res.data;
        enqueueSnackbar(`${data.created_count}개 거래처 생성 완료`, { variant: 'success' });
      }

      // 2) 기존 연결 대상 매핑
      const linkTargets = Object.entries(mappingActions)
        .filter(([, m]) => m.action === 'link' && m.linkedCounterparty);

      for (const [aliasName, m] of linkTargets) {
        await settlementApi.mapUnmatchedCounterparty(aliasName, {
          counterparty_id: m.linkedCounterparty!.id,
        });
      }

      if (linkTargets.length > 0) {
        enqueueSnackbar(`${linkTargets.length}개 거래처 연결 완료`, { variant: 'success' });
      }

      // 3) 파일 다시 preview → 매칭 결과 갱신
      const res = await settlementApi.previewTransactionUpload(file);
      const data = (res.data as unknown as { data: PreviewResult })?.data ?? res.data as unknown as PreviewResult;
      applyPreview(data);

      if (data.unmatched_counterparties.length === 0) {
        enqueueSnackbar('모든 거래처가 매칭되었습니다.', { variant: 'success' });
      }
    } catch {
      enqueueSnackbar('거래처 처리에 실패했습니다.', { variant: 'error' });
    } finally {
      setResolving(false);
    }
  };

  const unresolvedCount = Object.values(mappingActions).filter(
    (m) => m.action === 'link' && !m.linkedCounterparty,
  ).length;
  const canResolve = Object.keys(mappingActions).length > 0 && unresolvedCount === 0;

  // ─── 선택된 트랜잭션 목록 (step 2, 3에서 공용) ────────
  const selectedTxns = preview?.rows
    .filter((_, i) => selectedRows.has(i))
    .filter((r) => r.status === 'ok' && r.counterparty_id) ?? [];

  // ─── Step 2: 최종 확인 요약 계산 ──────────────────────
  const counterpartySummaries: CounterpartySummary[] = (() => {
    const map = new Map<string, CounterpartySummary>();
    selectedTxns.forEach((r) => {
      const key = r.counterparty_name;
      const existing = map.get(key) ?? {
        name: key, depositCount: 0, depositAmount: 0,
        withdrawalCount: 0, withdrawalAmount: 0, totalCount: 0, net: 0,
      };
      if (r.transaction_type === 'deposit') {
        existing.depositCount++;
        existing.depositAmount += r.amount;
      } else {
        existing.withdrawalCount++;
        existing.withdrawalAmount += r.amount;
      }
      existing.totalCount++;
      existing.net = existing.depositAmount - existing.withdrawalAmount;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.totalCount - a.totalCount);
  })();

  const totalDeposit = counterpartySummaries.reduce((s, c) => s + c.depositAmount, 0);
  const totalWithdrawal = counterpartySummaries.reduce((s, c) => s + c.withdrawalAmount, 0);

  // step 1 → step 2 (요약 화면으로 이동)
  const handleGoToSummary = () => {
    if (selectedTxns.length === 0) {
      enqueueSnackbar('등록할 유효한 건이 없습니다.', { variant: 'warning' });
      return;
    }
    setStep(2);
  };

  // step 2 → step 3 (실제 등록)
  const handleConfirm = async () => {
    const txns = selectedTxns.map((r) => ({
      transaction_date: r.transaction_date!,
      counterparty_id: r.counterparty_id!,
      transaction_type: r.transaction_type!,
      amount: r.amount,
      memo: r.description || undefined,
    }));

    setConfirming(true);
    try {
      const res = await settlementApi.confirmTransactionUpload(txns);
      const data = (res.data as unknown as { data: ConfirmResult })?.data ?? res.data as unknown as ConfirmResult;
      setResult(data);
      setStep(3);
      enqueueSnackbar(`${data.created_count}건 등록 완료`, { variant: 'success' });
    } catch {
      enqueueSnackbar('등록에 실패했습니다.', { variant: 'error' });
    } finally {
      setConfirming(false);
    }
  };

  const toggleRow = (idx: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (!preview) return;
    const okIndexes = preview.rows.map((r, i) => r.status === 'ok' ? i : -1).filter((i) => i >= 0);
    const allSelected = okIndexes.every((i) => selectedRows.has(i));
    setSelectedRows(allSelected ? new Set() : new Set(okIndexes));
  };

  const selectedCount = selectedRows.size;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight={700}>입출금 엑셀 업로드</Typography>
        <IconButton size="small" onClick={handleClose}><CloseIcon /></IconButton>
      </DialogTitle>

      <Box sx={{ px: 3, pb: 1 }}>
        <Stepper activeStep={step} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>
      </Box>

      <DialogContent dividers sx={{ minHeight: 400, p: 3 }}>
        {/* ── Step 0: 파일 업로드 ── */}
        {step === 0 && (
          <Box>
            <Box
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: '2px dashed',
                borderColor: dragOver ? 'primary.main' : 'divider',
                borderRadius: 3,
                p: 5,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
                transition: 'all 0.2s',
                '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.02) },
              }}
            >
              {uploading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                    <CircularProgress
                      variant="determinate"
                      value={uploadProgress}
                      size={80}
                      thickness={4}
                      sx={{ color: 'primary.main' }}
                    />
                    <CircularProgress
                      variant="determinate"
                      value={100}
                      size={80}
                      thickness={4}
                      sx={{ color: alpha(theme.palette.primary.main, 0.1), position: 'absolute', left: 0 }}
                    />
                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography variant="h6" fontWeight={700} color="primary.main">
                        {uploadProgress}%
                      </Typography>
                    </Box>
                  </Box>
                  <Typography color="text.secondary" fontWeight={500}>파일을 분석하고 있습니다...</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={uploadProgress}
                    sx={{ width: '60%', borderRadius: 2, height: 6 }}
                  />
                </Box>
              ) : (
                <>
                  <UploadIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    엑셀 파일을 드래그하거나 클릭하여 선택
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    .xlsx, .xls 형식 지원
                  </Typography>
                  {file && (
                    <Chip icon={<FileIcon />} label={file.name} sx={{ mt: 2 }} />
                  )}
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                  e.target.value = '';
                }}
              />
            </Box>

            {/* ── 엑셀 양식 안내 ── */}
            <Alert
              severity="info"
              icon={<InfoIcon />}
              sx={{ mt: 2 }}
            >
              <AlertTitle sx={{ fontWeight: 700 }}>엑셀 양식 안내</AlertTitle>
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  아래 컬럼이 포함된 엑셀 파일을 업로드하세요.
                </Typography>
                <Table size="small" sx={{ bgcolor: 'background.paper', borderRadius: 1, overflow: 'hidden', mb: 1 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, py: 0.5, fontSize: '0.75rem' }}>컬럼명</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.5, fontSize: '0.75rem' }}>필수</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.5, fontSize: '0.75rem' }}>설명</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[
                      { col: '날짜', req: true, desc: '거래일자 (예: 2월 19일, 2025-02-19)' },
                      { col: '구분', req: true, desc: '판매 / 매입 (대체·비용·기타는 건너뜀)' },
                      { col: '거래처', req: true, desc: '거래처명' },
                      { col: '거래내역', req: false, desc: '거래 상세 내역 (메모로 저장)' },
                      { col: '차변(입금)', req: true, desc: '판매 시 사용되는 입금 금액' },
                      { col: '대변(출금)', req: true, desc: '매입 시 사용되는 출금 금액' },
                      { col: '잔액', req: false, desc: '잔액 (참고용)' },
                    ].map((r) => (
                      <TableRow key={r.col}>
                        <TableCell sx={{ py: 0.3, fontSize: '0.75rem', fontWeight: 600 }}>{r.col}</TableCell>
                        <TableCell sx={{ py: 0.3, fontSize: '0.75rem' }}>
                          <Chip label={r.req ? '필수' : '선택'} size="small" color={r.req ? 'primary' : 'default'} variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                        </TableCell>
                        <TableCell sx={{ py: 0.3, fontSize: '0.75rem', color: 'text.secondary' }}>{r.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Typography variant="caption" color="text.secondary">
                  구분이 &apos;판매&apos;이면 차변(입금) 금액을 입금으로, &apos;매입&apos;이면 대변(출금) 금액을 출금으로 처리합니다.
                  대체/비용/기타 구분은 자동으로 건너뜁니다.
                </Typography>
              </Box>
            </Alert>
          </Box>
        )}

        {/* ── Step 1: 미리보기 ── */}
        {step === 1 && preview && (
          <Box>
            {/* 요약 */}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              <Chip label={`전체 ${preview.summary.total}건`} variant="outlined" />
              <Chip icon={<CheckIcon sx={{ fontSize: '16px !important' }} />} label={`유효 ${preview.summary.valid}건`} color="success" variant="outlined" />
              {preview.summary.error > 0 && (
                <Chip icon={<ErrorIcon sx={{ fontSize: '16px !important' }} />} label={`오류 ${preview.summary.error}건`} color="error" variant="outlined" />
              )}
              {preview.summary.unmatched > 0 && (
                <Chip icon={<WarningIcon sx={{ fontSize: '16px !important' }} />} label={`미매칭 ${preview.summary.unmatched}건`} color="warning" variant="outlined" />
              )}
              {preview.summary.skipped > 0 && (
                <Chip icon={<SkipIcon sx={{ fontSize: '16px !important' }} />} label={`건너뜀 ${preview.summary.skipped}건`} variant="outlined" sx={{ color: 'text.secondary', borderColor: 'text.disabled' }} />
              )}
              <Divider orientation="vertical" flexItem />
              <Chip
                icon={<DepositIcon sx={{ fontSize: '14px !important' }} />}
                label={`입금 ${fmt(preview.summary.total_deposit)}`}
                color="info" variant="outlined" size="small"
              />
              <Chip
                icon={<WithdrawalIcon sx={{ fontSize: '14px !important' }} />}
                label={`출금 ${fmt(preview.summary.total_withdrawal)}`}
                color="error" variant="outlined" size="small"
              />
            </Stack>

            {/* ── 미매칭 거래처 인라인 처리 ── */}
            {preview.unmatched_counterparties.length > 0 && (
              <Alert
                severity="warning"
                sx={{ mb: 2 }}
                action={
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    disabled={resolving || !canResolve}
                    onClick={handleResolveUnmatched}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {resolving ? '처리 중...' : '일괄 처리'}
                  </Button>
                }
              >
                <AlertTitle>
                  미매칭 거래처 ({preview.unmatched_counterparties.length}개)
                </AlertTitle>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  아래에서 각 거래처를 신규 등록하거나 기존 거래처에 연결하세요. 처리 후 매칭이 자동 갱신됩니다.
                </Typography>

                <Table size="small" sx={{ bgcolor: 'background.paper', borderRadius: 1, overflow: 'hidden' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, width: '30%' }}>거래처명</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: '25%' }}>처리 방법</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>연결 대상</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.unmatched_counterparties.map((name) => {
                      const mapping = mappingActions[name] ?? { action: 'create' as MappingAction, linkedCounterparty: null };
                      return (
                        <TableRow key={name}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{name}</Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5}>
                              <Tooltip title="이 이름으로 신규 거래처 생성">
                                <Chip
                                  icon={<PersonAddIcon sx={{ fontSize: '14px !important' }} />}
                                  label="신규 등록"
                                  size="small"
                                  color={mapping.action === 'create' ? 'success' : 'default'}
                                  variant={mapping.action === 'create' ? 'filled' : 'outlined'}
                                  onClick={() => updateMapping(name, { action: 'create', linkedCounterparty: null })}
                                  sx={{ cursor: 'pointer' }}
                                />
                              </Tooltip>
                              <Tooltip title="기존 거래처에 별칭으로 연결">
                                <Chip
                                  icon={<LinkIcon sx={{ fontSize: '14px !important' }} />}
                                  label="기존 연결"
                                  size="small"
                                  color={mapping.action === 'link' ? 'info' : 'default'}
                                  variant={mapping.action === 'link' ? 'filled' : 'outlined'}
                                  onClick={() => updateMapping(name, { action: 'link' })}
                                  sx={{ cursor: 'pointer' }}
                                />
                              </Tooltip>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            {mapping.action === 'create' && (
                              <Typography variant="body2" color="success.main" fontWeight={500}>
                                &apos;{name}&apos; 이름으로 신규 생성
                              </Typography>
                            )}
                            {mapping.action === 'link' && (
                              <Autocomplete
                                size="small"
                                options={counterpartyOptions}
                                getOptionLabel={(o) => o.name}
                                value={mapping.linkedCounterparty}
                                onChange={(_, v) => updateMapping(name, { linkedCounterparty: v })}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="거래처 검색..."
                                    variant="outlined"
                                    size="small"
                                    sx={{ minWidth: 200 }}
                                  />
                                )}
                                noOptionsText="거래처 없음"
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Alert>
            )}

            {/* 입금 / 출금 / 차액 요약 */}
            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
              <Box sx={{ flex: 1, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.06), border: '1px solid', borderColor: alpha(theme.palette.info.main, 0.15), textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">입금 합계</Typography>
                <Typography variant="subtitle1" fontWeight={700} color="info.main">
                  {fmt(preview.summary.total_deposit)}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.06), border: '1px solid', borderColor: alpha(theme.palette.error.main, 0.15), textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">출금 합계</Typography>
                <Typography variant="subtitle1" fontWeight={700} color="error.main">
                  {fmt(preview.summary.total_withdrawal)}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.04), border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">차액 (입금 - 출금)</Typography>
                <Typography variant="subtitle1" fontWeight={700} color={
                  preview.summary.total_deposit - preview.summary.total_withdrawal >= 0 ? 'info.main' : 'error.main'
                }>
                  {preview.summary.total_deposit - preview.summary.total_withdrawal >= 0 ? '+' : ''}{fmt(preview.summary.total_deposit - preview.summary.total_withdrawal)}
                </Typography>
              </Box>
            </Stack>

            {/* 테이블 */}
            <TableContainer sx={{ maxHeight: 400, border: '1px solid', borderColor: 'divider', borderRadius: 1, position: 'relative' }}>
              <Table size="small" stickyHeader sx={{ '& tbody tr:last-of-type td': { pb: 5 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={preview.rows.filter((r) => r.status === 'ok').length > 0 &&
                          preview.rows.every((r, i) => r.status !== 'ok' || selectedRows.has(i))}
                        indeterminate={selectedCount > 0 && selectedCount < preview.rows.filter((r) => r.status === 'ok').length}
                        onChange={toggleAll}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>날짜</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>구분</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>거래처</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>거래내역</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>유형</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>금액</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.rows.map((row, idx) => {
                    const isOk = row.status === 'ok';
                    const isError = row.status === 'error';
                    const isUnmatched = row.status === 'unmatched';
                    const isSkipped = row.status === 'skipped';
                    return (
                      <TableRow
                        key={idx}
                        hover={isOk}
                        sx={{
                          bgcolor: isError ? alpha(theme.palette.error.main, 0.04) :
                            isUnmatched ? alpha(theme.palette.warning.main, 0.04) :
                            isSkipped ? alpha(theme.palette.text.primary, 0.03) : 'inherit',
                          opacity: isError || isUnmatched ? 0.7 : isSkipped ? 0.5 : 1,
                          textDecoration: isSkipped ? 'line-through' : 'none',
                        }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={selectedRows.has(idx)}
                            disabled={!isOk}
                            onChange={() => toggleRow(idx)}
                          />
                        </TableCell>
                        <TableCell>{row.row_number}</TableCell>
                        <TableCell>{row.transaction_date || '-'}</TableCell>
                        <TableCell>
                          <Chip
                            label={row.category}
                            size="small"
                            color={row.category === '판매' ? 'info' : row.category === '매입' ? 'error' : 'default'}
                            variant="outlined"
                            sx={{ height: 22, fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.counterparty_name}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.description || '-'}
                        </TableCell>
                        <TableCell>
                          {row.transaction_type ? (
                            <Chip
                              label={row.transaction_type === 'deposit' ? '입금' : '출금'}
                              size="small"
                              color={row.transaction_type === 'deposit' ? 'info' : 'error'}
                              variant="outlined"
                              sx={{ height: 22, fontSize: '0.7rem' }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.disabled">-</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {row.amount > 0 ? fmt(row.amount) : '-'}
                        </TableCell>
                        <TableCell>
                          {isOk && <Chip label="OK" size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />}
                          {isError && (
                            <Tooltip title={row.message || '오류'}>
                              <Chip label={row.message || '오류'} size="small" color="error" sx={{ height: 20, fontSize: '0.65rem', maxWidth: 120 }} />
                            </Tooltip>
                          )}
                          {isUnmatched && (
                            <Chip label="미매칭" size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem' }} />
                          )}
                          {isSkipped && (
                            <Tooltip title={row.message || '건너뜀'}>
                              <Chip label="건너뜀" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', color: 'text.secondary' }} />
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                  <TableRow sx={{ bgcolor: theme.palette.background.paper, boxShadow: '0 -2px 6px rgba(0,0,0,0.08)', '& td': { borderTop: '2px solid', borderTopColor: 'primary.main', fontWeight: 700, fontSize: '0.8rem' } }}>
                    <TableCell />
                    <TableCell />
                    <TableCell colSpan={3}>합계 (판매/매입만)</TableCell>
                    <TableCell />
                    <TableCell>
                      <Chip label="입금" size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', mr: 0.5 }} />
                      {fmt(preview.rows.reduce((s, r) => s + (r.transaction_type === 'deposit' && r.status !== 'skipped' ? r.amount : 0), 0))}
                    </TableCell>
                    <TableCell align="right">
                      <Chip label="출금" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', mr: 0.5 }} />
                      {fmt(preview.rows.reduce((s, r) => s + (r.transaction_type === 'withdrawal' && r.status !== 'skipped' ? r.amount : 0), 0))}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* ── Step 2: 최종 확인 ── */}
        {step === 2 && (
          <Box>
            {/* 전체 요약 카드 */}
            <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
              <Box sx={{ flex: 1, p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.06), border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.15), textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">등록 건수</Typography>
                <Typography variant="h5" fontWeight={800} color="primary.main">{selectedTxns.length}건</Typography>
                <Typography variant="caption" color="text.secondary">{counterpartySummaries.length}개 거래처</Typography>
              </Box>
              <Box sx={{ flex: 1, p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.06), border: '1px solid', borderColor: alpha(theme.palette.info.main, 0.15), textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">입금 합계</Typography>
                <Typography variant="h5" fontWeight={800} color="info.main">{fmt(totalDeposit)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {counterpartySummaries.reduce((s, c) => s + c.depositCount, 0)}건
                </Typography>
              </Box>
              <Box sx={{ flex: 1, p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.06), border: '1px solid', borderColor: alpha(theme.palette.error.main, 0.15), textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">출금 합계</Typography>
                <Typography variant="h5" fontWeight={800} color="error.main">{fmt(totalWithdrawal)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {counterpartySummaries.reduce((s, c) => s + c.withdrawalCount, 0)}건
                </Typography>
              </Box>
              <Box sx={{ flex: 1, p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.04), border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">차액</Typography>
                <Typography variant="h5" fontWeight={800} color={totalDeposit - totalWithdrawal >= 0 ? 'info.main' : 'error.main'}>
                  {totalDeposit - totalWithdrawal >= 0 ? '+' : ''}{fmt(totalDeposit - totalWithdrawal)}
                </Typography>
              </Box>
            </Stack>

            {/* 거래처별 상세 테이블 */}
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>거래처별 요약</Typography>
            <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 320 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>거래처</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>건수</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'info.main' }}>입금</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>출금</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>차액</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {counterpartySummaries.map((cp) => (
                    <TableRow key={cp.name} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{cp.name}</TableCell>
                      <TableCell align="center">
                        <Chip label={`${cp.totalCount}건`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.75rem' }} />
                      </TableCell>
                      <TableCell align="right">
                        {cp.depositCount > 0 ? (
                          <Typography variant="body2" color="info.main" fontWeight={600}>
                            {fmt(cp.depositAmount)} <Typography component="span" variant="caption" color="text.secondary">({cp.depositCount}건)</Typography>
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.disabled">-</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {cp.withdrawalCount > 0 ? (
                          <Typography variant="body2" color="error.main" fontWeight={600}>
                            {fmt(cp.withdrawalAmount)} <Typography component="span" variant="caption" color="text.secondary">({cp.withdrawalCount}건)</Typography>
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.disabled">-</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} color={cp.net >= 0 ? 'info.main' : 'error.main'}>
                          {cp.net >= 0 ? '+' : ''}{fmt(cp.net)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                  <TableRow sx={{ bgcolor: theme.palette.background.paper, boxShadow: '0 -2px 6px rgba(0,0,0,0.08)', '& td': { borderTop: '2px solid', borderTopColor: 'primary.main', fontWeight: 700 } }}>
                    <TableCell sx={{ fontWeight: 700 }}>합계</TableCell>
                    <TableCell align="center">
                      <Chip label={`${selectedTxns.length}건`} size="small" color="primary" variant="outlined" sx={{ height: 22, fontSize: '0.75rem' }} />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="info.main" fontWeight={700}>{fmt(totalDeposit)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="error.main" fontWeight={700}>{fmt(totalWithdrawal)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700} color={totalDeposit - totalWithdrawal >= 0 ? 'info.main' : 'error.main'}>
                        {totalDeposit - totalWithdrawal >= 0 ? '+' : ''}{fmt(totalDeposit - totalWithdrawal)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* ── Step 3: 완료 ── */}
        {step === 3 && result && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>등록 완료</Typography>
            <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 3 }}>
              <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.06), minWidth: 120 }}>
                <Typography variant="h4" fontWeight={800} color="success.main">{result.created_count}</Typography>
                <Typography variant="caption" color="text.secondary">생성</Typography>
              </Box>
              {result.skipped_count > 0 && (
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.warning.main, 0.06), minWidth: 120 }}>
                  <Typography variant="h4" fontWeight={800} color="warning.main">{result.skipped_count}</Typography>
                  <Typography variant="caption" color="text.secondary">건너뜀 (중복)</Typography>
                </Box>
              )}
              {result.errors.length > 0 && (
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.06), minWidth: 120 }}>
                  <Typography variant="h4" fontWeight={800} color="error.main">{result.errors.length}</Typography>
                  <Typography variant="caption" color="text.secondary">오류</Typography>
                </Box>
              )}
            </Stack>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {step === 0 && (
          <Button onClick={handleClose}>취소</Button>
        )}
        {step === 1 && (
          <>
            <Button onClick={() => { reset(); }} color="inherit">다시 선택</Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={handleClose} color="inherit">취소</Button>
            <Button
              variant="contained"
              onClick={handleGoToSummary}
              disabled={selectedCount === 0}
            >
              {`${selectedCount}건 등록`}
            </Button>
          </>
        )}
        {step === 2 && (
          <>
            <Button onClick={() => setStep(1)} color="inherit">이전</Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={handleClose} color="inherit">취소</Button>
            <Button
              variant="contained"
              color="success"
              onClick={handleConfirm}
              disabled={confirming}
              size="large"
            >
              {confirming ? '등록 중...' : `${selectedTxns.length}건 최종 등록`}
            </Button>
          </>
        )}
        {step === 3 && (
          <Button variant="contained" onClick={handleClose}>닫기</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
