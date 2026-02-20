'use client';

/**
 * 업로드 작업 내역 (Job History) - Premium UX
 * 
 * 주요 기능:
 * - 체크박스 선택 → 일괄 삭제
 * - 행 클릭 → 상세 드로어 (오류/미매칭/신규/변경 탭)
 * - 결과 요약 Chip 클릭 → 해당 탭으로 바로 이동
 * - 확정 (confirm) 버튼으로 전표 반영
 * - 진행중 작업 자동 새로고침 (3초)
 * - KST 시간대 자동 변환
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, IconButton, Tooltip,
  Stack, alpha, useTheme, LinearProgress, Button, Checkbox,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Drawer, Tabs, Tab, Divider, Alert, AlertTitle, CircularProgress,
  TableSortLabel, Autocomplete, TextField, FormControl, InputLabel,
  Select, MenuItem, Collapse,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  PlayArrow as RunningIcon,
  ArrowBack as ArrowBackIcon,
  Close as CloseIcon,
  CloudUpload as UploadIcon,
  CheckCircleOutline as ConfirmIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  LinkOff as UnmatchedIcon,
  Block as BlockIcon,
  FiberNew as NewIcon,
  Edit as EditIcon,
  RemoveCircleOutline as ExcludedIcon,
  PersonAdd as PersonAddIcon,
  Link as LinkIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  PlaylistAddCheck as BatchIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { useRouter } from 'next/navigation';

// ─── 타입 ───
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
}

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

interface JobDetail {
  id: string;
  job_type: string;
  status: string;
  progress: number;
  original_filename: string;
  result_summary: UploadJob['result_summary'];
  error_message: string | null;
  is_reviewed: boolean;
  is_confirmed: boolean;
  created_at: string;
  completed_at: string | null;
  confirmed_at: string | null;
  preview_rows: PreviewRow[];
  unmatched_counterparties: string[];
}

// ─── 상태 매핑 ───
function getStatusInfo(status: string): { label: string; color: 'default' | 'warning' | 'success' | 'error' | 'info'; icon: React.ReactNode } {
  const s = status.toLowerCase();
  switch (s) {
    case 'queued':    return { label: '대기중', color: 'default', icon: <PendingIcon sx={{ fontSize: 16 }} /> };
    case 'running':   return { label: '처리중', color: 'info',    icon: <RunningIcon sx={{ fontSize: 16 }} /> };
    case 'succeeded': return { label: '완료',   color: 'success', icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> };
    case 'failed':    return { label: '실패',   color: 'error',   icon: <ErrorIcon sx={{ fontSize: 16 }} /> };
    default:          return { label: status,    color: 'default', icon: null };
  }
}

function isActiveStatus(s: string) { const v = s.toLowerCase(); return v === 'queued' || v === 'running'; }
function isRunning(s: string) { return s.toLowerCase() === 'running'; }
function isSucceeded(s: string) { return s.toLowerCase() === 'succeeded'; }
function isFailed(s: string) { return s.toLowerCase() === 'failed'; }

// ─── KST 시간 포맷 ───
function formatKST(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  let dateStr = isoStr;
  if (dateStr.includes('T') && !dateStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dateStr)) dateStr += 'Z';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return isoStr; }
}

function getJobTypeLabel(jobType: string): { label: string; color: 'primary' | 'secondary' } {
  if (jobType.toLowerCase().includes('sales')) return { label: '판매', color: 'primary' };
  if (jobType.toLowerCase().includes('purchase')) return { label: '매입', color: 'secondary' };
  return { label: jobType, color: 'primary' };
}

// ─── 프리뷰 상태별 라벨/색상 ───
const ROW_STATUS_CONFIG: Record<string, { label: string; color: 'success' | 'info' | 'warning' | 'error' | 'default'; icon: React.ReactNode }> = {
  new:        { label: '신규',   color: 'success', icon: <NewIcon sx={{ fontSize: 14 }} /> },
  update:     { label: '변경',   color: 'info',    icon: <EditIcon sx={{ fontSize: 14 }} /> },
  unchanged:  { label: '동일',   color: 'default',  icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
  conflict:   { label: '충돌',   color: 'warning', icon: <WarningIcon sx={{ fontSize: 14 }} /> },
  locked:     { label: '마감',   color: 'error',   icon: <BlockIcon sx={{ fontSize: 14 }} /> },
  unmatched:  { label: '미매칭', color: 'warning', icon: <UnmatchedIcon sx={{ fontSize: 14 }} /> },
  error:      { label: '오류',   color: 'error',   icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
  excluded:   { label: '제외',   color: 'default', icon: <ExcludedIcon sx={{ fontSize: 14 }} /> },
};

// ─── 탭 정의 ───
const DETAIL_TABS = [
  { key: 'all',       label: '전체',   statuses: null },
  { key: 'new',       label: '신규',   statuses: ['new'] },
  { key: 'update',    label: '변경',   statuses: ['update'] },
  { key: 'error',     label: '오류',   statuses: ['error', 'locked'] },
  { key: 'unmatched', label: '미매칭', statuses: ['unmatched'] },
  { key: 'conflict',  label: '충돌',   statuses: ['conflict'] },
  { key: 'excluded',  label: '제외',   statuses: ['excluded'] },
];

// ─── 필드 한글명 매핑 ───
const FIELD_LABELS: Record<string, string> = {
  trade_date: '거래일', counterparty_name: '거래처', voucher_number: '전표번호',
  quantity: '수량', purchase_cost: '매입원가', deduction_amount: '차감금액',
  actual_purchase_price: '실매입가', avg_unit_price: '평균가',
  purchase_deduction: '매입차감', as_cost: 'A/S비용', sale_amount: '판매금액',
  sale_deduction: '판매차감', actual_sale_price: '실판매가',
  actual_purchase_price_x: '실매입가', profit: '손익', profit_rate: '수익율',
  avg_margin: '평균마진', upm_settlement_status: '정산현황', payment_info: '송금정보', memo: '비고',
};

export default function UploadJobsPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const router = useRouter();

  // ─── 리스트 상태 ───
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // ─── 상세 드로어 상태 ───
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [confirming, setConfirming] = useState(false);

  // ─── 거래처 매핑 모달 상태 ───
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [mappingUnmatched, setMappingUnmatched] = useState<string[]>([]);
  const [mappingJobId, setMappingJobId] = useState<string | null>(null);
  const [existingCounterparties, setExistingCounterparties] = useState<{ id: string; name: string }[]>([]);
  const [mappingActions, setMappingActions] = useState<Record<string, { action: 'skip' | 'link' | 'create'; linkToId?: string }>>({});
  const [mappingLoading, setMappingLoading] = useState(false);
  const [batchRegistering, setBatchRegistering] = useState(false);
  const [batchResult, setBatchResult] = useState<{ created_count: number; skipped_count: number; created: { id: string; name: string }[]; skipped: { name: string; reason: string }[] } | null>(null);
  const [showSkippedDetails, setShowSkippedDetails] = useState(false);

  // ─── 확인 다이얼로그 상태 (공통) ───
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    cautions: string[];
    confirmLabel: string;
    confirmColor: 'primary' | 'error' | 'warning' | 'success' | 'info';
    onConfirm: () => void;
  }>({
    open: false, title: '', description: '', cautions: [], confirmLabel: '확인', confirmColor: 'primary', onConfirm: () => {},
  });

  const openConfirmDialog = (opts: Omit<typeof confirmDialog, 'open'>) => {
    setConfirmDialog({ ...opts, open: true });
  };
  const closeConfirmDialog = () => setConfirmDialog((prev) => ({ ...prev, open: false }));

  // ─── 데이터 로드 ───
  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.listUploadJobs({ page: page + 1, page_size: pageSize });
      const data = res.data as unknown as { jobs: UploadJob[]; total: number };
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
      setAutoRefresh((data.jobs || []).some((j) => isActiveStatus(j.status)));
    } catch {
      enqueueSnackbar('작업 목록 로딩 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, enqueueSnackbar]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(loadJobs, 3000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadJobs]);

  // ─── 상세 로드 ───
  const loadJobDetail = useCallback(async (jobId: string, initialTab?: number) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setDetailTab(initialTab ?? 0);
    try {
      const res = await settlementApi.getUploadJob(jobId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (res.data as any)?.data ?? res.data;
      setJobDetail(d as JobDetail);
    } catch {
      enqueueSnackbar('작업 상세 조회 실패', { variant: 'error' });
      setDrawerOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, [enqueueSnackbar]);

  // ─── 확정 처리 ───
  const executeConfirm = async () => {
    if (!jobDetail) return;
    try {
      setConfirming(true);
      await settlementApi.confirmUploadJob(jobDetail.id, true);
      enqueueSnackbar('업로드가 확정되었습니다. 전표가 반영됩니다.', { variant: 'success' });
      setDrawerOpen(false);
      loadJobs();
    } catch {
      enqueueSnackbar('확정 처리에 실패했습니다', { variant: 'error' });
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirm = () => {
    if (!jobDetail) return;
    const unmatchedCount = jobDetail.result_summary?.unmatched_count ?? 0;
    const cautions = [
      '확정 후에는 되돌릴 수 없습니다.',
      '신규 및 변경 전표가 시스템에 즉시 반영됩니다.',
    ];
    if (unmatchedCount > 0) cautions.push(`미매칭 거래처 ${unmatchedCount}건은 확정에서 제외됩니다.`);
    openConfirmDialog({
      title: '업로드 확정',
      description: `"${jobDetail.original_filename}" 파일의 전표 데이터를 시스템에 반영합니다.`,
      cautions,
      confirmLabel: '확정 실행',
      confirmColor: 'primary',
      onConfirm: () => { closeConfirmDialog(); executeConfirm(); },
    });
  };

  // ─── 거래처 매핑 모달 열기 ───
  const handleOpenMapping = async () => {
    if (!jobDetail) return;
    setMappingDialogOpen(true);
    setMappingLoading(true);
    setBatchResult(null);
    setShowSkippedDetails(false);
    setMappingJobId(jobDetail.id);
    setMappingUnmatched(jobDetail.unmatched_counterparties);

    // 초기 액션: 모두 'create'로 설정 (일괄 등록 기본값)
    const actions: Record<string, { action: 'skip' | 'link' | 'create'; linkToId?: string }> = {};
    for (const name of jobDetail.unmatched_counterparties) {
      actions[name] = { action: 'create' };
    }
    setMappingActions(actions);

    // 기존 거래처 목록 로드
    try {
      const res = await settlementApi.listCounterparties({ page: 1, page_size: 200 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = res.data as any;
      const cps = (data?.counterparties ?? data?.data?.counterparties ?? []) as { id: string; name: string }[];
      setExistingCounterparties(cps.map((cp) => ({ id: cp.id, name: cp.name })));
    } catch {
      enqueueSnackbar('거래처 목록 로딩 실패', { variant: 'error' });
    } finally {
      setMappingLoading(false);
    }
  };

  // ─── 일괄 신규 등록 실행 ───
  const handleBatchRegister = async () => {
    // 'create' 액션인 항목만 수집
    const toCreate = Object.entries(mappingActions)
      .filter(([, v]) => v.action === 'create')
      .map(([name]) => ({ name, counterparty_type: 'both' }));

    if (toCreate.length === 0) {
      enqueueSnackbar('신규 등록할 거래처가 없습니다', { variant: 'warning' });
      return;
    }

    openConfirmDialog({
      title: `미매칭 거래처 ${toCreate.length}건 일괄 등록`,
      description: `아래 ${toCreate.length}건의 미매칭 거래처를 신규 거래처로 등록합니다. 등록 시 거래처명이 자동으로 별칭(매핑 키)으로도 등록되어, 이후 엑셀 업로드 시 자동 매칭됩니다.`,
      cautions: [
        `${toCreate.length}건의 거래처가 "매입/매출" 타입으로 등록됩니다.`,
        '이미 동일 이름의 거래처가 있으면 자동으로 건너뛰며 별칭만 보완합니다.',
        '등록 후에도 거래처 관리 페이지에서 개별 수정이 가능합니다.',
      ],
      confirmLabel: `${toCreate.length}건 일괄 등록`,
      confirmColor: 'primary',
      onConfirm: async () => {
        closeConfirmDialog();
        try {
          setBatchRegistering(true);
          const res = await settlementApi.batchCreateCounterparties(toCreate);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = (res.data as any)?.data ?? res.data;
          setBatchResult(result);
          enqueueSnackbar(`${result.created_count}건 등록 완료 / ${result.skipped_count}건 건너뜀`, {
            variant: result.created_count > 0 ? 'success' : 'info',
          });
          // 재매칭 API 호출 → Redis 미매칭 데이터 갱신 후 상세 새로고침
          if (mappingJobId) {
            try {
              const rematchRes = await settlementApi.rematchUploadJob(mappingJobId);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const rematchData = (rematchRes.data as any)?.data ?? rematchRes.data;
              enqueueSnackbar(
                `재매칭 완료: ${rematchData.rematched_count}건 매칭됨, ${rematchData.still_unmatched_count}건 미매칭 잔여`,
                { variant: rematchData.still_unmatched_count > 0 ? 'warning' : 'success' },
              );
            } catch {
              enqueueSnackbar('재매칭에 실패했습니다. 상세를 새로고침합니다.', { variant: 'warning' });
            }
            loadJobDetail(mappingJobId);
          }
        } catch {
          enqueueSnackbar('일괄 등록에 실패했습니다', { variant: 'error' });
        } finally {
          setBatchRegistering(false);
        }
      },
    });
  };

  // ─── 개별 매핑 (기존 거래처에 별칭 연결) ───
  const handleLinkMapping = async (aliasName: string, counterpartyId: string) => {
    try {
      await settlementApi.mapUnmatchedCounterparty(aliasName, { counterparty_id: counterpartyId });
      enqueueSnackbar(`"${aliasName}" 매핑 완료`, { variant: 'success' });
      // 해당 항목을 skip 상태로 변경
      setMappingActions((prev) => ({ ...prev, [aliasName]: { action: 'skip' } }));
      // 재매칭 API 호출 후 상세 새로고침
      if (mappingJobId) {
        try {
          await settlementApi.rematchUploadJob(mappingJobId);
        } catch { /* 재매칭 실패해도 계속 진행 */ }
        loadJobDetail(mappingJobId);
      }
    } catch {
      enqueueSnackbar('매핑에 실패했습니다', { variant: 'error' });
    }
  };

  const handleMappingActionChange = (name: string, action: 'skip' | 'link' | 'create') => {
    setMappingActions((prev) => ({ ...prev, [name]: { ...prev[name], action } }));
  };

  const createCount = Object.values(mappingActions).filter((v) => v.action === 'create').length;
  const linkCount = Object.values(mappingActions).filter((v) => v.action === 'link').length;
  const skipCount = Object.values(mappingActions).filter((v) => v.action === 'skip').length;

  // ─── 체크박스 핸들러 ───
  const deletableJobs = jobs.filter((j) => !isRunning(j.status));

  const handleSelectAll = (checked: boolean) => {
    setSelected(checked ? new Set(deletableJobs.map((j) => j.id)) : new Set());
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const isAllSelected = deletableJobs.length > 0 && deletableJobs.every((j) => selected.has(j.id));
  const isSomeSelected = selected.size > 0 && !isAllSelected;

  // ─── 일괄 삭제 ───
  const executeDelete = async () => {
    if (selected.size === 0) return;
    try {
      setDeleting(true);
      const ids = Array.from(selected);
      const res = await settlementApi.batchDeleteUploadJobs(ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = res.data as any;
      const cnt = data?.deleted_count ?? data?.data?.deleted_count ?? ids.length;
      enqueueSnackbar(`${cnt}건 삭제 완료`, { variant: 'success' });
      setSelected(new Set());
      loadJobs();
    } catch {
      enqueueSnackbar('삭제 실패', { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteConfirm = () => {
    if (selected.size === 0) return;
    const runningCount = selectedJobs.filter((j) => isRunning(j.status)).length;
    const cautions = [
      '삭제된 작업은 복구할 수 없습니다.',
      '관련 전표 미리보기 데이터도 함께 삭제됩니다.',
    ];
    if (runningCount > 0) cautions.push(`실행 중인 작업 ${runningCount}건은 삭제에서 자동으로 제외됩니다.`);
    openConfirmDialog({
      title: `업로드 작업 ${selected.size}건 삭제`,
      description: `선택한 ${selected.size}건의 업로드 작업을 삭제합니다.`,
      cautions,
      confirmLabel: `${selected.size}건 삭제`,
      confirmColor: 'error',
      onConfirm: () => { closeConfirmDialog(); executeDelete(); },
    });
  };

  // ─── Chip 클릭 시 상세 드로어의 해당 탭으로 이동 ───
  const handleChipClick = (jobId: string, tabKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tabIdx = DETAIL_TABS.findIndex((t) => t.key === tabKey);
    loadJobDetail(jobId, tabIdx >= 0 ? tabIdx : 0);
  };

  // ─── 드로어 내 필터된 행 ───
  const filteredPreviewRows = useMemo(() => {
    if (!jobDetail) return [];
    const tab = DETAIL_TABS[detailTab];
    if (!tab || !tab.statuses) return jobDetail.preview_rows;
    return jobDetail.preview_rows.filter((r) => tab.statuses!.includes(r.status));
  }, [jobDetail, detailTab]);

  // ─── 탭별 건수 ───
  const tabCounts = useMemo(() => {
    if (!jobDetail) return {};
    const counts: Record<string, number> = { all: jobDetail.preview_rows.length };
    for (const row of jobDetail.preview_rows) {
      counts[row.status] = (counts[row.status] || 0) + 1;
    }
    // error 탭은 error + locked
    counts['error_tab'] = (counts['error'] || 0) + (counts['locked'] || 0);
    return counts;
  }, [jobDetail]);

  // ─── 결과 요약 Chip 렌더링 (클릭 가능) ───
  const renderSummary = (job: UploadJob) => {
    if (isFailed(job.status) && job.error_message) {
      return (
        <Tooltip title={job.error_message} arrow>
          <Typography variant="caption" color="error.main" sx={{ maxWidth: 200, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.error_message}
          </Typography>
        </Tooltip>
      );
    }
    const s = job.result_summary;
    if (!s) {
      if (isActiveStatus(job.status)) return <Typography variant="caption" color="text.disabled">처리 대기중…</Typography>;
      return <Typography variant="caption" color="text.disabled">—</Typography>;
    }
    return (
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {s.total_rows != null && (
          <Chip label={`전체 ${s.total_rows}`} size="small" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'all', e)}
            sx={{ fontSize: '0.7rem', height: 20, cursor: 'pointer' }} />
        )}
        {(s.new_count ?? 0) > 0 && (
          <Chip label={`신규 ${s.new_count}`} size="small" color="success" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'new', e)}
            sx={{ fontSize: '0.7rem', height: 20, cursor: 'pointer' }} />
        )}
        {(s.update_count ?? 0) > 0 && (
          <Chip label={`변경 ${s.update_count}`} size="small" color="info" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'update', e)}
            sx={{ fontSize: '0.7rem', height: 20, cursor: 'pointer' }} />
        )}
        {(s.error_count ?? 0) > 0 && (
          <Chip label={`오류 ${s.error_count}`} size="small" color="error" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'error', e)}
            sx={{ fontSize: '0.7rem', height: 20, cursor: 'pointer' }} />
        )}
        {(s.unmatched_count ?? 0) > 0 && (
          <Chip label={`미매칭 ${s.unmatched_count}`} size="small" color="warning" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'unmatched', e)}
            sx={{ fontSize: '0.7rem', height: 20, cursor: 'pointer' }} />
        )}
        {(s.conflict_count ?? 0) > 0 && (
          <Chip label={`충돌 ${s.conflict_count}`} size="small" color="warning"
            onClick={(e) => handleChipClick(job.id, 'conflict', e)}
            sx={{ fontSize: '0.7rem', height: 20, cursor: 'pointer' }} />
        )}
        {(s.excluded_count ?? 0) > 0 && (
          <Chip label={`제외 ${s.excluded_count}`} size="small" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'excluded', e)}
            sx={{ fontSize: '0.7rem', height: 20, cursor: 'pointer' }} />
        )}
      </Stack>
    );
  };

  // ─── 선택된 작업 정보 ───
  const selectedJobs = jobs.filter((j) => selected.has(j.id));

  return (
    <Box>
      {/* ─── 헤더 ─── */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <IconButton size="small" onClick={() => router.back()}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={700}>업로드 작업 내역</Typography>
            <Typography variant="body2" color="text.secondary">
              행을 클릭하면 상세 결과를 확인할 수 있습니다. 결과 요약 칩을 클릭하면 해당 항목으로 바로 이동합니다.
              {autoRefresh && (
                <Chip label="자동 새로고침" size="small" color="info" variant="outlined"
                  sx={{ ml: 1, fontSize: '0.65rem', height: 18 }} />
              )}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          {selected.size > 0 && (
            <Button variant="contained" color="error" size="small" startIcon={<DeleteIcon />}
              onClick={handleDeleteConfirm}>
              {selected.size}건 삭제
            </Button>
          )}
          <Button variant="outlined" size="small" startIcon={<UploadIcon />}
            onClick={() => router.push('/settlement/upload/sales')}>
            전표 업로드
          </Button>
          <Tooltip title="새로고침">
            <IconButton onClick={loadJobs}><RefreshIcon /></IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* ─── 테이블 ─── */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.info.main, 0.04) }}>
              <TableCell padding="checkbox" sx={{ width: 42 }}>
                <Checkbox size="small" indeterminate={isSomeSelected} checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)} />
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: 155 }}>등록일시</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 60 }} align="center">타입</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>파일명</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, width: 90 }}>상태</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, width: 85 }}>진행률</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>결과 요약</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 155 }}>완료시간</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                  <CircularProgress size={24} sx={{ mr: 1 }} />
                  <Typography component="span" color="text.secondary">로딩 중...</Typography>
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                  <UploadIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">업로드 작업이 없습니다</Typography>
                  <Button size="small" sx={{ mt: 1 }} onClick={() => router.push('/settlement/upload/sales')}>
                    전표 업로드하기
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => {
                const typeInfo = getJobTypeLabel(job.job_type);
                const statusInfo = getStatusInfo(job.status);
                const canSelect = !isRunning(job.status);
                const isChecked = selected.has(job.id);
                const canViewDetail = isSucceeded(job.status) || isFailed(job.status);

                return (
                  <TableRow
                    key={job.id}
                    hover
                    selected={isChecked}
                    onClick={() => canViewDetail && loadJobDetail(job.id)}
                    sx={{
                      cursor: canViewDetail ? 'pointer' : 'default',
                      bgcolor: isFailed(job.status) ? alpha(theme.palette.error.main, 0.02) : 'transparent',
                      '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                    }}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox size="small" checked={isChecked} disabled={!canSelect}
                        onChange={(e) => handleSelectOne(job.id, e.target.checked)} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatKST(job.created_at)}</TableCell>
                    <TableCell align="center">
                      <Chip label={typeInfo.label} size="small" color={typeInfo.color} variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={job.original_filename} arrow>
                        <Typography variant="body2" noWrap>{job.original_filename}</Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Chip icon={statusInfo.icon as React.ReactElement} label={statusInfo.label} size="small"
                        color={statusInfo.color} sx={{ fontWeight: 600 }} />
                    </TableCell>
                    <TableCell align="center">
                      {isActiveStatus(job.status) ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <LinearProgress variant={job.progress > 0 ? 'determinate' : 'indeterminate'} value={job.progress}
                            sx={{ flex: 1, height: 6, borderRadius: 1 }} />
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 32, textAlign: 'right' }}>
                            {job.progress}%
                          </Typography>
                        </Box>
                      ) : isSucceeded(job.status) ? (
                        <Typography variant="caption" color="success.main" fontWeight={600}>100%</Typography>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>{renderSummary(job)}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatKST(job.completed_at)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination component="div" count={total} page={page}
          onPageChange={(_, p) => setPage(p)} rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="페이지당 행:" />
      </TableContainer>

      {/* ═══════════════════════════════════════════════════════════════════════
          상세 드로어 (Drawer)
          ═══════════════════════════════════════════════════════════════════════ */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', md: '70%', lg: '60%' }, maxWidth: 1000 } }}
      >
        {detailLoading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : jobDetail ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 드로어 헤더 */}
            <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                    <Chip label={getJobTypeLabel(jobDetail.job_type).label} size="small"
                      color={getJobTypeLabel(jobDetail.job_type).color} variant="outlined" />
                    <Chip icon={getStatusInfo(jobDetail.status).icon as React.ReactElement}
                      label={getStatusInfo(jobDetail.status).label} size="small"
                      color={getStatusInfo(jobDetail.status).color} sx={{ fontWeight: 600 }} />
                    {jobDetail.is_confirmed && (
                      <Chip icon={<ConfirmIcon sx={{ fontSize: 14 }} />} label="확정됨" size="small"
                        color="success" variant="filled" sx={{ fontWeight: 600 }} />
                    )}
                  </Stack>
                  <Typography variant="h6" fontWeight={700} noWrap>{jobDetail.original_filename}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatKST(jobDetail.created_at)} → {formatKST(jobDetail.completed_at)}
                  </Typography>
                </Box>
                <IconButton onClick={() => setDrawerOpen(false)}><CloseIcon /></IconButton>
              </Stack>

              {/* 요약 통계 */}
              {jobDetail.result_summary && (
                <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                  <StatBox label="전체" count={jobDetail.result_summary.total_rows ?? 0} color={theme.palette.text.primary} />
                  <StatBox label="신규" count={jobDetail.result_summary.new_count ?? 0} color={theme.palette.success.main} />
                  <StatBox label="변경" count={jobDetail.result_summary.update_count ?? 0} color={theme.palette.info.main} />
                  <StatBox label="오류" count={jobDetail.result_summary.error_count ?? 0} color={theme.palette.error.main} />
                  <StatBox label="미매칭" count={jobDetail.result_summary.unmatched_count ?? 0} color={theme.palette.warning.main} />
                  <StatBox label="충돌" count={jobDetail.result_summary.conflict_count ?? 0} color={theme.palette.warning.dark} />
                  <StatBox label="제외" count={jobDetail.result_summary.excluded_count ?? 0} color={theme.palette.text.disabled} />
                </Stack>
              )}
            </Box>

            {/* 안내 메시지 (확정 전) */}
            {isSucceeded(jobDetail.status) && !jobDetail.is_confirmed && (
              <Alert severity="info" sx={{ mx: 2.5, mt: 2, borderRadius: 2 }}
                action={
                  <Button color="inherit" size="small" variant="outlined" onClick={handleConfirm} disabled={confirming}
                    startIcon={confirming ? <CircularProgress size={14} /> : <ConfirmIcon />}>
                    {confirming ? '처리중...' : '업로드 확정'}
                  </Button>
                }>
                <AlertTitle sx={{ fontWeight: 700 }}>확정 대기 중</AlertTitle>
                아래 데이터를 확인 후 &quot;업로드 확정&quot; 버튼을 클릭하면 전표가 시스템에 반영됩니다.
                {(jobDetail.result_summary?.unmatched_count ?? 0) > 0 && (
                  <Box sx={{ mt: 0.5 }}>
                    <Typography variant="caption" display="block" color="warning.main">
                      ⚠ 미매칭 거래처 {jobDetail.result_summary?.unmatched_count}건은 확정 시 제외됩니다.
                    </Typography>
                    <Button size="small" variant="text" color="warning" startIcon={<PersonAddIcon />}
                      onClick={handleOpenMapping} sx={{ mt: 0.5, fontSize: '0.75rem' }}>
                      거래처 매핑으로 해결하기
                    </Button>
                  </Box>
                )}
              </Alert>
            )}

            {isSucceeded(jobDetail.status) && jobDetail.is_confirmed && (
              <Alert severity="success" sx={{ mx: 2.5, mt: 2, borderRadius: 2 }}>
                <AlertTitle sx={{ fontWeight: 700 }}>확정 완료</AlertTitle>
                {formatKST(jobDetail.confirmed_at)}에 확정되었습니다. 전표가 시스템에 반영되었습니다.
              </Alert>
            )}

            {isFailed(jobDetail.status) && jobDetail.error_message && (
              <Alert severity="error" sx={{ mx: 2.5, mt: 2, borderRadius: 2 }}>
                <AlertTitle sx={{ fontWeight: 700 }}>처리 실패</AlertTitle>
                {jobDetail.error_message}
              </Alert>
            )}

            {/* 미매칭 거래처 목록 */}
            {jobDetail.unmatched_counterparties.length > 0 && (
              <Alert severity="warning" sx={{ mx: 2.5, mt: 1.5, borderRadius: 2 }}
                action={
                  <Button color="inherit" size="small" variant="outlined"
                    startIcon={<PersonAddIcon />}
                    onClick={handleOpenMapping}>
                    거래처 매핑
                  </Button>
                }>
                <AlertTitle sx={{ fontWeight: 700 }}>미매칭 거래처 {jobDetail.unmatched_counterparties.length}곳</AlertTitle>
                <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>
                  {jobDetail.unmatched_counterparties.slice(0, 10).join(', ')}
                  {jobDetail.unmatched_counterparties.length > 10 && ` 외 ${jobDetail.unmatched_counterparties.length - 10}곳`}
                </Typography>
              </Alert>
            )}

            {/* 탭 */}
            <Tabs value={detailTab} onChange={(_, v) => setDetailTab(v)}
              variant="scrollable" scrollButtons="auto"
              sx={{ px: 2.5, mt: 1.5, borderBottom: '1px solid', borderColor: 'divider', minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
              {DETAIL_TABS.map((tab, i) => {
                const count = tab.key === 'all' ? tabCounts['all']
                  : tab.key === 'error' ? tabCounts['error_tab']
                  : tabCounts[tab.statuses?.[0] ?? ''] ?? 0;
                return (
                  <Tab key={tab.key} label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span>{tab.label}</span>
                      {count > 0 && <Chip label={count} size="small" sx={{ height: 18, fontSize: '0.65rem', minWidth: 28 }} />}
                    </Stack>
                  } value={i} />
                );
              })}
            </Tabs>

            {/* 데이터 테이블 */}
            <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 1.5 }}>
              {filteredPreviewRows.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <InfoIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">해당 항목이 없습니다</Typography>
                </Box>
              ) : (
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, width: 40, bgcolor: 'background.paper' }}>#</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 65, bgcolor: 'background.paper' }}>상태</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 90, bgcolor: 'background.paper' }}>거래일</TableCell>
                        <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>거래처</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 75, bgcolor: 'background.paper' }}>전표번호</TableCell>
                        <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>상세</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredPreviewRows.slice(0, 200).map((row, i) => {
                        const cfg = ROW_STATUS_CONFIG[row.status] || ROW_STATUS_CONFIG['error'];
                        return (
                          <TableRow key={i} sx={{
                            bgcolor: row.status === 'error' ? alpha(theme.palette.error.main, 0.03)
                              : row.status === 'unmatched' ? alpha(theme.palette.warning.main, 0.03)
                              : row.status === 'excluded' ? alpha(theme.palette.action.disabled, 0.04)
                              : 'transparent',
                          }}>
                            <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{row.row_index + 1}</TableCell>
                            <TableCell>
                              <Chip icon={cfg.icon as React.ReactElement} label={cfg.label} size="small"
                                color={cfg.color} variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{row.trade_date || '—'}</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                                {row.counterparty_name || '—'}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>{row.voucher_number || '—'}</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem' }}>
                              {row.error && (
                                <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                                  {row.error}
                                </Typography>
                              )}
                              {row.diff && row.diff.changes && (
                                <Stack spacing={0.2}>
                                  {row.diff.changes.map((c, ci) => (
                                    <Typography key={ci} variant="caption" color="info.main">
                                      {FIELD_LABELS[c.field] || c.field}: {c.old ?? '(없음)'} → {c.new ?? '(없음)'}
                                    </Typography>
                                  ))}
                                </Stack>
                              )}
                              {!row.error && !row.diff && row.status === 'new' && (
                                <Typography variant="caption" color="success.main">신규 전표</Typography>
                              )}
                              {!row.error && !row.diff && row.status === 'unchanged' && (
                                <Typography variant="caption" color="text.disabled">변경 없음</Typography>
                              )}
                              {row.status === 'excluded' && (
                                <Typography variant="caption" color="text.disabled">합계/소계 행 (자동 제외)</Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredPreviewRows.length > 200 && (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 2 }}>
                            <Typography variant="caption" color="text.secondary">
                              …외 {filteredPreviewRows.length - 200}건 (전체 {filteredPreviewRows.length}건 중 200건 표시)
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </Box>
        ) : null}
      </Drawer>

      {/* ═══════════════════════════════════════════════════════════════════════
          공통 확인 다이얼로그 (프리미엄)
          ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={confirmDialog.open}
        onClose={closeConfirmDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
          },
        }}
      >
        {/* 상단 색상 바 */}
        <Box sx={{
          height: 4,
          bgcolor: confirmDialog.confirmColor === 'error' ? 'error.main'
            : confirmDialog.confirmColor === 'warning' ? 'warning.main'
            : confirmDialog.confirmColor === 'info' ? 'info.main'
            : confirmDialog.confirmColor === 'success' ? 'success.main'
            : 'primary.main',
        }} />
        <DialogTitle sx={{ pt: 2.5, pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{
              width: 40, height: 40, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: confirmDialog.confirmColor === 'error' ? alpha(theme.palette.error.main, 0.1)
                : confirmDialog.confirmColor === 'warning' ? alpha(theme.palette.warning.main, 0.1)
                : confirmDialog.confirmColor === 'info' ? alpha(theme.palette.info.main, 0.1)
                : alpha(theme.palette.primary.main, 0.1),
            }}>
              {confirmDialog.confirmColor === 'error' ? <WarningIcon color="error" />
                : confirmDialog.confirmColor === 'warning' ? <WarningIcon color="warning" />
                : confirmDialog.confirmColor === 'info' ? <InfoIcon color="info" />
                : <ConfirmIcon color="primary" />}
            </Box>
            <Typography variant="h6" fontWeight={700}>{confirmDialog.title}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {confirmDialog.description}
          </Typography>
          {confirmDialog.cautions.length > 0 && (
            <Paper variant="outlined" sx={{
              p: 2, borderRadius: 2, borderColor: 'divider',
              bgcolor: alpha(theme.palette.warning.main, 0.03),
            }}>
              <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
                <WarningIcon sx={{ fontSize: 16, color: 'warning.main', mt: 0.2 }} />
                <Typography variant="caption" fontWeight={700} color="warning.dark">주의사항</Typography>
              </Stack>
              {confirmDialog.cautions.map((caution, idx) => (
                <Stack key={idx} direction="row" spacing={1} alignItems="flex-start" sx={{ ml: 3, mb: 0.3 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    •  {caution}
                  </Typography>
                </Stack>
              ))}
            </Paper>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
          <Button onClick={closeConfirmDialog} color="inherit" sx={{ fontWeight: 600, mr: 1 }}>
            취소
          </Button>
          <Button
            onClick={confirmDialog.onConfirm}
            color={confirmDialog.confirmColor}
            variant="contained"
            sx={{ fontWeight: 700, px: 3, borderRadius: 2 }}
            disabled={deleting || confirming}
            startIcon={(deleting || confirming) ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {(deleting || confirming) ? '처리중...' : confirmDialog.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════
          거래처 매핑 모달 (미매칭 거래처 일괄 등록 / 개별 매핑)
          ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={mappingDialogOpen}
        onClose={() => !batchRegistering && setMappingDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '85vh' } }}
      >
        {/* 상단 강조 바 */}
        <Box sx={{ height: 4, bgcolor: 'warning.main' }} />
        <DialogTitle sx={{ pt: 2.5, pb: 1 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ width: 40, height: 40, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(theme.palette.warning.main, 0.1) }}>
                <PersonAddIcon color="warning" />
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={700}>미매칭 거래처 매핑</Typography>
                <Typography variant="caption" color="text.secondary">
                  총 {mappingUnmatched.length}건의 미매칭 거래처를 처리합니다
                </Typography>
              </Box>
            </Stack>
            <IconButton onClick={() => !batchRegistering && setMappingDialogOpen(false)} disabled={batchRegistering}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ pt: 1, px: 3 }}>
          {/* 안내 문구 */}
          <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2 }}>
            <AlertTitle sx={{ fontWeight: 700, fontSize: '0.85rem' }}>거래처 매핑이란?</AlertTitle>
            <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.7 }}>
              엑셀에서 입력된 거래처명이 시스템에 등록되지 않은 경우 &quot;미매칭&quot;으로 분류됩니다.
              아래 방법으로 처리할 수 있습니다:
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1, ml: 1 }}>
              <Typography variant="caption" color="text.secondary">
                <strong>🆕 신규 등록</strong> — 해당 이름으로 거래처를 새로 생성하고, 자동으로 별칭(매칭 키)도 등록합니다.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>🔗 기존 연결</strong> — 이미 등록된 거래처에 별칭으로 연결합니다 (같은 거래처가 다른 이름인 경우).
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>⏭ 건너뛰기</strong> — 이번에는 처리하지 않습니다.
              </Typography>
            </Stack>
          </Alert>

          {/* 일괄 등록 결과 표시 */}
          {batchResult && (
            <Alert
              severity={batchResult.created_count > 0 ? 'success' : 'info'}
              sx={{ mb: 2.5, borderRadius: 2 }}
              action={
                <Button size="small" color="inherit" onClick={() => { setBatchResult(null); setMappingDialogOpen(false); }}>
                  닫기
                </Button>
              }
            >
              <AlertTitle sx={{ fontWeight: 700 }}>일괄 등록 결과</AlertTitle>
              <Typography variant="body2">
                ✅ {batchResult.created_count}건 신규 등록 완료 / ⏭ {batchResult.skipped_count}건 건너뜀
              </Typography>
              {batchResult.created.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" fontWeight={700}>등록된 거래처:</Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    {batchResult.created.map((c) => (
                      <Chip key={c.id} label={c.name} size="small" color="success" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                    ))}
                  </Stack>
                </Box>
              )}
              {batchResult.skipped.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setShowSkippedDetails((v) => !v)}
                    endIcon={showSkippedDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    sx={{ fontSize: '0.75rem', p: 0 }}
                  >
                    건너뛴 항목 {batchResult.skipped.length}건 상세
                  </Button>
                  <Collapse in={showSkippedDetails}>
                    <Stack spacing={0.3} sx={{ mt: 0.5 }}>
                      {batchResult.skipped.map((s, i) => (
                        <Typography key={i} variant="caption" color="text.secondary">
                          • {s.name}: {s.reason}
                        </Typography>
                      ))}
                    </Stack>
                  </Collapse>
                </Box>
              )}
            </Alert>
          )}

          {/* 요약 칩 */}
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Chip icon={<PersonAddIcon />} label={`신규 등록 ${createCount}건`}
              color="primary" size="small" variant={createCount > 0 ? 'filled' : 'outlined'} />
            <Chip icon={<LinkIcon />} label={`기존 연결 ${linkCount}건`}
              color="info" size="small" variant={linkCount > 0 ? 'filled' : 'outlined'} />
            <Chip label={`건너뛰기 ${skipCount}건`}
              size="small" variant="outlined" />
          </Stack>

          {/* 매핑 테이블 */}
          {mappingLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400, borderRadius: 1 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 200, bgcolor: 'background.paper' }}>미매칭 거래처명</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 130, bgcolor: 'background.paper' }}>액션</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>연결 대상 (기존 거래처)</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 80, bgcolor: 'background.paper' }} align="center">실행</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mappingUnmatched.map((name) => {
                    const action = mappingActions[name] ?? { action: 'create' };
                    return (
                      <TableRow key={name} sx={{
                        bgcolor: action.action === 'create' ? alpha(theme.palette.primary.main, 0.02)
                          : action.action === 'link' ? alpha(theme.palette.info.main, 0.02)
                          : 'transparent',
                      }}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 200 }}>
                            {name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <FormControl size="small" fullWidth>
                            <Select
                              value={action.action}
                              onChange={(e) => handleMappingActionChange(name, e.target.value as 'skip' | 'link' | 'create')}
                              sx={{ fontSize: '0.8rem', height: 32 }}
                            >
                              <MenuItem value="create">🆕 신규 등록</MenuItem>
                              <MenuItem value="link">🔗 기존 연결</MenuItem>
                              <MenuItem value="skip">⏭ 건너뛰기</MenuItem>
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
                              renderInput={(params) => <TextField {...params} placeholder="거래처 검색..." />}
                              sx={{ minWidth: 200 }}
                              noOptionsText="검색 결과 없음"
                            />
                          ) : action.action === 'create' ? (
                            <Typography variant="caption" color="primary.main">
                              &quot;{name}&quot; 이름으로 신규 거래처 생성
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="text.disabled">이번 처리에서 제외</Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {action.action === 'link' && action.linkToId && (
                            <Tooltip title={`"${name}" → 기존 거래처에 별칭으로 연결`}>
                              <IconButton size="small" color="info"
                                onClick={() => handleLinkMapping(name, action.linkToId!)}>
                                <LinkIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {mappingUnmatched.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ textAlign: 'center', py: 4 }}>
                        <CheckCircleIcon sx={{ fontSize: 32, color: 'success.main', mb: 1 }} />
                        <Typography color="text.secondary">미매칭 거래처가 없습니다!</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>

        <Divider />
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
            <Button size="small" variant="text"
              onClick={() => {
                const updated = { ...mappingActions };
                for (const name of mappingUnmatched) { updated[name] = { action: 'create' }; }
                setMappingActions(updated);
              }}
              startIcon={<BatchIcon />}
              sx={{ fontSize: '0.8rem' }}
            >
              전체 신규 등록
            </Button>
            <Button size="small" variant="text" color="inherit"
              onClick={() => {
                const updated = { ...mappingActions };
                for (const name of mappingUnmatched) { updated[name] = { action: 'skip' }; }
                setMappingActions(updated);
              }}
              sx={{ fontSize: '0.8rem' }}
            >
              전체 건너뛰기
            </Button>
          </Stack>
          <Button onClick={() => setMappingDialogOpen(false)} color="inherit" disabled={batchRegistering}>
            닫기
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleBatchRegister}
            disabled={batchRegistering || createCount === 0}
            startIcon={batchRegistering ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
            sx={{ fontWeight: 700, px: 3, borderRadius: 2 }}
          >
            {batchRegistering ? '등록 중...' : `신규 ${createCount}건 일괄 등록`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ─── 요약 통계 박스 ───
function StatBox({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 0.8, minWidth: 70, textAlign: 'center', borderRadius: 1.5 }}>
      <Typography variant="h6" fontWeight={800} sx={{ color, lineHeight: 1.2 }}>{count}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Paper>
  );
}
