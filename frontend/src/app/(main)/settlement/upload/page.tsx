'use client';

/**
 * UPM 전표 업로드 위자드 (통합)
 * 
 * Step 1: 타입 선택 + 파일 업로드 + 미리보기 검증
 * Step 2: 미매칭 거래처 처리
 * Step 3: 변경 감지/승인 (conflict 행)
 * Step 4: 최종 결과 확인 + 업로드 확정
 * 
 * 하단: 이전 작업 내역 탭
 */

import { useState, useRef, useCallback, useMemo, useEffect, DragEvent } from 'react';
import {
  Box, Typography, Paper, Button, Stack, Alert, AlertTitle, LinearProgress,
  alpha, useTheme, Stepper, Step, StepLabel, ToggleButton, ToggleButtonGroup,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
  Chip, Divider, Tooltip, IconButton, Fade, Collapse, Checkbox,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
  Tabs, Tab, Autocomplete, TextField, FormControl, Select, MenuItem,
  TablePagination, InputAdornment,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  CheckCircle as CheckCircleIcon,
  Description as DescriptionIcon,
  Preview as PreviewIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  RemoveCircleOutline as ExcludedIcon,
  Refresh as RefreshIcon,
  FileUpload as FileUploadIcon,
  FilterList as FilterIcon,
  Info as InfoIcon,
  History as HistoryIcon,
  InsertDriveFile as FileIcon,
  TaskAlt as TaskAltIcon,
  Verified as VerifiedIcon,
  ShoppingCart as SalesIcon,
  Store as PurchaseIcon,
  PersonAdd as PersonAddIcon,
  Link as LinkIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  PlaylistAddCheck as BatchIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  FiberNew as NewIcon,
  LinkOff as UnmatchedIcon,
  Block as BlockIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  AccessTime as AccessTimeIcon,
  Person as PersonIcon,
  PlayArrow as RunningIcon,
  HourglassEmpty as PendingIcon,
  ArrowForward as ArrowForwardIcon,
  ArrowBack as ArrowBackIcon,
  Check as CheckIcon,
  ThumbUp as ApproveIcon,
  ThumbDown as RejectIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import StepConnector, { stepConnectorClasses } from '@mui/material/StepConnector';
import { StepIconProps } from '@mui/material/StepIcon';
import { styled, keyframes } from '@mui/material/styles';
import Avatar from '@mui/material/Avatar';
import Skeleton from '@mui/material/Skeleton';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { useRouter } from 'next/navigation';

// ─── 애니메이션 ───
const pulseAnimation = keyframes`
  0% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 0.8; }
`;

const bounceAnimation = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
`;

// ─── 커스텀 스테퍼 커넥터 ───
const PremiumConnector = styled(StepConnector)(({ theme }) => ({
  [`&.${stepConnectorClasses.alternativeLabel}`]: {
    top: 22,
  },
  [`&.${stepConnectorClasses.active}`]: {
    [`& .${stepConnectorClasses.line}`]: {
      background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.success.main} 100%)`,
    },
  },
  [`&.${stepConnectorClasses.completed}`]: {
    [`& .${stepConnectorClasses.line}`]: {
      background: `linear-gradient(90deg, ${theme.palette.success.main} 0%, ${theme.palette.success.light} 100%)`,
    },
  },
  [`& .${stepConnectorClasses.line}`]: {
    height: 3,
    border: 0,
    backgroundColor: theme.palette.divider,
    borderRadius: 1.5,
  },
}));

// ─── 커스텀 스텝 아이콘 ───
function PremiumStepIcon(props: StepIconProps) {
  const { active, completed, icon } = props;
  const icons: { [index: string]: React.ReactElement } = {
    1: <FileIcon />,
    2: <PersonAddIcon />,
    3: <EditIcon />,
    4: <TaskAltIcon />,
  };
  return (
    <Box
      sx={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: completed ? 'success.main' : active ? 'primary.main' : 'grey.200',
        color: completed || active ? 'white' : 'grey.500',
        boxShadow: active ? '0 4px 12px rgba(25, 118, 210, 0.35)' : completed ? '0 4px 12px rgba(46, 125, 50, 0.35)' : 'none',
        transition: 'all 0.3s ease',
        transform: active ? 'scale(1.1)' : 'scale(1)',
      }}
    >
      {completed ? <CheckCircleIcon /> : icons[String(icon)]}
    </Box>
  );
}

// ─── 타입 ───
interface PreviewRow {
  row_index: number;
  status: string;
  counterparty_name: string;
  counterparty_id: string | null;
  trade_date: string | null;
  voucher_number: string;
  data: Record<string, unknown>;
  diff?: { before: Record<string, string>; after: Record<string, string>; changes: { field: string; old: string; new: string }[] } | null;
  error?: string | null;
}

interface UploadJob {
  id: string;
  job_type: string;
  status: string;
  progress: number;
  original_filename: string;
  result_summary: {
    total_rows?: number;
    new_count?: number;
    update_count?: number;
    conflict_count?: number;
    locked_count?: number;
    unmatched_count?: number;
    error_count?: number;
    excluded_count?: number;
  } | null;
  error_message: string | null;
  is_reviewed: boolean;
  is_confirmed: boolean;
  created_at: string;
  completed_at: string | null;
  confirmed_at: string | null;
  created_by?: string;
  created_by_name?: string | null;
  created_by_email?: string | null;
}

interface JobDetail extends UploadJob {
  preview_rows: PreviewRow[];
  unmatched_counterparties: string[];
}

interface Counterparty {
  id: string;
  name: string;
}

type VoucherType = 'sales' | 'purchase';
type SortField = 'row_index' | 'trade_date' | 'counterparty_name' | 'voucher_number' | 'status';
type SortDirection = 'asc' | 'desc';

// ─── 상태 매핑 ───
const ROW_STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'; icon: React.ReactNode }> = {
  new: { label: '신규', color: 'success', icon: <NewIcon sx={{ fontSize: 14 }} /> },
  update: { label: '변경', color: 'info', icon: <EditIcon sx={{ fontSize: 14 }} /> },
  conflict: { label: '충돌', color: 'warning', icon: <WarningIcon sx={{ fontSize: 14 }} /> },
  unmatched: { label: '미매칭', color: 'warning', icon: <UnmatchedIcon sx={{ fontSize: 14 }} /> },
  locked: { label: '마감', color: 'default', icon: <BlockIcon sx={{ fontSize: 14 }} /> },
  excluded: { label: '제외', color: 'default', icon: <ExcludedIcon sx={{ fontSize: 14 }} /> },
  error: { label: '오류', color: 'error', icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
  ok: { label: '정상', color: 'success', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
  unchanged: { label: '동일', color: 'default', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
};

const FIELD_LABELS: Record<string, string> = {
  trade_date: '거래일', counterparty_name: '거래처', voucher_number: '전표번호',
  quantity: '수량', purchase_cost: '매입원가', deduction_amount: '차감금액',
  actual_purchase_price: '실매입가', avg_unit_price: '평균가',
  purchase_deduction: '매입차감', as_cost: 'A/S비용', sale_amount: '판매금액',
  sale_deduction: '판매차감', actual_sale_price: '실판매가',
  profit: '손익', profit_rate: '수익율', avg_margin: '평균마진',
  upm_settlement_status: '정산현황', payment_info: '송금정보', memo: '비고',
};

// ─── 유틸리티 ───
function formatKST(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('T', ' ').slice(0, 16);
}

function getAvatarColor(name: string): string {
  const colors = ['#1976d2', '#388e3c', '#d32f2f', '#7b1fa2', '#1565c0', '#00838f', '#ef6c00', '#5d4037', '#455a64', '#6a1b9a'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── 메인 컴포넌트 ───
export default function UploadWizardPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── 위자드 상태 ───
  const [activeStep, setActiveStep] = useState(0);
  const [voucherType, setVoucherType] = useState<VoucherType>('sales');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: 업로드 상태
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStatus, setJobStatus] = useState<string>('');

  // Step 2-4: 작업 상세
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Step 2: 미매칭 거래처 처리
  const [existingCounterparties, setExistingCounterparties] = useState<Counterparty[]>([]);
  const [mappingActions, setMappingActions] = useState<Record<string, { action: 'skip' | 'link' | 'create'; linkToId?: string }>>({});
  const [batchRegistering, setBatchRegistering] = useState(false);

  // Step 3: 충돌 승인
  const [conflictApprovals, setConflictApprovals] = useState<Record<number, 'approve' | 'reject'>>({});

  // Step 2: 검색/필터
  const [conflictSearch, setConflictSearch] = useState('');
  const [conflictFilter, setConflictFilter] = useState<'all' | 'approve' | 'reject' | 'pending'>('all');

  // Step 3: 검색/필터/페이지네이션
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewStatusFilter, setPreviewStatusFilter] = useState('all');
  const [previewPage, setPreviewPage] = useState(0);
  const [previewRowsPerPage, setPreviewRowsPerPage] = useState(25);

  // Step 4: 확정
  const [confirming, setConfirming] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // 하단 히스토리 탭
  const [showHistory, setShowHistory] = useState(false);
  const [historyJobs, setHistoryJobs] = useState<UploadJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);

  const steps = ['타입 선택 + 파일 업로드', '미매칭 거래처 처리', '변경 감지/승인', '최종 확인 + 확정'];

  // ─── 통계 계산 ───
  const stats = useMemo(() => {
    if (!jobDetail?.result_summary) return null;
    const s = jobDetail.result_summary;
    return {
      total: s.total_rows ?? 0,
      new: s.new_count ?? 0,
      update: s.update_count ?? 0,
      conflict: s.conflict_count ?? 0,
      unmatched: s.unmatched_count ?? 0,
      error: s.error_count ?? 0,
      excluded: s.excluded_count ?? 0,
      locked: s.locked_count ?? 0,
    };
  }, [jobDetail]);

  const unmatchedList = useMemo(() => jobDetail?.unmatched_counterparties ?? [], [jobDetail]);
  const conflictRows = useMemo(() => jobDetail?.preview_rows.filter(r => r.status === 'conflict') ?? [], [jobDetail]);

  const filteredConflictRows = useMemo(() => {
    return conflictRows.filter(row => {
      const q = conflictSearch.toLowerCase();
      const matchSearch = !q ||
        row.counterparty_name.toLowerCase().includes(q) ||
        row.voucher_number.toLowerCase().includes(q);
      const approval = conflictApprovals[row.row_index];
      const matchFilter =
        conflictFilter === 'all' ||
        (conflictFilter === 'approve' && approval === 'approve') ||
        (conflictFilter === 'reject' && approval === 'reject') ||
        (conflictFilter === 'pending' && !approval);
      return matchSearch && matchFilter;
    });
  }, [conflictRows, conflictSearch, conflictFilter, conflictApprovals]);

  const filteredPreviewRows = useMemo(() => {
    return (jobDetail?.preview_rows ?? []).filter(row => {
      const q = previewSearch.toLowerCase();
      const matchSearch = !q ||
        (row.counterparty_name || '').toLowerCase().includes(q) ||
        (row.voucher_number || '').toLowerCase().includes(q);
      const matchStatus = previewStatusFilter === 'all' || row.status === previewStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [jobDetail?.preview_rows, previewSearch, previewStatusFilter]);

  const paginatedPreviewRows = useMemo(() => {
    return filteredPreviewRows.slice(previewPage * previewRowsPerPage, (previewPage + 1) * previewRowsPerPage);
  }, [filteredPreviewRows, previewPage, previewRowsPerPage]);

  // ─── 파일 핸들러 ───
  const validateAndSetFile = useCallback((selectedFile: File) => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setError('지원하는 파일 형식: .xlsx, .xls, .csv');
      return;
    }
    setFile(selectedFile);
    setError(null);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) validateAndSetFile(droppedFile);
  }, [validateAndSetFile]);

  // ─── Step 1: 업로드 실행 ───
  const handleUpload = async () => {
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      setJobProgress(0);
      setJobStatus('QUEUED');

      const res = await settlementApi.uploadVoucherExcel(file, voucherType, undefined);
      const data = res.data as { id: string };
      setJobId(data.id);

      // 폴링 시작
      pollJobStatus(data.id);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || '업로드에 실패했습니다.');
      setUploading(false);
    }
  };

  const pollJobStatus = useCallback(async (id: string) => {
    const poll = async () => {
      try {
        const res = await settlementApi.getUploadJob(id);
        const job = res.data as JobDetail;
        setJobProgress(job.progress);
        setJobStatus(job.status);

        if (job.status === 'SUCCEEDED' || job.status === 'succeeded') {
          setJobDetail(job);
          setUploading(false);
          // 미매칭이 있으면 Step 2로, 없으면 Step 3으로
          if ((job.result_summary?.unmatched_count ?? 0) > 0) {
            setActiveStep(1);
            loadCounterparties();
          } else if ((job.result_summary?.conflict_count ?? 0) > 0) {
            setActiveStep(2);
          } else {
            setActiveStep(3);
          }
        } else if (job.status === 'FAILED' || job.status === 'failed') {
          setError(job.error_message || '작업이 실패했습니다.');
          setUploading(false);
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        setError('작업 상태 조회에 실패했습니다.');
        setUploading(false);
      }
    };
    poll();
  }, []);

  // ─── Step 2: 거래처 매핑 ───
  const loadCounterparties = async () => {
    try {
      const res = await settlementApi.getCounterparties({ page: 1, page_size: 1000 });
      setExistingCounterparties((res.data as { counterparties: Counterparty[] }).counterparties || []);
    } catch { /* ignore */ }
  };

  const handleMappingActionChange = (name: string, action: 'skip' | 'link' | 'create') => {
    setMappingActions(prev => ({ ...prev, [name]: { action } }));
  };

  const handleBatchRegister = async () => {
    if (!jobId) return;
    const toCreate = unmatchedList.filter(name => (mappingActions[name]?.action ?? 'create') === 'create');
    if (toCreate.length === 0) {
      proceedToNextStep();
      return;
    }

    try {
      setBatchRegistering(true);
      const payload = toCreate.map(name => ({ name, counterparty_type: 'both' }));
      await settlementApi.batchCreateCounterparties(payload);
      await settlementApi.rematchUploadJob(jobId);
      
      // 상세 다시 로드
      const res = await settlementApi.getUploadJob(jobId);
      setJobDetail(res.data as JobDetail);
      
      enqueueSnackbar(`${toCreate.length}건 거래처 등록 완료`, { variant: 'success' });
      proceedToNextStep();
    } catch {
      enqueueSnackbar('거래처 등록에 실패했습니다', { variant: 'error' });
    } finally {
      setBatchRegistering(false);
    }
  };

  const handleLinkMapping = async (aliasName: string, counterpartyId: string) => {
    try {
      await settlementApi.mapUnmatchedCounterparty(aliasName, { counterparty_id: counterpartyId });
      if (jobId) {
        await settlementApi.rematchUploadJob(jobId);
        const res = await settlementApi.getUploadJob(jobId);
        setJobDetail(res.data as JobDetail);
      }
      enqueueSnackbar(`"${aliasName}" 매핑 완료`, { variant: 'success' });
      setMappingActions(prev => ({ ...prev, [aliasName]: { action: 'skip' } }));
    } catch {
      enqueueSnackbar('매핑에 실패했습니다', { variant: 'error' });
    }
  };

  // ─── Step 3: 충돌 승인 ───
  const handleApproveAll = () => {
    const approvals: Record<number, 'approve'> = {};
    conflictRows.forEach(row => { approvals[row.row_index] = 'approve'; });
    setConflictApprovals(approvals);
  };

  const handleRejectAll = () => {
    const approvals: Record<number, 'reject'> = {};
    conflictRows.forEach(row => { approvals[row.row_index] = 'reject'; });
    setConflictApprovals(approvals);
  };

  // ─── Step 4: 확정 ───
  const handleConfirm = async () => {
    if (!jobId) return;
    try {
      setConfirming(true);
      await settlementApi.confirmUploadJob(jobId);
      enqueueSnackbar('업로드가 확정되었습니다', { variant: 'success' });
      
      // 상세 다시 로드
      const res = await settlementApi.getUploadJob(jobId);
      setJobDetail(res.data as JobDetail);
    } catch {
      enqueueSnackbar('확정에 실패했습니다', { variant: 'error' });
    } finally {
      setConfirming(false);
    }
  };

  // ─── 스텝 이동 ───
  const proceedToNextStep = () => {
    if (activeStep === 1) {
      // Step 2 -> Step 3
      if ((stats?.conflict ?? 0) > 0) {
        setActiveStep(2);
      } else {
        setActiveStep(3);
      }
    } else if (activeStep === 2) {
      setActiveStep(3);
    }
  };

  const handleReset = () => {
    setActiveStep(0);
    setFile(null);
    setJobId(null);
    setJobDetail(null);
    setJobProgress(0);
    setJobStatus('');
    setError(null);
    setMappingActions({});
    setConflictApprovals({});
    setConflictSearch('');
    setConflictFilter('all');
    setPreviewSearch('');
    setPreviewStatusFilter('all');
    setPreviewPage(0);
    setConfirmModalOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── 히스토리 로드 ───
  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await settlementApi.getUploadJobs({ page: historyPage + 1, page_size: 10 });
      const data = res.data as { jobs: UploadJob[]; total: number };
      setHistoryJobs(data.jobs);
      setHistoryTotal(data.total);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  };

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory, historyPage]);

  // ─── 숫자 포매팅 ───
  const fmtNum = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* ─── 헤더 ─── */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            UPM 전표 업로드
          </Typography>
          <Typography variant="body2" color="text.secondary">
            판매/매입 전표를 한 번에 업로드하고 미매칭 거래처 처리까지 완료하세요
          </Typography>
        </Box>
        <Button
          variant="text"
          startIcon={showHistory ? <ExpandLessIcon /> : <HistoryIcon />}
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? '히스토리 닫기' : '이전 작업 내역'}
        </Button>
      </Stack>

      {/* ─── 스테퍼 ─── */}
      <Paper elevation={0} sx={{
        px: 4, py: 3, mb: 3,
        border: '1px solid', borderColor: 'divider', borderRadius: 3,
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.02)} 0%, ${alpha(theme.palette.success.main, 0.02)} 100%)`,
      }}>
        <Stepper activeStep={activeStep} alternativeLabel connector={<PremiumConnector />}>
          {steps.map((label, index) => (
            <Step key={label} completed={activeStep > index || (activeStep === 3 && jobDetail?.is_confirmed)}>
              <StepLabel StepIconComponent={PremiumStepIcon}>
                <Typography
                  variant="body2"
                  fontWeight={activeStep === index ? 700 : 500}
                  color={activeStep === index ? 'primary.main' : activeStep > index ? 'success.main' : 'text.secondary'}
                >
                  {label}
                </Typography>
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ════════════════════════════════════════
          Step 0: 타입 선택 + 파일 업로드
         ════════════════════════════════════════ */}
      {activeStep === 0 && (
        <Fade in timeout={300}>
          <Box>
            {/* 타입 선택 */}
            <Paper elevation={0} sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                전표 유형 선택
              </Typography>
              <ToggleButtonGroup
                value={voucherType}
                exclusive
                onChange={(_, v) => v && setVoucherType(v)}
                sx={{ mt: 1 }}
              >
                <ToggleButton value="sales" sx={{ px: 4, py: 1.5, borderRadius: '12px 0 0 12px' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <SalesIcon color={voucherType === 'sales' ? 'primary' : 'inherit'} />
                    <Typography fontWeight={600}>판매 전표</Typography>
                  </Stack>
                </ToggleButton>
                <ToggleButton value="purchase" sx={{ px: 4, py: 1.5, borderRadius: '0 12px 12px 0' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <PurchaseIcon color={voucherType === 'purchase' ? 'primary' : 'inherit'} />
                    <Typography fontWeight={600}>매입 전표</Typography>
                  </Stack>
                </ToggleButton>
              </ToggleButtonGroup>
            </Paper>

            {/* 파일 드롭존 */}
            <Paper
              elevation={0}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              sx={{
                p: 8,
                border: '2px dashed',
                borderColor: isDragging ? 'primary.main' : file ? 'success.main' : 'divider',
                borderRadius: 4,
                textAlign: 'center',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                bgcolor: isDragging
                  ? alpha(theme.palette.primary.main, 0.06)
                  : file
                    ? alpha(theme.palette.success.main, 0.03)
                    : 'background.paper',
                transition: 'all 0.3s ease-in-out',
                '&:hover': {
                  borderColor: file ? 'success.main' : 'primary.main',
                  bgcolor: file ? alpha(theme.palette.success.main, 0.04) : alpha(theme.palette.primary.main, 0.03),
                },
              }}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileSelect} />
              
              {uploading ? (
                <Stack alignItems="center" spacing={3}>
                  <CircularProgress size={60} />
                  <Box>
                    <Typography variant="h6" fontWeight={700}>업로드 처리 중...</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {jobStatus === 'QUEUED' ? '대기 중' : jobStatus === 'RUNNING' ? '파싱 중' : jobStatus}
                    </Typography>
                  </Box>
                  <Box sx={{ width: '60%' }}>
                    <LinearProgress variant="determinate" value={jobProgress} sx={{ height: 8, borderRadius: 4 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      {jobProgress}% 완료
                    </Typography>
                  </Box>
                </Stack>
              ) : file ? (
                <Stack alignItems="center" spacing={2}>
                  <Paper elevation={2} sx={{ p: 3, borderRadius: 3, minWidth: 280, bgcolor: 'background.paper', border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.3) }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{ width: 56, height: 56, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <DescriptionIcon sx={{ fontSize: 32, color: 'success.main' }} />
                      </Box>
                      <Box sx={{ textAlign: 'left' }}>
                        <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ maxWidth: 200 }}>{file.name}</Typography>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Typography variant="caption" color="text.secondary">{(file.size / 1024).toFixed(1)} KB</Typography>
                          <Chip label={file.name.split('.').pop()?.toUpperCase()} size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                        </Stack>
                      </Box>
                    </Stack>
                  </Paper>
                  <Button variant="text" size="small" color="inherit" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    다른 파일 선택
                  </Button>
                </Stack>
              ) : (
                <Stack alignItems="center" spacing={2}>
                  <Box sx={{
                    width: 80, height: 80, borderRadius: '50%',
                    bgcolor: isDragging ? alpha(theme.palette.primary.main, 0.15) : alpha(theme.palette.primary.main, 0.08),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: isDragging ? `${pulseAnimation} 1s ease-in-out infinite` : 'none',
                  }}>
                    <CloudUploadIcon sx={{
                      fontSize: 40,
                      color: isDragging ? 'primary.main' : 'text.secondary',
                      animation: isDragging ? `${bounceAnimation} 0.6s ease-in-out infinite` : 'none',
                    }} />
                  </Box>
                  <Box>
                    <Typography variant="h5" fontWeight={700} color={isDragging ? 'primary.main' : 'text.primary'}>
                      {isDragging ? '여기에 파일을 놓으세요' : '파일을 드래그하거나 클릭하세요'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      .xlsx, .xls, .csv 파일 지원 (최대 50MB)
                    </Typography>
                  </Box>
                </Stack>
              )}
            </Paper>

            {file && !uploading && (
              <Stack direction="row" spacing={2} sx={{ mt: 4 }} justifyContent="center">
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<FileUploadIcon />}
                  onClick={handleUpload}
                  sx={{
                    px: 5, py: 1.5, borderRadius: 3, fontWeight: 700,
                    boxShadow: 3,
                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                  }}
                >
                  업로드 시작
                </Button>
              </Stack>
            )}
          </Box>
        </Fade>
      )}

      {/* ════════════════════════════════════════
          Step 1: 미매칭 거래처 처리
         ════════════════════════════════════════ */}
      {activeStep === 1 && (
        <Fade in timeout={300}>
          <Box>
            <Paper elevation={0} sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{
                    width: 48, height: 48, borderRadius: 2,
                    bgcolor: alpha(theme.palette.warning.main, 0.1),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <PersonAddIcon sx={{ color: 'warning.main', fontSize: 28 }} />
                  </Box>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>미매칭 거래처 처리</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {unmatchedList.length}건의 미매칭 거래처가 있습니다
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<BatchIcon />}
                    onClick={() => {
                      const updated: Record<string, { action: 'create' }> = {};
                      unmatchedList.forEach(name => { updated[name] = { action: 'create' }; });
                      setMappingActions(updated);
                    }}
                  >
                    전체 신규 등록
                  </Button>
                </Stack>
              </Stack>

              {/* 진행률 */}
              <Box sx={{ mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">처리 진행률</Typography>
                  <Typography variant="caption" fontWeight={600}>
                    {unmatchedList.filter(name => !!mappingActions[name]).length}건 처리 완료 / {unmatchedList.length}건
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={unmatchedList.length > 0 ? (unmatchedList.filter(name => !!mappingActions[name]).length / unmatchedList.length) * 100 : 0}
                  sx={{ height: 8, borderRadius: 4, bgcolor: alpha(theme.palette.primary.main, 0.1) }}
                />
              </Box>

              {/* 매핑 테이블 */}
              <TableContainer sx={{ maxHeight: 'calc(100vh - 430px)', minHeight: 200 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>미매칭 거래처명</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 140, bgcolor: 'background.paper' }}>액션</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>연결 대상</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 70, bgcolor: 'background.paper' }} align="center">실행</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {unmatchedList.map((name) => {
                      const action = mappingActions[name] ?? { action: 'create' };
                      const isSkipped = action.action === 'skip';
                      return (
                        <TableRow key={name} sx={{ opacity: isSkipped ? 0.5 : 1 }}>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              {isSkipped && <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />}
                              <Typography variant="body2" fontWeight={600} sx={{ textDecoration: isSkipped ? 'line-through' : 'none' }}>
                                {name}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <FormControl size="small" fullWidth>
                              <Select
                                value={action.action}
                                onChange={(e) => handleMappingActionChange(name, e.target.value as 'skip' | 'link' | 'create')}
                                sx={{ fontSize: '0.8rem', height: 34 }}
                              >
                                <MenuItem value="create">
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <PersonAddIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                                    <span>신규 등록</span>
                                  </Stack>
                                </MenuItem>
                                <MenuItem value="link">
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <LinkIcon sx={{ fontSize: 16, color: 'info.main' }} />
                                    <span>기존 연결</span>
                                  </Stack>
                                </MenuItem>
                                <MenuItem value="skip">
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                    <span>처리 완료</span>
                                  </Stack>
                                </MenuItem>
                              </Select>
                            </FormControl>
                          </TableCell>
                          <TableCell>
                            {action.action === 'link' ? (
                              <Autocomplete
                                size="small"
                                options={existingCounterparties}
                                getOptionLabel={(opt) => opt.name}
                                value={existingCounterparties.find((cp) => cp.id === action.linkToId) || null}
                                onChange={(_, val) => {
                                  setMappingActions((prev) => ({
                                    ...prev,
                                    [name]: { ...prev[name], linkToId: val?.id },
                                  }));
                                }}
                                renderInput={(params) => <TextField {...params} placeholder="거래처 검색..." size="small" />}
                                sx={{ minWidth: 200 }}
                                noOptionsText="검색 결과 없음"
                              />
                            ) : action.action === 'create' ? (
                              <Typography variant="caption" color="primary.main" fontWeight={500}>
                                &quot;{name}&quot; 이름으로 신규 생성
                              </Typography>
                            ) : (
                              <Typography variant="caption" color="success.main">처리 완료됨</Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {action.action === 'link' && action.linkToId && (
                              <IconButton size="small" color="info" onClick={() => handleLinkMapping(name, action.linkToId!)}>
                                <LinkIcon fontSize="small" />
                              </IconButton>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {unmatchedList.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                          <CheckCircleIcon sx={{ fontSize: 32, color: 'success.main', mb: 1 }} />
                          <Typography color="text.secondary">모든 거래처가 매칭되었습니다!</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* 액션 버튼 — sticky bottom */}
            <Box sx={{
              position: 'sticky', bottom: 0, zIndex: 10,
              bgcolor: 'background.default',
              borderTop: '1px solid', borderColor: 'divider',
              py: 1.5, mt: 2,
            }}>
              <Stack direction="row" spacing={2} justifyContent="flex-end" alignItems="center">
                {unmatchedList.some(name => !mappingActions[name]) && (
                  <Typography variant="caption" color="warning.main">
                    모든 미매칭 거래처에 대한 처리 방법을 선택해주세요
                  </Typography>
                )}
                <Button variant="outlined" onClick={handleReset}>처음부터</Button>
                <Tooltip title={unmatchedList.some(name => !mappingActions[name]) ? '미처리 거래처가 남아 있습니다' : ''}>
                  <span>
                    <Button
                      variant="contained"
                      onClick={handleBatchRegister}
                      disabled={batchRegistering || unmatchedList.some(name => !mappingActions[name])}
                      startIcon={batchRegistering ? <CircularProgress size={18} color="inherit" /> : <ArrowForwardIcon />}
                      sx={{ px: 4, fontWeight: 700 }}
                    >
                      {batchRegistering ? '등록 중...' : '다음 단계'}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Box>
          </Box>
        </Fade>
      )}

      {/* ════════════════════════════════════════
          Step 2: 변경 감지/승인
         ════════════════════════════════════════ */}
      {activeStep === 2 && (
        <Fade in timeout={300}>
          <Box>
            <Paper elevation={0} sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{
                    width: 48, height: 48, borderRadius: 2,
                    bgcolor: alpha(theme.palette.info.main, 0.1),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <EditIcon sx={{ color: 'info.main', fontSize: 28 }} />
                  </Box>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>변경 감지/승인</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {conflictRows.length}건의 충돌 항목이 있습니다
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" size="small" color="success" startIcon={<ApproveIcon />} onClick={handleApproveAll}>
                    전체 승인
                  </Button>
                  <Button variant="outlined" size="small" color="error" startIcon={<RejectIcon />} onClick={handleRejectAll}>
                    전체 거절
                  </Button>
                </Stack>
              </Stack>

              {conflictRows.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
                  <Typography variant="h6" fontWeight={600}>충돌 항목이 없습니다</Typography>
                  <Typography variant="body2" color="text.secondary">다음 단계로 진행하세요</Typography>
                </Box>
              ) : (
                <>
                  {/* 검색/필터 */}
                  <Stack direction="row" spacing={2} sx={{ mb: 1.5 }} alignItems="center" flexWrap="wrap">
                    <TextField
                      size="small"
                      placeholder="거래처명, 전표번호 검색..."
                      value={conflictSearch}
                      onChange={(e) => setConflictSearch(e.target.value)}
                      sx={{ minWidth: 240 }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                    <Stack direction="row" spacing={0.5}>
                      {(['all', 'pending', 'approve', 'reject'] as const).map(f => {
                        const labels = { all: '전체', pending: '미결', approve: '승인', reject: '거절' };
                        const counts = {
                          all: conflictRows.length,
                          pending: conflictRows.filter(r => !conflictApprovals[r.row_index]).length,
                          approve: conflictRows.filter(r => conflictApprovals[r.row_index] === 'approve').length,
                          reject: conflictRows.filter(r => conflictApprovals[r.row_index] === 'reject').length,
                        };
                        return (
                          <Chip
                            key={f}
                            label={`${labels[f]} ${counts[f]}`}
                            onClick={() => setConflictFilter(f)}
                            color={conflictFilter === f ? (f === 'approve' ? 'success' : f === 'reject' ? 'error' : 'primary') : 'default'}
                            variant={conflictFilter === f ? 'filled' : 'outlined'}
                            size="small"
                            sx={{ fontSize: '0.72rem' }}
                          />
                        );
                      })}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {filteredConflictRows.length} / {conflictRows.length}건
                    </Typography>
                  </Stack>

                  <TableContainer sx={{ maxHeight: 'calc(100vh - 500px)', minHeight: 200 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, width: 50, bgcolor: 'background.paper' }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>거래처</TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>거래일</TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>전표번호</TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>변경 내용</TableCell>
                          <TableCell sx={{ fontWeight: 700, width: 120, bgcolor: 'background.paper' }} align="center">승인/거절</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredConflictRows.map((row) => (
                          <TableRow key={row.row_index} sx={{
                            bgcolor: conflictApprovals[row.row_index] === 'approve' ? alpha(theme.palette.success.main, 0.05)
                              : conflictApprovals[row.row_index] === 'reject' ? alpha(theme.palette.error.main, 0.05)
                              : 'transparent',
                          }}>
                            <TableCell>{row.row_index + 1}</TableCell>
                            <TableCell>{row.counterparty_name}</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>{row.trade_date || '—'}</TableCell>
                            <TableCell>{row.voucher_number}</TableCell>
                            <TableCell>
                              {row.diff?.changes?.map((c, i) => (
                                <Typography key={i} variant="caption" display="block" color="info.main">
                                  {FIELD_LABELS[c.field] || c.field}: {c.old ?? '(없음)'} → {c.new ?? '(없음)'}
                                </Typography>
                              ))}
                            </TableCell>
                            <TableCell align="center">
                              <Stack direction="row" spacing={0.5} justifyContent="center">
                                <IconButton
                                  size="small"
                                  color={conflictApprovals[row.row_index] === 'approve' ? 'success' : 'default'}
                                  onClick={() => setConflictApprovals(prev => ({ ...prev, [row.row_index]: 'approve' }))}
                                >
                                  <ApproveIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color={conflictApprovals[row.row_index] === 'reject' ? 'error' : 'default'}
                                  onClick={() => setConflictApprovals(prev => ({ ...prev, [row.row_index]: 'reject' }))}
                                >
                                  <RejectIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredConflictRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                              <Typography color="text.secondary">검색 결과가 없습니다</Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </Paper>

            {/* 액션 버튼 — sticky bottom */}
            <Box sx={{
              position: 'sticky', bottom: 0, zIndex: 10,
              bgcolor: 'background.default',
              borderTop: '1px solid', borderColor: 'divider',
              py: 1.5, mt: 2,
            }}>
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button variant="outlined" onClick={() => setActiveStep(1)}>이전</Button>
                <Button
                  variant="contained"
                  onClick={() => setActiveStep(3)}
                  startIcon={<ArrowForwardIcon />}
                  sx={{ px: 4, fontWeight: 700 }}
                >
                  다음 단계
                </Button>
              </Stack>
            </Box>
          </Box>
        </Fade>
      )}

      {/* ════════════════════════════════════════
          Step 3: 최종 확인 + 확정
         ════════════════════════════════════════ */}
      {activeStep === 3 && (
        <Fade in timeout={300}>
          <Box>
            {jobDetail?.is_confirmed ? (
              // 확정 완료 화면
              <Paper elevation={0} sx={{
                p: 8, textAlign: 'center',
                border: '1px solid', borderColor: 'divider', borderRadius: 4,
                background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.03)} 0%, ${alpha(theme.palette.primary.main, 0.02)} 100%)`,
              }}>
                <Box sx={{
                  width: 100, height: 100, borderRadius: '50%', mx: 'auto', mb: 3,
                  bgcolor: alpha(theme.palette.success.main, 0.12),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 8px 24px ${alpha(theme.palette.success.main, 0.25)}`,
                }}>
                  <VerifiedIcon sx={{ fontSize: 56, color: 'success.main' }} />
                </Box>
                <Typography variant="h4" fontWeight={800} sx={{ mb: 1 }}>
                  업로드 확정 완료!
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                  {formatKST(jobDetail.confirmed_at)}에 확정되었습니다.
                </Typography>

                <Stack direction="row" spacing={3} justifyContent="center" sx={{ mb: 5 }}>
                  <Paper elevation={0} sx={{ p: 3, minWidth: 100, borderRadius: 3, border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.3), bgcolor: alpha(theme.palette.success.main, 0.04) }}>
                    <Typography variant="h3" fontWeight={800} color="success.main">{fmtNum(stats?.new ?? 0)}</Typography>
                    <Typography variant="body2" color="text.secondary">신규</Typography>
                  </Paper>
                  <Paper elevation={0} sx={{ p: 3, minWidth: 100, borderRadius: 3, border: '1px solid', borderColor: alpha(theme.palette.info.main, 0.3), bgcolor: alpha(theme.palette.info.main, 0.04) }}>
                    <Typography variant="h3" fontWeight={800} color="info.main">{fmtNum(stats?.update ?? 0)}</Typography>
                    <Typography variant="body2" color="text.secondary">변경</Typography>
                  </Paper>
                  <Paper elevation={0} sx={{ p: 3, minWidth: 100, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="h3" fontWeight={800} color="text.secondary">{fmtNum(stats?.excluded ?? 0)}</Typography>
                    <Typography variant="body2" color="text.secondary">제외</Typography>
                  </Paper>
                </Stack>

                <Stack direction="row" spacing={2} justifyContent="center">
                  <Button variant="outlined" onClick={handleReset} startIcon={<RefreshIcon />}>
                    추가 업로드
                  </Button>
                  <Button variant="contained" onClick={() => router.push('/settlement/vouchers')} sx={{ fontWeight: 700 }}>
                    전표 목록 보기
                  </Button>
                </Stack>
              </Paper>
            ) : (
              // 확정 전 화면
              <Box>
                <Paper elevation={0} sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
                  <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                    <Box sx={{
                      width: 48, height: 48, borderRadius: 2,
                      bgcolor: alpha(theme.palette.success.main, 0.1),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <TaskAltIcon sx={{ color: 'success.main', fontSize: 28 }} />
                    </Box>
                    <Box>
                      <Typography variant="h6" fontWeight={700}>최종 결과 확인</Typography>
                      <Typography variant="body2" color="text.secondary">
                        아래 내용을 확인하고 업로드를 확정하세요
                      </Typography>
                    </Box>
                  </Stack>

                  {/* 요약 통계 — 클릭하면 미리보기 필터 적용 */}
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    항목을 클릭하면 미리보기가 해당 상태로 필터됩니다
                  </Typography>
                  <Stack direction="row" spacing={1.5} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
                    {/* 전체 */}
                    <Paper
                      variant="outlined"
                      onClick={() => { setPreviewStatusFilter('all'); setPreviewPage(0); }}
                      sx={{
                        p: 2, minWidth: 90, textAlign: 'center', borderRadius: 2, cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: previewStatusFilter === 'all' ? '2px solid' : '1px solid',
                        borderColor: previewStatusFilter === 'all' ? 'primary.main' : 'divider',
                        bgcolor: previewStatusFilter === 'all' ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04), borderColor: 'primary.main' },
                      }}
                    >
                      <Typography variant="h5" fontWeight={800} color={previewStatusFilter === 'all' ? 'primary.main' : 'text.primary'}>{fmtNum(stats?.total ?? 0)}</Typography>
                      <Typography variant="caption" color="text.secondary">전체</Typography>
                    </Paper>
                    {/* 신규 */}
                    <Paper
                      variant="outlined"
                      onClick={() => { setPreviewStatusFilter(previewStatusFilter === 'new' ? 'all' : 'new'); setPreviewPage(0); }}
                      sx={{
                        p: 2, minWidth: 90, textAlign: 'center', borderRadius: 2, cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: previewStatusFilter === 'new' ? '2px solid' : '1px solid',
                        borderColor: previewStatusFilter === 'new' ? 'success.main' : alpha(theme.palette.success.main, 0.4),
                        bgcolor: previewStatusFilter === 'new' ? alpha(theme.palette.success.main, 0.1) : alpha(theme.palette.success.main, 0.03),
                        '&:hover': { bgcolor: alpha(theme.palette.success.main, 0.08) },
                      }}
                    >
                      <Typography variant="h5" fontWeight={800} color="success.main">{fmtNum(stats?.new ?? 0)}</Typography>
                      <Typography variant="caption" color="text.secondary">신규</Typography>
                    </Paper>
                    {/* 변경 */}
                    <Paper
                      variant="outlined"
                      onClick={() => { setPreviewStatusFilter(previewStatusFilter === 'update' ? 'all' : 'update'); setPreviewPage(0); }}
                      sx={{
                        p: 2, minWidth: 90, textAlign: 'center', borderRadius: 2, cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: previewStatusFilter === 'update' ? '2px solid' : '1px solid',
                        borderColor: previewStatusFilter === 'update' ? 'info.main' : alpha(theme.palette.info.main, 0.4),
                        bgcolor: previewStatusFilter === 'update' ? alpha(theme.palette.info.main, 0.1) : alpha(theme.palette.info.main, 0.03),
                        '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.08) },
                      }}
                    >
                      <Typography variant="h5" fontWeight={800} color="info.main">{fmtNum(stats?.update ?? 0)}</Typography>
                      <Typography variant="caption" color="text.secondary">변경</Typography>
                    </Paper>
                    {/* 오류 (건수 있을 때만) */}
                    {(stats?.error ?? 0) > 0 && (
                      <Paper
                        variant="outlined"
                        onClick={() => { setPreviewStatusFilter(previewStatusFilter === 'error' ? 'all' : 'error'); setPreviewPage(0); }}
                        sx={{
                          p: 2, minWidth: 90, textAlign: 'center', borderRadius: 2, cursor: 'pointer',
                          transition: 'all 0.2s',
                          border: previewStatusFilter === 'error' ? '2px solid' : '1px solid',
                          borderColor: previewStatusFilter === 'error' ? 'error.main' : alpha(theme.palette.error.main, 0.4),
                          bgcolor: previewStatusFilter === 'error' ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.error.main, 0.03),
                          '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.08) },
                        }}
                      >
                        <Typography variant="h5" fontWeight={800} color="error.main">{fmtNum(stats?.error ?? 0)}</Typography>
                        <Typography variant="caption" color="text.secondary">오류</Typography>
                      </Paper>
                    )}
                    {/* 미매칭 (건수 있을 때만) */}
                    {(stats?.unmatched ?? 0) > 0 && (
                      <Paper
                        variant="outlined"
                        onClick={() => { setPreviewStatusFilter(previewStatusFilter === 'unmatched' ? 'all' : 'unmatched'); setPreviewPage(0); }}
                        sx={{
                          p: 2, minWidth: 90, textAlign: 'center', borderRadius: 2, cursor: 'pointer',
                          transition: 'all 0.2s',
                          border: previewStatusFilter === 'unmatched' ? '2px solid' : '1px solid',
                          borderColor: previewStatusFilter === 'unmatched' ? 'warning.main' : alpha(theme.palette.warning.main, 0.4),
                          bgcolor: previewStatusFilter === 'unmatched' ? alpha(theme.palette.warning.main, 0.1) : alpha(theme.palette.warning.main, 0.03),
                          '&:hover': { bgcolor: alpha(theme.palette.warning.main, 0.08) },
                        }}
                      >
                        <Typography variant="h5" fontWeight={800} color="warning.main">{fmtNum(stats?.unmatched ?? 0)}</Typography>
                        <Typography variant="caption" color="text.secondary">미매칭</Typography>
                      </Paper>
                    )}
                    {/* 제외 */}
                    <Paper
                      variant="outlined"
                      onClick={() => { setPreviewStatusFilter(previewStatusFilter === 'excluded' ? 'all' : 'excluded'); setPreviewPage(0); }}
                      sx={{
                        p: 2, minWidth: 90, textAlign: 'center', borderRadius: 2, cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: previewStatusFilter === 'excluded' ? '2px solid' : '1px solid',
                        borderColor: previewStatusFilter === 'excluded' ? 'text.disabled' : 'divider',
                        bgcolor: previewStatusFilter === 'excluded' ? alpha(theme.palette.action.disabled, 0.1) : 'transparent',
                        '&:hover': { bgcolor: alpha(theme.palette.action.disabled, 0.06) },
                      }}
                    >
                      <Typography variant="h5" fontWeight={800} color="text.secondary">{fmtNum(stats?.excluded ?? 0)}</Typography>
                      <Typography variant="caption" color="text.secondary">제외</Typography>
                    </Paper>
                  </Stack>

                  {/* 경고 메시지 */}
                  {((stats?.unmatched ?? 0) > 0 || (stats?.error ?? 0) > 0) && (
                    <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                      <AlertTitle sx={{ fontWeight: 700 }}>주의</AlertTitle>
                      {(stats?.unmatched ?? 0) > 0 && (
                        <Typography variant="body2">미매칭 {stats?.unmatched}건은 확정 시 제외됩니다.</Typography>
                      )}
                      {(stats?.error ?? 0) > 0 && (
                        <Typography variant="body2">오류 {stats?.error}건은 확정 시 제외됩니다.</Typography>
                      )}
                    </Alert>
                  )}

                  {/* 미리보기 테이블 */}
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700}>데이터 미리보기</Typography>
                    <TextField
                      size="small"
                      placeholder="거래처명, 전표번호 검색..."
                      value={previewSearch}
                      onChange={(e) => { setPreviewSearch(e.target.value); setPreviewPage(0); }}
                      sx={{ width: 240 }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Stack>

                  <TableContainer sx={{ maxHeight: 'calc(100vh - 600px)', minHeight: 200, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', width: 50 }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', width: 70 }}>상태</TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>거래일</TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>거래처</TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>전표번호</TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }} align="right">
                            {voucherType === 'sales' ? '판매금액' : '매입원가'}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }} align="right">
                            {voucherType === 'sales' ? '실판매가' : '실매입가'}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>비고</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginatedPreviewRows.map((row) => {
                          const cfg = ROW_STATUS_CONFIG[row.status] || ROW_STATUS_CONFIG['error'];
                          const mainAmt = voucherType === 'sales' ? row.data?.sale_amount : row.data?.purchase_cost;
                          const actualAmt = voucherType === 'sales' ? row.data?.actual_sale_price : row.data?.actual_purchase_price;
                          const memo = row.data?.memo as string | null;
                          return (
                            <TableRow key={row.row_index} sx={{
                              bgcolor: row.status === 'error' ? alpha(theme.palette.error.main, 0.03)
                                : row.status === 'unmatched' ? alpha(theme.palette.warning.main, 0.03)
                                : row.status === 'new' ? alpha(theme.palette.success.main, 0.02)
                                : 'transparent',
                            }}>
                              <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{row.row_index + 1}</TableCell>
                              <TableCell>
                                <Chip icon={cfg.icon as React.ReactElement} label={cfg.label} size="small" color={cfg.color} variant="filled" sx={{ fontSize: '0.68rem', height: 22 }} />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>{row.trade_date || '—'}</TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>{row.counterparty_name || '—'}</TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>{row.voucher_number || '—'}</TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }} align="right">
                                {mainAmt != null ? fmtNum(Number(mainAmt)) : '—'}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }} align="right">
                                {actualAmt != null ? fmtNum(Number(actualAmt)) : '—'}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem', maxWidth: 160 }}>
                                <Typography variant="caption" noWrap title={memo || undefined}>{memo || '—'}</Typography>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredPreviewRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                              <Typography color="text.secondary">검색 결과가 없습니다</Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <TablePagination
                    component="div"
                    count={filteredPreviewRows.length}
                    page={previewPage}
                    onPageChange={(_, p) => setPreviewPage(p)}
                    rowsPerPage={previewRowsPerPage}
                    rowsPerPageOptions={[25, 50, 100]}
                    onRowsPerPageChange={(e) => { setPreviewRowsPerPage(parseInt(e.target.value)); setPreviewPage(0); }}
                    labelRowsPerPage="페이지당"
                    labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 전체 ${count}건`}
                  />
                </Paper>

                {/* 액션 버튼 — sticky bottom */}
                <Box sx={{
                  position: 'sticky', bottom: 0, zIndex: 10,
                  bgcolor: 'background.default',
                  borderTop: '1px solid', borderColor: 'divider',
                  py: 1.5, mt: 2,
                }}>
                  <Stack direction="row" spacing={2} justifyContent="flex-end">
                    <Button variant="outlined" onClick={() => setActiveStep((stats?.conflict ?? 0) > 0 ? 2 : 1)}>이전</Button>
                    <Button
                      variant="contained"
                      color="success"
                      onClick={() => setConfirmModalOpen(true)}
                      disabled={confirming}
                      startIcon={<VerifiedIcon />}
                      sx={{ px: 4, fontWeight: 700, boxShadow: 3 }}
                    >
                      업로드 확정
                    </Button>
                  </Stack>
                </Box>
              </Box>
            )}
          </Box>
        </Fade>
      )}

      {/* ════════════════════════════════════════
          업로드 확정 확인 모달
         ════════════════════════════════════════ */}
      <Dialog
        open={confirmModalOpen}
        onClose={() => !confirming && setConfirmModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 4, overflow: 'hidden' } }}
      >
        {/* 헤더 */}
        <Box sx={{
          background: `linear-gradient(135deg, ${theme.palette.success.dark} 0%, ${theme.palette.success.main} 100%)`,
          px: 3, py: 2.5, color: 'white',
        }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={2} alignItems="center">
              <Box sx={{
                width: 48, height: 48, borderRadius: '50%',
                bgcolor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <VerifiedIcon sx={{ fontSize: 28 }} />
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={800}>업로드 최종 확정</Typography>
                <Typography variant="body2" sx={{ opacity: 0.85 }}>아래 내용을 확인 후 확정하세요</Typography>
              </Box>
            </Stack>
            <IconButton onClick={() => setConfirmModalOpen(false)} disabled={confirming} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </Box>

        <DialogContent sx={{ p: 3 }}>
          {/* 파일 정보 */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 2 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <DescriptionIcon color="action" />
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">업로드 파일</Typography>
                <Typography variant="body2" fontWeight={600} noWrap>{jobDetail?.original_filename ?? '—'}</Typography>
              </Box>
              <Chip
                label={voucherType === 'sales' ? '판매 전표' : '매입 전표'}
                color={voucherType === 'sales' ? 'primary' : 'secondary'}
                size="small"
                sx={{ fontWeight: 700 }}
              />
            </Stack>
          </Paper>

          {/* 요약 수치 */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>업로드 요약</Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2.5 }}>
            <Box sx={{ flex: 1, minWidth: 80, textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.05), border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h5" fontWeight={800}>{fmtNum(stats?.total ?? 0)}</Typography>
              <Typography variant="caption" color="text.secondary">전체 행</Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 80, textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.07), border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.3) }}>
              <Typography variant="h5" fontWeight={800} color="success.main">{fmtNum(stats?.new ?? 0)}</Typography>
              <Typography variant="caption" color="text.secondary">신규 등록</Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 80, textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.07), border: '1px solid', borderColor: alpha(theme.palette.info.main, 0.3) }}>
              <Typography variant="h5" fontWeight={800} color="info.main">{fmtNum(stats?.update ?? 0)}</Typography>
              <Typography variant="caption" color="text.secondary">수정 업데이트</Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 80, textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.action.disabled, 0.04), border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h5" fontWeight={800} color="text.secondary">
                {fmtNum((stats?.excluded ?? 0) + (stats?.unmatched ?? 0) + (stats?.error ?? 0))}
              </Typography>
              <Typography variant="caption" color="text.secondary">제외 처리</Typography>
            </Box>
          </Stack>

          {/* 제외 경고 */}
          {((stats?.unmatched ?? 0) + (stats?.error ?? 0) + (stats?.locked ?? 0)) > 0 && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
              <AlertTitle sx={{ fontWeight: 700 }}>확정 시 제외되는 항목</AlertTitle>
              <Stack spacing={0.3}>
                {(stats?.unmatched ?? 0) > 0 && <Typography variant="body2">· 미매칭 거래처: {fmtNum(stats?.unmatched ?? 0)}건 (다음 업로드에서 처리)</Typography>}
                {(stats?.error ?? 0) > 0 && <Typography variant="body2">· 오류 행: {fmtNum(stats?.error ?? 0)}건 (원본 파일 수정 필요)</Typography>}
                {(stats?.locked ?? 0) > 0 && <Typography variant="body2">· 마감 처리된 행: {fmtNum(stats?.locked ?? 0)}건</Typography>}
              </Stack>
            </Alert>
          )}

          {/* 실제 반영 전표 */}
          <Paper sx={{
            p: 2, borderRadius: 2,
            bgcolor: alpha(theme.palette.success.main, 0.04),
            border: '2px solid', borderColor: alpha(theme.palette.success.main, 0.35),
          }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="subtitle2" fontWeight={700} color="success.dark">실제 반영될 전표 수</Typography>
                <Typography variant="caption" color="text.secondary">
                  신규 {fmtNum(stats?.new ?? 0)}건 + 변경 {fmtNum(stats?.update ?? 0)}건이 전표에 반영됩니다
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={800} color="success.main">
                {fmtNum((stats?.new ?? 0) + (stats?.update ?? 0))}건
              </Typography>
            </Stack>
          </Paper>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setConfirmModalOpen(false)}
            variant="outlined"
            disabled={confirming}
            sx={{ flex: 1 }}
          >
            취소
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={() => { setConfirmModalOpen(false); handleConfirm(); }}
            disabled={confirming}
            startIcon={confirming ? <CircularProgress size={18} color="inherit" /> : <VerifiedIcon />}
            sx={{ flex: 2, fontWeight: 700, boxShadow: 3 }}
          >
            {confirming ? '확정 중...' : '확정 확인'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ════════════════════════════════════════
          하단: 이전 작업 내역
         ════════════════════════════════════════ */}
      <Collapse in={showHistory}>
        <Paper elevation={0} sx={{ mt: 4, p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={700}>
              <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              이전 작업 내역
            </Typography>
            <IconButton size="small" onClick={loadHistory}><RefreshIcon /></IconButton>
          </Stack>

          {historyLoading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : historyJobs.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">이전 작업 내역이 없습니다</Typography>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                      <TableCell sx={{ fontWeight: 700 }}>등록일시</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>타입</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>파일명</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>작업자</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">상태</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>결과</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {historyJobs.map((job) => (
                      <TableRow
                        key={job.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => router.push(`/settlement/upload/jobs?id=${job.id}`)}
                      >
                        <TableCell sx={{ fontSize: '0.8rem' }}>{formatKST(job.created_at)}</TableCell>
                        <TableCell>
                          <Chip
                            label={job.job_type.includes('SALES') ? '판매' : '매입'}
                            size="small"
                            color={job.job_type.includes('SALES') ? 'primary' : 'secondary'}
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', maxWidth: 200 }}>
                          <Typography variant="body2" noWrap>{job.original_filename}</Typography>
                        </TableCell>
                        <TableCell>
                          {job.created_by_name && (
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Avatar sx={{ width: 22, height: 22, fontSize: '0.65rem', bgcolor: getAvatarColor(job.created_by_name) }}>
                                {getInitials(job.created_by_name)}
                              </Avatar>
                              <Typography variant="caption">{job.created_by_name}</Typography>
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={job.is_confirmed ? '확정' : job.status === 'SUCCEEDED' ? '완료' : job.status === 'FAILED' ? '실패' : '진행중'}
                            size="small"
                            color={job.is_confirmed ? 'success' : job.status === 'SUCCEEDED' ? 'info' : job.status === 'FAILED' ? 'error' : 'warning'}
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>
                          {job.result_summary && (
                            <Stack direction="row" spacing={0.5}>
                              {(job.result_summary.new_count ?? 0) > 0 && <Chip label={`신규 ${job.result_summary.new_count}`} size="small" color="success" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />}
                              {(job.result_summary.update_count ?? 0) > 0 && <Chip label={`변경 ${job.result_summary.update_count}`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />}
                              {(job.result_summary.error_count ?? 0) > 0 && <Chip label={`오류 ${job.result_summary.error_count}`} size="small" color="error" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />}
                            </Stack>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={historyTotal}
                page={historyPage}
                onPageChange={(_, p) => setHistoryPage(p)}
                rowsPerPage={10}
                rowsPerPageOptions={[10]}
                labelRowsPerPage=""
              />
            </>
          )}
        </Paper>
      </Collapse>
    </Box>
  );
}
