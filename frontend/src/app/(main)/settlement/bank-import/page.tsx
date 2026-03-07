'use client';

/**
 * 은행 임포트 위자드 (통합)
 *
 * Step 1: 법인 선택 + 파일 업로드
 * Step 2: 자동매칭 결과 검수 + 수동 매핑
 * Step 3: 확정 결과 확인
 *
 * 하단: 이전 작업 내역 테이블
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box, Typography, Paper, Button, Stack, Alert, AlertTitle, LinearProgress,
  alpha, useTheme, Stepper, Step, StepLabel,
  Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Divider, Tooltip, IconButton, Collapse,
  FormControl, Select, MenuItem, InputLabel, Autocomplete, TextField,
  InputAdornment, Tabs, Tab,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircle as CheckCircleIcon,
  AccountBalanceWallet as BankImportIcon,
  AutoFixHigh as AutoMatchIcon,
  Verified as ConfirmIcon,
  InsertDriveFile as FileIcon,
  Edit as EditIcon,
  Block as ExcludeIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Business as EntityIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Replay as RetryIcon,
  Download as DownloadIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import StepConnector, { stepConnectorClasses } from '@mui/material/StepConnector';
import { StepIconProps } from '@mui/material/StepIcon';
import { styled } from '@mui/material/styles';
import Avatar from '@mui/material/Avatar';
import { settlementApi, getErrorMessage } from '@/lib/api';
import { downloadSampleTemplate } from '@/lib/excel-export';
import { useSnackbar } from 'notistack';
import {
  AppPageContainer,
  AppPageHeader,
  AppTableShell,
} from '@/components/ui';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// ─── 타입 ──────────────────────────────────────────────────────────

interface ImportLine {
  id: string;
  line_number: number;
  transaction_date: string;
  description: string;
  amount: number;
  balance_after: number | null;
  counterparty_name_raw: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  status: string;
  bank_reference: string | null;
  match_confidence: number | null;
  transaction_id: string | null;
  sender_receiver: string | null;
  additional_memo: string | null;
  transaction_type_raw: string | null;
  bank_branch: string | null;
  special_notes: string | null;
}

interface ImportJobDetail {
  id: string;
  original_filename: string;
  corporate_entity_id: string | null;
  corporate_entity_name: string | null;
  bank_name: string;
  account_number: string;
  import_date_from: string | null;
  import_date_to: string | null;
  status: string;
  total_lines: number;
  matched_lines: number;
  confirmed_lines: number;
  error_message: string | null;
  created_by_name: string;
  created_at: string;
  confirmed_at: string | null;
  lines: ImportLine[];
}

interface ImportJobRow {
  id: string;
  original_filename: string;
  corporate_entity_id: string | null;
  corporate_entity_name: string | null;
  bank_name: string;
  account_number: string;
  import_date_from: string | null;
  import_date_to: string | null;
  status: string;
  total_lines: number;
  matched_lines: number;
  confirmed_lines: number;
  error_message: string | null;
  created_by_name: string;
  created_at: string;
  confirmed_at: string | null;
}

interface CorporateEntityOption {
  id: string;
  name: string;
}

interface CounterpartyOption {
  id: string;
  name: string;
}

// ─── 상수 ──────────────────────────────────────────────────────────

const STEPS = ['법인 선택 · 업로드', '검수 · 매칭', '확정'];

const formatAmount = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

/** API Decimal → number 변환 (Pydantic Decimal은 JSON 문자열로 직렬화됨) */
function normalizeLines(lines: ImportLine[]): ImportLine[] {
  return lines.map(l => ({
    ...l,
    amount: typeof l.amount === 'string' ? parseFloat(l.amount) : (l.amount ?? 0),
    balance_after: l.balance_after != null ? (typeof l.balance_after === 'string' ? parseFloat(l.balance_after as unknown as string) : l.balance_after) : null,
    match_confidence: l.match_confidence != null ? (typeof l.match_confidence === 'string' ? parseFloat(l.match_confidence as unknown as string) : l.match_confidence) : null,
  }));
}

const STATUS_MAP: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  uploaded: { label: '업로드됨', color: 'default' },
  parsed: { label: '파싱완료', color: 'info' },
  reviewing: { label: '검수중', color: 'warning' },
  confirmed: { label: '확정', color: 'success' },
  failed: { label: '실패', color: 'error' },
};

const LINE_STATUS_MAP: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  unmatched: { label: '미매칭', color: 'error' },
  matched: { label: '매칭됨', color: 'info' },
  confirmed: { label: '확정', color: 'success' },
  duplicate: { label: '중복', color: 'warning' },
  excluded: { label: '제외', color: 'default' },
};

// ─── 스테퍼 스타일 ──────────────────────────────────────────────────

const WizardConnector = styled(StepConnector)(({ theme }) => ({
  [`&.${stepConnectorClasses.alternativeLabel}`]: { top: 22 },
  [`&.${stepConnectorClasses.active}`]: {
    [`& .${stepConnectorClasses.line}`]: {
      background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.info.main})`,
    },
  },
  [`&.${stepConnectorClasses.completed}`]: {
    [`& .${stepConnectorClasses.line}`]: {
      background: `linear-gradient(90deg, ${theme.palette.success.main}, ${theme.palette.success.light})`,
    },
  },
  [`& .${stepConnectorClasses.line}`]: {
    height: 3,
    border: 0,
    backgroundColor: theme.palette.divider,
    borderRadius: 1,
  },
}));

function WizardStepIcon(props: StepIconProps) {
  const { active, completed, icon } = props;
  const theme = useTheme();
  const icons: Record<string, React.ReactElement> = {
    1: <UploadIcon />,
    2: <AutoMatchIcon />,
    3: <ConfirmIcon />,
  };
  const bg = completed
    ? `linear-gradient(135deg, ${theme.palette.success.main}, ${theme.palette.success.light})`
    : active
      ? `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.info.main})`
      : theme.palette.action.disabledBackground;

  return (
    <Avatar
      sx={{
        width: 44, height: 44, background: bg,
        color: completed || active ? '#fff' : theme.palette.text.disabled,
        boxShadow: active ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.4)}` : 'none',
      }}
    >
      {completed ? <CheckCircleIcon /> : icons[String(icon)]}
    </Avatar>
  );
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────

export default function BankImportPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 위자드
  const [activeStep, setActiveStep] = useState(0);
  const [currentJob, setCurrentJob] = useState<ImportJobDetail | null>(null);

  // Step 1: 법인 + 업로드
  const [corporateEntities, setCorporateEntities] = useState<CorporateEntityOption[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Step 2: 검수
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editCpId, setEditCpId] = useState('');
  const [matching, setMatching] = useState(false);
  const [lineFilter, setLineFilter] = useState<'all' | 'unmatched' | 'matched' | 'duplicate' | 'excluded'>('all');

  // Step 3: 확정
  const [confirming, setConfirming] = useState(false);

  // ConfirmDialog 상태
  const [confirmAction, setConfirmAction] = useState<{ type: string; id?: string } | null>(null);

  // 이전 작업 내역
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyJobs, setHistoryJobs] = useState<ImportJobRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ─── 초기 데이터 로드 ──────────────────────────────────────────

  const loadCorporateEntities = useCallback(async () => {
    try {
      const res = await settlementApi.listCorporateEntities({ page_size: 100, is_active: true });
      const data = res.data as unknown as { corporate_entities: CorporateEntityOption[] };
      setCorporateEntities(data.corporate_entities || []);
    } catch { /* ignore */ }
  }, []);

  const loadCounterparties = useCallback(async () => {
    try {
      const res = await settlementApi.listCounterparties({ page_size: 200 });
      const data = res.data as unknown as { counterparties: CounterpartyOption[] };
      setCounterparties(data.counterparties || []);
    } catch { /* ignore */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await settlementApi.listBankImportJobs({
        page: historyPage + 1,
        page_size: 10,
      });
      const data = res.data as unknown as { jobs: ImportJobRow[]; total: number };
      setHistoryJobs(data.jobs || []);
      setHistoryTotal(data.total || 0);
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  }, [historyPage]);

  useEffect(() => { loadCorporateEntities(); loadCounterparties(); }, [loadCorporateEntities, loadCounterparties]);
  useEffect(() => { if (historyOpen) loadHistory(); }, [historyOpen, loadHistory]);

  // URL ?job=xxx 파라미터로 기존 작업 자동 로드
  useEffect(() => {
    const jobId = searchParams.get('job');
    if (jobId && !currentJob) {
      handleLoadJob(jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ─── Step 1: 업로드 ──────────────────────────────────────────

  const handleUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xlsx', 'xls'].includes(ext)) {
      enqueueSnackbar('Excel(.xlsx, .xls) 파일만 업로드 가능합니다.', { variant: 'warning' });
      return;
    }
    if (!selectedEntityId) {
      enqueueSnackbar('법인을 먼저 선택해 주세요.', { variant: 'warning' });
      return;
    }

    setUploading(true);
    try {
      const res = await settlementApi.uploadBankFile(file, selectedEntityId);
      const job = res.data as unknown as ImportJobDetail;
      job.lines = normalizeLines(job.lines || []);
      setCurrentJob(job);

      if (job.status === 'failed') {
        enqueueSnackbar(job.error_message || '파일 파싱에 실패했습니다.', { variant: 'error' });
        return;
      }

      enqueueSnackbar(`${file.name} 업로드 및 자동매칭 완료 (${job.matched_lines}/${job.total_lines}건 매칭)`, { variant: 'success' });
      setActiveStep(1);
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, '파일 업로드에 실패했습니다.'), { variant: 'error', autoHideDuration: 8000 });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  // ─── Step 2: 검수 ──────────────────────────────────────────────

  const handleAutoMatch = async () => {
    if (!currentJob) return;
    setMatching(true);
    try {
      const res = await settlementApi.autoMatchBankImport(currentJob.id);
      const updated = res.data as unknown as ImportJobDetail;
      updated.lines = normalizeLines(updated.lines || []);
      setCurrentJob(updated);
      enqueueSnackbar(`자동 매칭 완료 (${updated.matched_lines}건)`, { variant: 'success' });
    } catch {
      enqueueSnackbar('자동 매칭에 실패했습니다.', { variant: 'error' });
    } finally {
      setMatching(false);
    }
  };

  const handleSaveLineMapping = async (lineId: string) => {
    if (!currentJob) return;
    try {
      const res = await settlementApi.updateBankImportLine(currentJob.id, lineId, {
        counterparty_id: editCpId || null,
        status: editCpId ? 'matched' : 'unmatched',
      });
      const updatedLine = normalizeLines([res.data as unknown as ImportLine])[0];
      setCurrentJob(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: prev.lines.map(l => l.id === lineId ? updatedLine : l),
          matched_lines: prev.lines.filter(l => l.id === lineId ? updatedLine.status === 'matched' : l.status === 'matched').length,
        };
      });
      setEditingLineId(null);
      setEditCpId('');
      enqueueSnackbar('거래처 매핑 완료', { variant: 'success' });
    } catch {
      enqueueSnackbar('매핑 업데이트에 실패했습니다.', { variant: 'error' });
    }
  };

  const handleExcludeLine = async (lineId: string) => {
    if (!currentJob) return;
    try {
      const res = await settlementApi.updateBankImportLine(currentJob.id, lineId, { status: 'excluded' });
      const updatedLine = normalizeLines([res.data as unknown as ImportLine])[0];
      setCurrentJob(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: prev.lines.map(l => l.id === lineId ? updatedLine : l),
        };
      });
      enqueueSnackbar('라인 제외 처리 완료', { variant: 'success' });
    } catch {
      enqueueSnackbar('제외 처리에 실패했습니다.', { variant: 'error' });
    }
  };

  // ─── Step 3: 확정 ──────────────────────────────────────────────

  const handleConfirm = () => {
    if (!currentJob) return;
    setConfirmAction({ type: 'bank-confirm', id: currentJob.id });
  };

  const executeConfirm = async () => {
    if (!currentJob) return;
    setConfirming(true);
    try {
      const res = await settlementApi.confirmBankImport(currentJob.id);
      const updated = res.data as unknown as ImportJobDetail;
      updated.lines = normalizeLines(updated.lines || []);
      setCurrentJob(updated);
      setActiveStep(2);
      enqueueSnackbar(`확정 완료 — ${updated.confirmed_lines}건 입출금 생성`, { variant: 'success' });
    } catch {
      enqueueSnackbar('확정에 실패했습니다.', { variant: 'error' });
    } finally {
      setConfirming(false);
      setConfirmAction(null);
    }
  };

  // ─── 위자드 리셋 ──────────────────────────────────────────────

  const handleReset = () => {
    setActiveStep(0);
    setCurrentJob(null);
    setEditingLineId(null);
    setEditCpId('');
    setLineFilter('all');
    if (historyOpen) loadHistory();
  };

  // ─── 이전 작업 불러오기 ──────────────────────────────────────

  const handleLoadJob = async (jobId: string) => {
    try {
      const res = await settlementApi.getBankImportJob(jobId);
      const job = res.data as unknown as ImportJobDetail;
      job.lines = normalizeLines(job.lines || []);
      setCurrentJob(job);
      if (job.status === 'confirmed') {
        setActiveStep(2);
      } else {
        setActiveStep(1);
      }
      setHistoryOpen(false);
    } catch {
      enqueueSnackbar('작업 상세 조회에 실패했습니다.', { variant: 'error' });
    }
  };

  const handleDeleteJob = (jobId: string) => {
    setConfirmAction({ type: 'delete-job', id: jobId });
  };

  const executeDeleteJob = async (jobId: string) => {
    try {
      await settlementApi.deleteBankImportJob(jobId);
      enqueueSnackbar('작업 삭제 완료', { variant: 'success' });
      loadHistory();
    } catch {
      enqueueSnackbar('삭제에 실패했습니다.', { variant: 'error' });
    } finally {
      setConfirmAction(null);
    }
  };

  // ─── 라인 통계 ──────────────────────────────────────────────────

  const lines = currentJob?.lines || [];
  const stats = useMemo(() => {
    const unmatchedCount = lines.filter(l => l.status === 'unmatched').length;
    const matchedCount = lines.filter(l => l.status === 'matched').length;
    const confirmedCount = lines.filter(l => l.status === 'confirmed').length;
    const duplicateCount = lines.filter(l => l.status === 'duplicate').length;
    const excludedCount = lines.filter(l => l.status === 'excluded').length;
    const totalDeposit = lines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const totalWithdrawal = lines.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);
    return { unmatchedCount, matchedCount, confirmedCount, duplicateCount, excludedCount, totalDeposit, totalWithdrawal };
  }, [lines]);

  const filteredLines = useMemo(() => {
    if (lineFilter === 'all') return lines;
    return lines.filter(l => l.status === lineFilter);
  }, [lines, lineFilter]);

  const canConfirm = currentJob?.status !== 'confirmed' && stats.matchedCount > 0;

  // ─── 렌더 ──────────────────────────────────────────────────────

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<BankImportIcon />}
        title="은행 임포트"
        description="은행 거래내역 파일을 업로드하여 입출금을 일괄 등록"
        color="info"
      />

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* 스테퍼 */}
      <Stepper
        alternativeLabel
        activeStep={activeStep}
        connector={<WizardConnector />}
        sx={{ mb: 3 }}
      >
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel StepIconComponent={WizardStepIcon}>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* ── Step 0: 법인 선택 + 업로드 ── */}
      {activeStep === 0 && (<>
        <Paper
          variant="outlined"
          sx={{
            p: 4,
            textAlign: 'center',
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: dragOver ? 'primary.main' : 'divider',
            bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
            transition: 'all 0.2s',
          }}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
        >
          <Stack spacing={3} alignItems="center">
            <Avatar sx={{ width: 64, height: 64, bgcolor: alpha(theme.palette.info.main, 0.12) }}>
              <UploadIcon sx={{ fontSize: 32, color: 'info.main' }} />
            </Avatar>

            <Typography variant="h6" fontWeight={600}>
              은행 거래내역 파일 업로드
            </Typography>
            <Typography variant="body2" color="text.secondary">
              법인을 선택한 뒤, 거래내역조회 Excel 파일을 드래그하거나 클릭하여 업로드하세요.
              <br />
              업로드 즉시 파싱 + 거래처 자동매칭이 수행됩니다.
            </Typography>

            {/* 법인 선택 */}
            <FormControl size="small" sx={{ minWidth: 280 }}>
              <InputLabel>법인 선택</InputLabel>
              <Select
                value={selectedEntityId}
                label="법인 선택"
                onChange={(e) => setSelectedEntityId(e.target.value)}
              >
                <MenuItem value=""><em>선택 안함</em></MenuItem>
                {corporateEntities.map((ce) => (
                  <MenuItem key={ce.id} value={ce.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EntityIcon fontSize="small" color="action" />
                      {ce.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 업로드 버튼 */}
            <Button
              variant="contained"
              size="large"
              startIcon={uploading ? undefined : <UploadIcon />}
              disabled={!selectedEntityId || uploading}
              onClick={() => fileInputRef.current?.click()}
              sx={{ px: 4 }}
            >
              {uploading ? '업로드 + 매칭 처리 중...' : 'Excel 파일 선택'}
            </Button>
            {uploading && <LinearProgress sx={{ width: '60%' }} />}

            <Typography variant="caption" color="text.disabled">
              지원 형식: .xlsx, .xls (거래내역조회 양식)
            </Typography>
          </Stack>
        </Paper>

        {/* ── 양식 안내 가이드 ── */}
        <Alert
          severity="info"
          icon={<InfoIcon />}
          sx={{ mt: 2 }}
          action={
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => {
                downloadSampleTemplate({
                  filename: '은행임포트_양식',
                  sheetName: '거래내역',
                  columns: [
                    { header: '거래일시', width: 20 },
                    { header: '적요', width: 20 },
                    { header: '의뢰인/수취인', width: 18 },
                    { header: '입금', width: 14 },
                    { header: '출금', width: 14 },
                    { header: '거래후잔액', width: 14 },
                    { header: '구분', width: 10 },
                    { header: '거래점', width: 12 },
                  ],
                  sampleRows: [
                    ['2025-03-01 09:30:00', '전신환', 'ABC무역', 1500000, null, 15500000, '입금', '본점'],
                    ['2025-03-01 14:00:00', '타행이체', 'GHI부품', null, 800000, 14700000, '출금', '본점'],
                    ['2025-03-02 10:15:00', '전자결제', 'DEF전자', 2000000, null, 16700000, '입금', '본점'],
                  ],
                });
              }}
              sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}
            >
              양식 다운로드
            </Button>
          }
        >
          <AlertTitle sx={{ fontWeight: 700 }}>엑셀 양식 안내</AlertTitle>
          <Box sx={{ mt: 0.5 }}>
            <Table size="small" sx={{ bgcolor: 'background.paper', borderRadius: 1, overflow: 'hidden', mb: 1.5 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, py: 0.5, fontSize: '0.75rem' }}>컬럼명</TableCell>
                  <TableCell sx={{ fontWeight: 700, py: 0.5, fontSize: '0.75rem' }}>필수</TableCell>
                  <TableCell sx={{ fontWeight: 700, py: 0.5, fontSize: '0.75rem' }}>설명</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  { col: '거래일시', req: true, desc: '거래 일시 (예: 2025-03-01 09:30:00)' },
                  { col: '적요', req: true, desc: '거래 적요 (전신환, 타행이체 등)' },
                  { col: '입금', req: true, desc: '입금 금액' },
                  { col: '출금', req: true, desc: '출금 금액' },
                  { col: '거래후잔액', req: true, desc: '거래 후 잔액' },
                  { col: '의뢰인/수취인', req: false, desc: '거래처 자동 매칭에 사용' },
                  { col: '구분', req: false, desc: '거래 구분 (참고용)' },
                  { col: '거래점', req: false, desc: '거래 지점 (참고용)' },
                  { col: '추가메모', req: false, desc: '추가 메모 (참고용)' },
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
            <Stack spacing={0.3}>
              <Typography variant="caption" color="text.secondary">
                • &apos;의뢰인/수취인&apos; 컬럼이 있으면 거래처 자동 매칭에 활용됩니다.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                • 헤더 행이 1행이 아니어도 자동으로 감지합니다. (최대 15행까지 탐색)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                • 대부분의 은행 &apos;거래내역조회&apos; 엑셀 양식을 그대로 사용 가능합니다.
              </Typography>
            </Stack>
          </Box>
        </Alert>
      </>)}

      {/* ── Step 1: 검수 · 매칭 ── */}
      {activeStep === 1 && currentJob && (
        <Stack spacing={2}>
          {/* 요약 바 */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">파일</Typography>
                  <Typography fontWeight={600} variant="body2">{currentJob.original_filename}</Typography>
                </Box>
                {currentJob.corporate_entity_name && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">법인</Typography>
                    <Typography fontWeight={600} variant="body2">{currentJob.corporate_entity_name}</Typography>
                  </Box>
                )}
                {currentJob.import_date_from && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">기간</Typography>
                    <Typography fontWeight={600} variant="body2">{currentJob.import_date_from} ~ {currentJob.import_date_to}</Typography>
                  </Box>
                )}
                <Divider orientation="vertical" flexItem />
                <Box>
                  <Typography variant="caption" color="text.secondary">전체</Typography>
                  <Typography fontWeight={700}>{currentJob.total_lines}건</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">매칭됨</Typography>
                  <Typography fontWeight={600} color="info.main">{stats.matchedCount}건</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">미매칭</Typography>
                  <Typography fontWeight={600} color="error.main">{stats.unmatchedCount}건</Typography>
                </Box>
                {stats.duplicateCount > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">중복</Typography>
                    <Typography fontWeight={600} color="warning.main">{stats.duplicateCount}건</Typography>
                  </Box>
                )}
                {stats.excludedCount > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">제외</Typography>
                    <Typography fontWeight={600} color="text.disabled">{stats.excludedCount}건</Typography>
                  </Box>
                )}
                <Divider orientation="vertical" flexItem />
                <Box>
                  <Typography variant="caption" color="text.secondary">입금합계</Typography>
                  <Typography fontWeight={600} color="info.main">{formatAmount(stats.totalDeposit)}원</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">출금합계</Typography>
                  <Typography fontWeight={600} color="secondary.main">{formatAmount(stats.totalWithdrawal)}원</Typography>
                </Box>
              </Box>
            </Box>
          </Paper>

          {/* 안내/경고 */}
          {stats.unmatchedCount > 0 && (
            <Alert severity="warning" variant="outlined">
              <AlertTitle>미매칭 {stats.unmatchedCount}건 확인 필요</AlertTitle>
              자동매칭되지 않은 라인의 거래처를 수동으로 매핑하거나, 불필요한 라인은 제외 처리하세요.
            </Alert>
          )}
          {stats.unmatchedCount === 0 && stats.matchedCount > 0 && (
            <Alert severity="success" variant="outlined">
              모든 라인이 매칭되었습니다. 확정 버튼을 눌러 입출금을 생성하세요.
            </Alert>
          )}

          {/* 필터 + 액션 버튼 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Tabs
              value={lineFilter}
              onChange={(_, v) => setLineFilter(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
            >
              <Tab label={`전체 (${lines.length})`} value="all" />
              <Tab label={`미매칭 (${stats.unmatchedCount})`} value="unmatched" />
              <Tab label={`매칭됨 (${stats.matchedCount})`} value="matched" />
              {stats.duplicateCount > 0 && <Tab label={`중복 (${stats.duplicateCount})`} value="duplicate" />}
              {stats.excludedCount > 0 && <Tab label={`제외 (${stats.excludedCount})`} value="excluded" />}
            </Tabs>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AutoMatchIcon />}
                disabled={matching || stats.unmatchedCount === 0}
                onClick={handleAutoMatch}
              >
                {matching ? '매칭 중...' : '재매칭'}
              </Button>
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<ConfirmIcon />}
                disabled={!canConfirm || confirming}
                onClick={handleConfirm}
              >
                {confirming ? '확정 중...' : `확정 (${stats.matchedCount}건)`}
              </Button>
            </Box>
          </Box>

          {/* 라인 테이블 */}
          <AppTableShell
            loading={false}
            isEmpty={filteredLines.length === 0}
            emptyMessage="해당 상태의 라인이 없습니다."
            hidePagination
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 50 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>거래일</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>적요</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>의뢰인/수취인</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>금액</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>구분</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>매칭 거래처</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>상태</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>액션</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredLines.map((line) => {
                  const lineStatus = LINE_STATUS_MAP[line.status] || { label: line.status, color: 'default' as const };
                  const isDeposit = line.amount > 0;
                  const isEditing = editingLineId === line.id;
                  const isExcluded = line.status === 'excluded';
                  const isConfirmed = line.status === 'confirmed';

                  return (
                    <TableRow
                      key={line.id}
                      hover
                      sx={{
                        opacity: isExcluded ? 0.4 : 1,
                        bgcolor: line.status === 'duplicate' ? alpha(theme.palette.warning.main, 0.04) : undefined,
                      }}
                    >
                      <TableCell>{line.line_number}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{line.transaction_date}</TableCell>
                      <TableCell>
                        <Tooltip title={[line.additional_memo, line.special_notes].filter(Boolean).join(' | ')} arrow>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 160, cursor: (line.additional_memo || line.special_notes) ? 'help' : 'default' }}>
                            {line.description}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 120 }}>
                          {line.sender_receiver || line.counterparty_name_raw || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, color: isDeposit ? 'info.main' : 'secondary.main', whiteSpace: 'nowrap' }}
                        >
                          {isDeposit ? '+' : ''}{formatAmount(line.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 80 }}>
                          {line.transaction_type_raw || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                            <Autocomplete
                              size="small"
                              sx={{ minWidth: 180 }}
                              options={counterparties}
                              getOptionLabel={(o) => o.name}
                              value={counterparties.find(c => c.id === editCpId) || null}
                              onChange={(_, v) => setEditCpId(v?.id || '')}
                              renderInput={(params) => <TextField {...params} placeholder="거래처 검색" />}
                            />
                            <Button size="small" variant="contained" onClick={() => handleSaveLineMapping(line.id)}>
                              저장
                            </Button>
                            <Button size="small" onClick={() => { setEditingLineId(null); setEditCpId(''); }}>
                              취소
                            </Button>
                          </Box>
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" fontWeight={line.counterparty_name ? 500 : 400}>
                              {line.counterparty_name || '-'}
                            </Typography>
                            {line.match_confidence != null && line.match_confidence < 100 && (
                              <Typography variant="caption" color="warning.main">
                                ({Math.round(line.match_confidence)}%)
                              </Typography>
                            )}
                          </Box>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={lineStatus.label} color={lineStatus.color} size="small" />
                      </TableCell>
                      <TableCell align="center">
                        {!isConfirmed && !isExcluded && (
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <Tooltip title="거래처 매핑">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => { setEditingLineId(line.id); setEditCpId(line.counterparty_id || ''); }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="제외">
                              <IconButton
                                size="small"
                                color="default"
                                onClick={() => handleExcludeLine(line.id)}
                              >
                                <ExcludeIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </AppTableShell>
        </Stack>
      )}

      {/* ── Step 2: 확정 결과 ── */}
      {activeStep === 2 && currentJob && (
        <Stack spacing={3} alignItems="center" sx={{ py: 4 }}>
          <Avatar sx={{ width: 72, height: 72, bgcolor: alpha(theme.palette.success.main, 0.12) }}>
            <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main' }} />
          </Avatar>
          <Typography variant="h5" fontWeight={700}>확정 완료</Typography>
          <Typography variant="body1" color="text.secondary">
            은행 거래내역이 입출금 트랜잭션으로 등록되었습니다.
          </Typography>

          <Paper variant="outlined" sx={{ p: 3, minWidth: 400 }}>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">파일명</Typography>
                <Typography fontWeight={600}>{currentJob.original_filename}</Typography>
              </Box>
              {currentJob.corporate_entity_name && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography color="text.secondary">법인</Typography>
                  <Typography fontWeight={600}>{currentJob.corporate_entity_name}</Typography>
                </Box>
              )}
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">전체 라인</Typography>
                <Typography fontWeight={600}>{currentJob.total_lines}건</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">확정(입출금 생성)</Typography>
                <Typography fontWeight={700} color="success.main">{currentJob.confirmed_lines}건</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">입금 합계</Typography>
                <Typography fontWeight={600} color="info.main">{formatAmount(stats.totalDeposit)}원</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">출금 합계</Typography>
                <Typography fontWeight={600} color="secondary.main">{formatAmount(stats.totalWithdrawal)}원</Typography>
              </Box>
            </Stack>
          </Paper>

          <Button
            variant="contained"
            size="large"
            startIcon={<RetryIcon />}
            onClick={handleReset}
            sx={{ mt: 2 }}
          >
            새 파일 업로드
          </Button>
        </Stack>
      )}

      {/* ── 이전 작업 내역 ── */}
      <Divider sx={{ mt: 4 }} />
      <Box
        onClick={() => setHistoryOpen(!historyOpen)}
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          py: 1.5, cursor: 'pointer', userSelect: 'none',
        }}
      >
        <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
          이전 작업 내역 ({historyTotal}건)
        </Typography>
        {historyOpen ? <ExpandLessIcon color="action" /> : <ExpandMoreIcon color="action" />}
      </Box>

      <Collapse in={historyOpen}>
        <AppTableShell
          loading={historyLoading}
          isEmpty={historyJobs.length === 0}
          emptyMessage="이전 작업 내역이 없습니다."
          page={historyPage}
          rowsPerPage={10}
          count={historyTotal}
          onPageChange={(_, p) => setHistoryPage(p)}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>파일명</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>법인</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>기간</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>상태</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>전체</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>매칭</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>확정</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>생성일</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>액션</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {historyJobs.map((job) => {
                const statusInfo = STATUS_MAP[job.status] || { label: job.status, color: 'default' as const };
                return (
                  <TableRow key={job.id} hover>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, fontWeight: 500 }}
                        onClick={() => handleLoadJob(job.id)}
                      >
                        {job.original_filename}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {job.corporate_entity_name || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {job.import_date_from && job.import_date_to
                        ? `${job.import_date_from} ~ ${job.import_date_to}`
                        : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={statusInfo.label} color={statusInfo.color} size="small" />
                    </TableCell>
                    <TableCell align="center">{job.total_lines}</TableCell>
                    <TableCell align="center">{job.matched_lines}</TableCell>
                    <TableCell align="center">{job.confirmed_lines}</TableCell>
                    <TableCell>
                      {new Date(job.created_at).toLocaleDateString('ko-KR')}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="불러오기">
                          <IconButton size="small" color="primary" onClick={() => handleLoadJob(job.id)}>
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {job.status !== 'confirmed' && (
                          <Tooltip title="삭제">
                            <IconButton size="small" color="error" onClick={() => handleDeleteJob(job.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AppTableShell>
      </Collapse>

      {/* ── 확인 다이얼로그 ── */}
      <ConfirmDialog
        open={confirmAction?.type === 'bank-confirm'}
        title="은행 임포트 확정"
        message="매칭 완료된 라인을 확정하시겠습니까? 확정 후 입출금 트랜잭션이 자동 생성됩니다."
        confirmLabel="확정"
        confirmColor="warning"
        loading={confirming}
        onConfirm={executeConfirm}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'delete-job'}
        title="임포트 작업 삭제"
        message="이 임포트 작업을 삭제하시겠습니까?"
        confirmLabel="삭제"
        confirmColor="error"
        onConfirm={() => {
          if (confirmAction?.id) executeDeleteJob(confirmAction.id);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </AppPageContainer>
  );
}
