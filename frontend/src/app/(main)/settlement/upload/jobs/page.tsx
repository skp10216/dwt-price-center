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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Tooltip,
  Stack, alpha, useTheme, LinearProgress, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Drawer, Tabs, Tab, Divider, Alert, AlertTitle, CircularProgress,
  Autocomplete, TextField, FormControl, InputLabel,
  Select, MenuItem, Collapse,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  Delete as DeleteIcon,
  PlayArrow as RunningIcon,
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
  Schedule as ScheduleIcon,
  Verified as VerifiedIcon,
  AccessTime as AccessTimeIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import Avatar from '@mui/material/Avatar';
import {
  AppPageContainer,
  AppPageHeader,
  AppDataTable,
  type AppColumnDef,
} from '@/components/ui';
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
  // 작업자 정보
  created_by?: string;
  created_by_name?: string | null;
  created_by_email?: string | null;
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
  // 작업자 정보
  created_by?: string;
  created_by_name?: string | null;
  created_by_email?: string | null;
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

// ─── 작업자 아바타 색상 (이름 해시 기반) ───
function getAvatarColor(name: string): string {
  const colors = [
    '#1976d2', '#388e3c', '#d32f2f', '#7b1fa2', '#1565c0',
    '#00838f', '#ef6c00', '#5d4037', '#455a64', '#6a1b9a',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ─── 작업자 이니셜 ───
function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function UploadJobsPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const router = useRouter();

  // ─── 리스트 상태 ───
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showOnlyConfirmed, setShowOnlyConfirmed] = useState(true);

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
      const hasActive = (data.jobs || []).some((j) => isActiveStatus(j.status));
      setAutoRefresh(hasActive);
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

  // ─── 확정 필터 ───
  // showOnlyConfirmed=true 시: 확정된 작업 + 실행 중/대기 중 작업만 표시 (위자드 진행 중 미확정 완료 작업은 숨김)
  const displayJobs = useMemo(() => {
    if (!showOnlyConfirmed) return jobs;
    return jobs.filter((j) => {
      // 실행 중/대기 중: 항상 표시
      if (isActiveStatus(j.status)) return true;
      // 실패: 항상 표시
      if (isFailed(j.status)) return true;
      // 성공: 확정된 것만 표시
      if (isSucceeded(j.status)) return j.is_confirmed;
      return true;
    });
  }, [jobs, showOnlyConfirmed]);

  const displayTotal = showOnlyConfirmed ? displayJobs.length : total;

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

  // ─── 체크박스 (AppDataTable이 처리) ───

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

  // ─── 판매/매입 각각 최신 확정 job ID ───
  const { latestSalesId, latestPurchaseId } = useMemo(() => {
    const confirmed = jobs.filter((j) => j.is_confirmed);
    const salesLatest = confirmed
      .filter((j) => j.job_type.toLowerCase().includes('sales'))
      .sort((a, b) => new Date(b.confirmed_at!).getTime() - new Date(a.confirmed_at!).getTime())[0];
    const purchaseLatest = confirmed
      .filter((j) => j.job_type.toLowerCase().includes('purchase'))
      .sort((a, b) => new Date(b.confirmed_at!).getTime() - new Date(a.confirmed_at!).getTime())[0];
    return { latestSalesId: salesLatest?.id ?? null, latestPurchaseId: purchaseLatest?.id ?? null };
  }, [jobs]);

  // ─── 컬럼 정의 ───
  const columns = useMemo<AppColumnDef<UploadJob>[]>(() => [
    {
      field: 'created_at',
      headerName: '등록일시',
      width: 155,
      renderCell: (row) => (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ whiteSpace: 'nowrap' }}>
          <AccessTimeIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
          <span>{formatKST(row.created_at)}</span>
        </Stack>
      ),
    },
    {
      field: 'job_type',
      headerName: '타입',
      width: 70,
      align: 'center',
      sortable: false,
      renderCell: (row) => {
        const typeInfo = getJobTypeLabel(row.job_type);
        return (
          <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
            <Chip label={typeInfo.label} size="small" color={typeInfo.color} variant="outlined" sx={{ fontWeight: 600 }} />
            {(row.id === latestSalesId || row.id === latestPurchaseId) && (
              <Chip label="최신" size="small" color="success" sx={{ fontWeight: 700 }} />
            )}
          </Stack>
        );
      },
    },
    {
      field: 'original_filename',
      headerName: '파일명',
      renderCell: (row) => (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ maxWidth: 200, overflow: 'hidden' }}>
          <Tooltip title={row.original_filename} arrow>
            <Typography variant="body2" noWrap fontWeight={500}>{row.original_filename}</Typography>
          </Tooltip>
          {row.is_confirmed && (
            <Chip icon={<VerifiedIcon sx={{ fontSize: '12px !important' }} />} label="확정"
              size="small" color="success" variant="filled"
              sx={{ fontWeight: 700, '& .MuiChip-icon': { ml: 0.5 } }} />
          )}
        </Stack>
      ),
    },
    {
      field: 'created_by_name',
      headerName: '작업자',
      width: 110,
      sortable: false,
      renderCell: (row) => (
        row.created_by_name ? (
          <Tooltip title={row.created_by_email || ''} arrow placement="top">
            <Stack direction="row" spacing={0.8} alignItems="center">
              <Avatar sx={{
                width: 26, height: 26, fontSize: '0.7rem', fontWeight: 700,
                bgcolor: getAvatarColor(row.created_by_name),
              }}>
                {getInitials(row.created_by_name)}
              </Avatar>
              <Typography variant="caption" fontWeight={500} noWrap sx={{ maxWidth: 70 }}>
                {row.created_by_name}
              </Typography>
            </Stack>
          </Tooltip>
        ) : (
          <Typography variant="caption" color="text.disabled">—</Typography>
        )
      ),
    },
    {
      field: 'status',
      headerName: '상태',
      width: 90,
      align: 'center',
      sortable: false,
      renderCell: (row) => {
        const statusInfo = getStatusInfo(row.status);
        return (
          <Chip icon={statusInfo.icon as React.ReactElement} label={statusInfo.label} size="small"
            color={statusInfo.color} sx={{ fontWeight: 600 }} />
        );
      },
    },
    {
      field: 'progress',
      headerName: '진행률',
      width: 90,
      align: 'center',
      sortable: false,
      renderCell: (row) => (
        isActiveStatus(row.status) ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LinearProgress variant={row.progress > 0 ? 'determinate' : 'indeterminate'} value={row.progress}
              sx={{ flex: 1, height: 6, borderRadius: 1 }} />
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 32, textAlign: 'right' }}>
              {row.progress}%
            </Typography>
          </Box>
        ) : isSucceeded(row.status) ? (
          <Typography variant="caption" color="success.main" fontWeight={600}>100%</Typography>
        ) : (
          <Typography variant="caption" color="text.disabled">—</Typography>
        )
      ),
    },
    {
      field: 'result_summary',
      headerName: '결과 요약',
      sortable: false,
      renderCell: (row) => (
        <Box onClick={(e) => e.stopPropagation()}>{renderSummary(row)}</Box>
      ),
    },
    {
      field: 'completed_at',
      headerName: '완료시간',
      width: 155,
      renderCell: (row) => (
        <span style={{ whiteSpace: 'nowrap' }}>{formatKST(row.completed_at)}</span>
      ),
    },
  ], [latestSalesId, latestPurchaseId]);

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
            sx={{ cursor: 'pointer' }} />
        )}
        {(s.new_count ?? 0) > 0 && (
          <Chip label={`신규 ${s.new_count}`} size="small" color="success" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'new', e)}
            sx={{ cursor: 'pointer' }} />
        )}
        {(s.update_count ?? 0) > 0 && (
          <Chip label={`변경 ${s.update_count}`} size="small" color="info" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'update', e)}
            sx={{ cursor: 'pointer' }} />
        )}
        {(s.error_count ?? 0) > 0 && (
          <Chip label={`오류 ${s.error_count}`} size="small" color="error" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'error', e)}
            sx={{ cursor: 'pointer' }} />
        )}
        {(s.unmatched_count ?? 0) > 0 && (
          <Chip label={`미매칭 ${s.unmatched_count}`} size="small" color="warning" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'unmatched', e)}
            sx={{ cursor: 'pointer' }} />
        )}
        {(s.conflict_count ?? 0) > 0 && (
          <Chip label={`충돌 ${s.conflict_count}`} size="small" color="warning"
            onClick={(e) => handleChipClick(job.id, 'conflict', e)}
            sx={{ cursor: 'pointer' }} />
        )}
        {(s.excluded_count ?? 0) > 0 && (
          <Chip label={`제외 ${s.excluded_count}`} size="small" variant="outlined"
            onClick={(e) => handleChipClick(job.id, 'excluded', e)}
            sx={{ cursor: 'pointer' }} />
        )}
      </Stack>
    );
  };

  // ─── 선택된 작업 정보 ───
  const selectedJobs = jobs.filter((j) => selected.has(j.id));

  // ─── 헤더 액션 ──────────────────────────────────────────────────────────────
  const headerActions = [
    ...(selected.size > 0 ? [{
      label: `${selected.size}건 삭제`,
      onClick: handleDeleteConfirm,
      variant: 'outlined' as const,
      color: 'error' as const,
      icon: <DeleteIcon />,
    }] : []),
    {
      label: '전표 업로드',
      onClick: () => router.push('/settlement/upload'),
      variant: 'outlined' as const,
      color: 'primary' as const,
      icon: <UploadIcon />,
    },
  ];

  return (
    <AppPageContainer>
      {/* 페이지 헤더 */}
      <AppPageHeader
        icon={<HistoryIcon />}
        title="업로드 작업 내역"
        description="행을 클릭하면 상세 결과를 확인합니다. 결과 요약 칩을 클릭하면 해당 탭으로 바로 이동합니다"
        color="primary"
        count={loading ? null : displayTotal}
        onRefresh={loadJobs}
        loading={loading}
        highlight
        chips={[
          ...(autoRefresh ? [
            <Chip key="auto" label="자동 새로고침" size="small" color="info" variant="outlined"
              sx={{ height: 20, fontSize: '0.68rem' }} />
          ] : []),
          <Chip
            key="filter"
            label={showOnlyConfirmed ? '확정만 보기' : '전체 보기'}
            size="small"
            color={showOnlyConfirmed ? 'primary' : 'default'}
            variant={showOnlyConfirmed ? 'filled' : 'outlined'}
            onClick={() => setShowOnlyConfirmed((v) => !v)}
            sx={{ height: 20, fontSize: '0.68rem', cursor: 'pointer' }}
          />,
        ]}
        actions={headerActions}
      />

      {/* 테이블 */}
      <AppDataTable<UploadJob>
        columns={columns}
        rows={displayJobs}
        getRowKey={(r) => r.id}
        defaultSortField="created_at"
        defaultSortOrder="desc"
        loading={loading}
        emptyMessage="업로드 작업이 없습니다"
        emptyIcon={<HistoryIcon sx={{ fontSize: 40, opacity: 0.4 }} />}
        count={displayTotal}
        page={page}
        rowsPerPage={pageSize}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
        selectable
        selected={selected}
        onSelectionChange={setSelected}
        isRowSelectable={(job) => !isRunning(job.status)}
        onRowClick={(job) => {
          if (isSucceeded(job.status) || isFailed(job.status)) loadJobDetail(job.id);
        }}
        getRowSx={(job) => {
          const canViewDetail = isSucceeded(job.status) || isFailed(job.status);
          const indicatorColor = isFailed(job.status) ? theme.palette.error.main
            : isSucceeded(job.status) && job.is_confirmed ? theme.palette.success.main
            : isSucceeded(job.status) ? theme.palette.info.main
            : isRunning(job.status) ? theme.palette.warning.main
            : 'transparent';
          return {
            cursor: canViewDetail ? 'pointer' : 'default',
            bgcolor: isFailed(job.status) ? alpha(theme.palette.error.main, 0.02) : 'transparent',
            transition: 'all 0.15s ease-in-out',
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              boxShadow: canViewDetail ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            },
            // 좌측 상태 인디케이터 — 첫 번째 셀의 borderLeft로 표시
            '& td:first-of-type': {
              borderLeft: `4px solid ${indicatorColor}`,
            },
          };
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          상세 드로어 (Drawer) - Premium Design
          ═══════════════════════════════════════════════════════════════════════ */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', md: '70%', lg: '60%' },
            maxWidth: 1000,
            bgcolor: 'background.default',
          },
        }}
      >
        {detailLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
            <CircularProgress size={40} />
            <Typography color="text.secondary">상세 정보 불러오는 중...</Typography>
          </Box>
        ) : jobDetail ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 드로어 헤더 - Gradient Background */}
            <Box sx={{
              p: 2.5,
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.info.main, 0.05)} 100%)`,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Chip label={getJobTypeLabel(jobDetail.job_type).label} size="small"
                      color={getJobTypeLabel(jobDetail.job_type).color} variant="filled"
                      sx={{ fontWeight: 700, borderRadius: 1.5 }} />
                    <Chip icon={getStatusInfo(jobDetail.status).icon as React.ReactElement}
                      label={getStatusInfo(jobDetail.status).label} size="small"
                      color={getStatusInfo(jobDetail.status).color}
                      sx={{ fontWeight: 600, borderRadius: 1.5 }} />
                    {jobDetail.is_confirmed && (
                      <Chip icon={<VerifiedIcon sx={{ fontSize: '14px !important' }} />} label="확정됨" size="small"
                        color="success" variant="filled"
                        sx={{ fontWeight: 700, borderRadius: 1.5, '& .MuiChip-icon': { ml: 0.5 } }} />
                    )}
                  </Stack>
                  <Typography variant="h5" fontWeight={800} noWrap sx={{ mb: 0.5 }}>{jobDetail.original_filename}</Typography>

                  {/* 작업자 정보 + 타임라인 */}
                  <Stack direction="row" spacing={3} alignItems="center" sx={{ mt: 1.5 }}>
                    {/* 작업자 */}
                    {jobDetail.created_by_name && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar sx={{
                          width: 32, height: 32, fontSize: '0.8rem', fontWeight: 700,
                          bgcolor: getAvatarColor(jobDetail.created_by_name),
                        }}>
                          {getInitials(jobDetail.created_by_name)}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{jobDetail.created_by_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{jobDetail.created_by_email}</Typography>
                        </Box>
                      </Stack>
                    )}

                    {/* 타임라인 */}
                    <Stack direction="row" spacing={2} alignItems="center" sx={{
                      px: 2, py: 0.8, borderRadius: 2,
                      bgcolor: alpha(theme.palette.background.paper, 0.6),
                      border: '1px solid',
                      borderColor: 'divider',
                    }}>
                      <Tooltip title="등록 시간" arrow>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <ScheduleIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">{formatKST(jobDetail.created_at)}</Typography>
                        </Stack>
                      </Tooltip>
                      {jobDetail.completed_at && (
                        <>
                          <Typography variant="caption" color="text.disabled">→</Typography>
                          <Tooltip title="완료 시간" arrow>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                              <Typography variant="caption" color="text.secondary">{formatKST(jobDetail.completed_at)}</Typography>
                            </Stack>
                          </Tooltip>
                        </>
                      )}
                      {jobDetail.confirmed_at && (
                        <>
                          <Typography variant="caption" color="text.disabled">→</Typography>
                          <Tooltip title="확정 시간" arrow>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <VerifiedIcon sx={{ fontSize: 14, color: 'success.main' }} />
                              <Typography variant="caption" color="success.main" fontWeight={600}>{formatKST(jobDetail.confirmed_at)}</Typography>
                            </Stack>
                          </Tooltip>
                        </>
                      )}
                    </Stack>
                  </Stack>
                </Box>
                <IconButton onClick={() => setDrawerOpen(false)} sx={{ mt: -0.5 }}>
                  <CloseIcon />
                </IconButton>
              </Stack>

              {/* 요약 통계 - Premium Cards */}
              {jobDetail.result_summary && (
                <Stack direction="row" spacing={1.5} sx={{ mt: 2.5 }} flexWrap="wrap" useFlexGap>
                  <StatBoxPremium label="전체" count={jobDetail.result_summary.total_rows ?? 0} color={theme.palette.text.primary} icon={<InfoIcon />} />
                  <StatBoxPremium label="신규" count={jobDetail.result_summary.new_count ?? 0} color={theme.palette.success.main} icon={<NewIcon />} />
                  <StatBoxPremium label="변경" count={jobDetail.result_summary.update_count ?? 0} color={theme.palette.info.main} icon={<EditIcon />} />
                  <StatBoxPremium label="오류" count={jobDetail.result_summary.error_count ?? 0} color={theme.palette.error.main} icon={<ErrorIcon />} />
                  <StatBoxPremium label="미매칭" count={jobDetail.result_summary.unmatched_count ?? 0} color={theme.palette.warning.main} icon={<UnmatchedIcon />} />
                  <StatBoxPremium label="충돌" count={jobDetail.result_summary.conflict_count ?? 0} color={theme.palette.warning.dark} icon={<WarningIcon />} />
                  <StatBoxPremium label="제외" count={jobDetail.result_summary.excluded_count ?? 0} color={theme.palette.text.disabled} icon={<ExcludedIcon />} />
                </Stack>
              )}
            </Box>

            {/* 안내 메시지 (확정 전) - 액션 버튼은 하단 sticky bar로 이동 */}
            {isSucceeded(jobDetail.status) && !jobDetail.is_confirmed && (
              <Alert severity="info" sx={{ mx: 2.5, mt: 2, borderRadius: 2.5 }} icon={<InfoIcon />}>
                <AlertTitle sx={{ fontWeight: 700 }}>확정 대기 중</AlertTitle>
                아래 데이터를 확인 후 하단의 &quot;업로드 확정&quot; 버튼을 클릭하면 전표가 시스템에 반영됩니다.
                {(jobDetail.result_summary?.unmatched_count ?? 0) > 0 && (
                  <Typography variant="caption" display="block" color="warning.main" sx={{ mt: 0.5 }}>
                    ⚠ 미매칭 거래처 {jobDetail.result_summary?.unmatched_count}건은 확정 시 제외됩니다. 거래처 매핑을 먼저 처리하세요.
                  </Typography>
                )}
              </Alert>
            )}

            {isSucceeded(jobDetail.status) && jobDetail.is_confirmed && (
              <Alert severity="success" sx={{ mx: 2.5, mt: 2, borderRadius: 2.5 }} icon={<VerifiedIcon />}>
                <AlertTitle sx={{ fontWeight: 700 }}>확정 완료</AlertTitle>
                {formatKST(jobDetail.confirmed_at)}에 확정되었습니다. 전표가 시스템에 반영되었습니다.
              </Alert>
            )}

            {isFailed(jobDetail.status) && jobDetail.error_message && (
              <Alert severity="error" sx={{ mx: 2.5, mt: 2, borderRadius: 2.5 }}>
                <AlertTitle sx={{ fontWeight: 700 }}>처리 실패</AlertTitle>
                {jobDetail.error_message}
              </Alert>
            )}

            {/* 미매칭 거래처 목록 */}
            {jobDetail.unmatched_counterparties.length > 0 && !jobDetail.is_confirmed && (
              <Alert severity="warning" sx={{ mx: 2.5, mt: 1.5, borderRadius: 2.5 }} icon={<UnmatchedIcon />}>
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
            <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 1.5, pb: isSucceeded(jobDetail.status) && !jobDetail.is_confirmed ? 10 : 1.5 }}>
              {filteredPreviewRows.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Box sx={{
                    width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
                    bgcolor: alpha(theme.palette.info.main, 0.08),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <InfoIcon sx={{ fontSize: 32, color: 'info.main' }} />
                  </Box>
                  <Typography variant="h6" fontWeight={600} gutterBottom>해당 항목이 없습니다</Typography>
                  <Typography variant="body2" color="text.secondary">다른 탭을 선택해 보세요</Typography>
                </Box>
              ) : (
                <TableContainer component={Paper} elevation={0} sx={{
                  border: '1px solid', borderColor: 'divider', borderRadius: 2,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, width: 45, bgcolor: alpha(theme.palette.background.paper, 0.95), fontSize: '0.75rem', color: 'text.secondary' }}>#</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 70, bgcolor: alpha(theme.palette.background.paper, 0.95), fontSize: '0.75rem', color: 'text.secondary' }}>상태</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 95, bgcolor: alpha(theme.palette.background.paper, 0.95), fontSize: '0.75rem', color: 'text.secondary' }}>거래일</TableCell>
                        <TableCell sx={{ fontWeight: 700, bgcolor: alpha(theme.palette.background.paper, 0.95), fontSize: '0.75rem', color: 'text.secondary' }}>거래처</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 85, bgcolor: alpha(theme.palette.background.paper, 0.95), fontSize: '0.75rem', color: 'text.secondary' }}>전표번호</TableCell>
                        <TableCell sx={{ fontWeight: 700, bgcolor: alpha(theme.palette.background.paper, 0.95), fontSize: '0.75rem', color: 'text.secondary' }}>상세</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredPreviewRows.slice(0, 200).map((row, i) => {
                        const cfg = ROW_STATUS_CONFIG[row.status] || ROW_STATUS_CONFIG['error'];
                        return (
                          <TableRow key={i} sx={{
                            bgcolor: row.status === 'error' ? alpha(theme.palette.error.main, 0.04)
                              : row.status === 'unmatched' ? alpha(theme.palette.warning.main, 0.04)
                              : row.status === 'excluded' ? alpha(theme.palette.action.disabled, 0.05)
                              : row.status === 'new' ? alpha(theme.palette.success.main, 0.02)
                              : 'transparent',
                            transition: 'background-color 0.15s',
                            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                          }}>
                            <TableCell sx={{ color: 'text.secondary', fontWeight: 500 }}>{row.row_index + 1}</TableCell>
                            <TableCell>
                              <Chip icon={cfg.icon as React.ReactElement} label={cfg.label} size="small"
                                color={cfg.color} variant="filled" sx={{ fontWeight: 600 }} />
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.trade_date || '—'}</TableCell>
                            <TableCell>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 150, fontWeight: row.status === 'unmatched' ? 600 : 400 }}>
                                {row.counterparty_name || '—'}
                              </Typography>
                            </TableCell>
                            <TableCell>{row.voucher_number || '—'}</TableCell>
                            <TableCell>
                              {row.error && (
                                <Typography variant="caption" color="error.main" sx={{ display: 'block', fontWeight: 500 }}>
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
                                <Typography variant="caption" color="success.main" fontWeight={500}>신규 전표</Typography>
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

            {/* Sticky 액션 바 (확정 전) */}
            {isSucceeded(jobDetail.status) && !jobDetail.is_confirmed && (
              <Box sx={{
                position: 'sticky',
                bottom: 0,
                left: 0,
                right: 0,
                px: 2.5,
                py: 2,
                bgcolor: 'background.paper',
                borderTop: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
                zIndex: 10,
              }}>
                <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {(jobDetail.result_summary?.new_count ?? 0) + (jobDetail.result_summary?.update_count ?? 0)}건 반영 예정
                    </Typography>
                    {(jobDetail.result_summary?.unmatched_count ?? 0) > 0 && (
                      <Typography variant="caption" color="warning.main">
                        미매칭 {jobDetail.result_summary?.unmatched_count}건은 제외됩니다
                      </Typography>
                    )}
                  </Box>
                  <Stack direction="row" spacing={1.5}>
                    {(jobDetail.result_summary?.unmatched_count ?? 0) > 0 && (
                      <Button
                        variant="outlined"
                        color="warning"
                        startIcon={<PersonAddIcon />}
                        onClick={handleOpenMapping}
                        sx={{ borderRadius: 2, fontWeight: 600 }}
                      >
                        거래처 매핑
                      </Button>
                    )}
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={confirming ? <CircularProgress size={18} color="inherit" /> : <VerifiedIcon />}
                      onClick={handleConfirm}
                      disabled={confirming}
                      sx={{ borderRadius: 2, fontWeight: 700, px: 3, boxShadow: 2 }}
                    >
                      {confirming ? '처리중...' : '업로드 확정'}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            )}
          </Box>
        ) : null}
      </Drawer>

      {/* ═══════════════════════════════════════════════════════════════════════
          공통 확인 다이얼로그 (프리미엄 + 위험 작업 진동 애니메이션)
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
            // 위험 작업(error)일 때 진동 애니메이션
            ...(confirmDialog.confirmColor === 'error' && {
              animation: 'shakeDialog 0.5s ease-in-out',
              '@keyframes shakeDialog': {
                '0%, 100%': { transform: 'translateX(0)' },
                '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
                '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
              },
            }),
          },
        }}
      >
        {/* 상단 색상 바 */}
        <Box sx={{
          height: confirmDialog.confirmColor === 'error' ? 6 : 4,
          bgcolor: confirmDialog.confirmColor === 'error' ? 'error.main'
            : confirmDialog.confirmColor === 'warning' ? 'warning.main'
            : confirmDialog.confirmColor === 'info' ? 'info.main'
            : confirmDialog.confirmColor === 'success' ? 'success.main'
            : 'primary.main',
          transition: 'height 0.2s ease',
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
          거래처 매핑 모달 (미매칭 거래처 일괄 등록 / 개별 매핑) - Premium Design
          ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={mappingDialogOpen}
        onClose={() => !batchRegistering && setMappingDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            maxHeight: '85vh',
            bgcolor: 'background.default',
          },
        }}
      >
        {/* 상단 gradient 바 */}
        <Box sx={{
          height: 6,
          background: `linear-gradient(90deg, ${theme.palette.warning.main} 0%, ${theme.palette.primary.main} 100%)`,
        }} />
        <DialogTitle sx={{ pt: 2.5, pb: 1, bgcolor: alpha(theme.palette.warning.main, 0.03) }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{
                width: 44, height: 44, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: alpha(theme.palette.warning.main, 0.12),
                boxShadow: `0 2px 8px ${alpha(theme.palette.warning.main, 0.2)}`,
              }}>
                <PersonAddIcon sx={{ color: 'warning.main', fontSize: 24 }} />
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={800}>미매칭 거래처 매핑</Typography>
                <Typography variant="caption" color="text.secondary">
                  총 <strong>{mappingUnmatched.length}</strong>건의 미매칭 거래처를 처리합니다
                </Typography>
              </Box>
            </Stack>
            <IconButton onClick={() => !batchRegistering && setMappingDialogOpen(false)} disabled={batchRegistering}>
              <CloseIcon />
            </IconButton>
          </Stack>

          {/* 진행률 표시 */}
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">처리 진행률</Typography>
              <Typography variant="caption" fontWeight={600}>
                {skipCount}건 처리 완료 / {mappingUnmatched.length}건
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={mappingUnmatched.length > 0 ? (skipCount / mappingUnmatched.length) * 100 : 0}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${theme.palette.success.main} 0%, ${theme.palette.primary.main} 100%)`,
                },
              }}
            />
          </Box>
        </DialogTitle>

        <DialogContent sx={{ pt: 2, px: 3 }}>
          {/* 안내 문구 - 더 컴팩트하게 */}
          <Paper variant="outlined" sx={{
            p: 2, mb: 2.5, borderRadius: 2.5,
            borderColor: alpha(theme.palette.info.main, 0.3),
            bgcolor: alpha(theme.palette.info.main, 0.03),
          }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <InfoIcon sx={{ color: 'info.main', fontSize: 20, mt: 0.2 }} />
              <Box>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>거래처 매핑 방법</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <Typography variant="caption" color="text.secondary">
                    <Box component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>신규 등록</Box> — 새 거래처 생성
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    <Box component="span" sx={{ fontWeight: 700, color: 'info.main' }}>기존 연결</Box> — 기존 거래처에 별칭 추가
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    <Box component="span" sx={{ fontWeight: 700, color: 'text.disabled' }}>건너뛰기</Box> — 나중에 처리
                  </Typography>
                </Stack>
              </Box>
            </Stack>
          </Paper>

          {/* 일괄 등록 결과 표시 - 성공 애니메이션 */}
          {batchResult && (
            <Alert
              severity={batchResult.created_count > 0 ? 'success' : 'info'}
              sx={{
                mb: 2.5, borderRadius: 2.5,
                animation: 'fadeIn 0.3s ease-in-out',
                '@keyframes fadeIn': {
                  '0%': { opacity: 0, transform: 'translateY(-10px)' },
                  '100%': { opacity: 1, transform: 'translateY(0)' },
                },
              }}
              icon={batchResult.created_count > 0 ? <CheckCircleIcon /> : <InfoIcon />}
              action={
                <Button size="small" color="inherit" onClick={() => { setBatchResult(null); setMappingDialogOpen(false); }}
                  sx={{ fontWeight: 600 }}>
                  완료
                </Button>
              }
            >
              <AlertTitle sx={{ fontWeight: 700 }}>일괄 등록 결과</AlertTitle>
              <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={800} color="success.main">{batchResult.created_count}</Typography>
                  <Typography variant="caption">등록 완료</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={800} color="text.secondary">{batchResult.skipped_count}</Typography>
                  <Typography variant="caption">건너뜀</Typography>
                </Box>
              </Stack>
              {batchResult.created.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" fontWeight={700}>등록된 거래처:</Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    {batchResult.created.slice(0, 10).map((c) => (
                      <Chip key={c.id} label={c.name} size="small" color="success" variant="filled"
                        sx={{ fontSize: '0.7rem', height: 22, fontWeight: 600 }} />
                    ))}
                    {batchResult.created.length > 10 && (
                      <Chip label={`+${batchResult.created.length - 10}건`} size="small" variant="outlined"
                        sx={{ fontSize: '0.7rem', height: 22 }} />
                    )}
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

          {/* 요약 카드 - 프리미엄 스타일 */}
          <Stack direction="row" spacing={1.5} sx={{ mb: 2.5 }}>
            <Paper
              variant="outlined"
              sx={{
                flex: 1, p: 1.5, textAlign: 'center', borderRadius: 2,
                borderColor: createCount > 0 ? 'primary.main' : 'divider',
                bgcolor: createCount > 0 ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.06) },
              }}
              onClick={() => {
                const updated = { ...mappingActions };
                for (const name of mappingUnmatched) { updated[name] = { action: 'create' }; }
                setMappingActions(updated);
              }}
            >
              <PersonAddIcon sx={{ fontSize: 24, color: createCount > 0 ? 'primary.main' : 'text.disabled', mb: 0.5 }} />
              <Typography variant="h6" fontWeight={800} color={createCount > 0 ? 'primary.main' : 'text.disabled'}>
                {createCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">신규 등록</Typography>
            </Paper>
            <Paper
              variant="outlined"
              sx={{
                flex: 1, p: 1.5, textAlign: 'center', borderRadius: 2,
                borderColor: linkCount > 0 ? 'info.main' : 'divider',
                bgcolor: linkCount > 0 ? alpha(theme.palette.info.main, 0.04) : 'transparent',
              }}
            >
              <LinkIcon sx={{ fontSize: 24, color: linkCount > 0 ? 'info.main' : 'text.disabled', mb: 0.5 }} />
              <Typography variant="h6" fontWeight={800} color={linkCount > 0 ? 'info.main' : 'text.disabled'}>
                {linkCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">기존 연결</Typography>
            </Paper>
            <Paper
              variant="outlined"
              sx={{
                flex: 1, p: 1.5, textAlign: 'center', borderRadius: 2,
                borderColor: skipCount > 0 ? 'success.main' : 'divider',
                bgcolor: skipCount > 0 ? alpha(theme.palette.success.main, 0.04) : 'transparent',
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 24, color: skipCount > 0 ? 'success.main' : 'text.disabled', mb: 0.5 }} />
              <Typography variant="h6" fontWeight={800} color={skipCount > 0 ? 'success.main' : 'text.disabled'}>
                {skipCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">처리 완료</Typography>
            </Paper>
          </Stack>

          {/* 매핑 테이블 - Premium Design */}
          {mappingLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={32} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>거래처 목록 로딩 중...</Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{
              maxHeight: 350, borderRadius: 2,
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{
                      fontWeight: 700, width: 200, fontSize: '0.75rem', color: 'text.secondary',
                      bgcolor: alpha(theme.palette.background.paper, 0.95),
                    }}>미매칭 거래처명</TableCell>
                    <TableCell sx={{
                      fontWeight: 700, width: 140, fontSize: '0.75rem', color: 'text.secondary',
                      bgcolor: alpha(theme.palette.background.paper, 0.95),
                    }}>액션</TableCell>
                    <TableCell sx={{
                      fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary',
                      bgcolor: alpha(theme.palette.background.paper, 0.95),
                    }}>연결 대상 / 설명</TableCell>
                    <TableCell sx={{
                      fontWeight: 700, width: 70, fontSize: '0.75rem', color: 'text.secondary',
                      bgcolor: alpha(theme.palette.background.paper, 0.95),
                    }} align="center">실행</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mappingUnmatched.map((name) => {
                    const action = mappingActions[name] ?? { action: 'create' };
                    const isSkipped = action.action === 'skip';
                    return (
                      <TableRow key={name} sx={{
                        bgcolor: isSkipped ? alpha(theme.palette.success.main, 0.03)
                          : action.action === 'create' ? alpha(theme.palette.primary.main, 0.02)
                          : action.action === 'link' ? alpha(theme.palette.info.main, 0.02)
                          : 'transparent',
                        opacity: isSkipped ? 0.6 : 1,
                        transition: 'all 0.15s',
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                      }}>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            {isSkipped && <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />}
                            <Typography variant="body2" fontWeight={600} noWrap sx={{
                              maxWidth: 180,
                              textDecoration: isSkipped ? 'line-through' : 'none',
                            }}>
                              {name}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <FormControl size="small" fullWidth>
                            <Select
                              value={action.action}
                              onChange={(e) => handleMappingActionChange(name, e.target.value as 'skip' | 'link' | 'create')}
                              sx={{
                                fontSize: '0.8rem', height: 34, borderRadius: 1.5,
                                '& .MuiSelect-select': { py: 0.8 },
                              }}
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
                              &quot;{name}&quot; 이름으로 신규 거래처 생성
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="success.main" fontWeight={500}>
                              처리 완료됨
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {action.action === 'link' && action.linkToId && (
                            <Tooltip title={`"${name}" → 기존 거래처에 별칭으로 연결`}>
                              <IconButton size="small" color="info"
                                onClick={() => handleLinkMapping(name, action.linkToId!)}
                                sx={{ bgcolor: alpha(theme.palette.info.main, 0.1), '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.2) } }}>
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
                      <TableCell colSpan={4} sx={{ textAlign: 'center', py: 6 }}>
                        <Box sx={{
                          width: 56, height: 56, borderRadius: '50%', mx: 'auto', mb: 2,
                          bgcolor: alpha(theme.palette.success.main, 0.1),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <CheckCircleIcon sx={{ fontSize: 32, color: 'success.main' }} />
                        </Box>
                        <Typography variant="h6" fontWeight={600} gutterBottom>모든 거래처가 매칭되었습니다!</Typography>
                        <Typography variant="body2" color="text.secondary">미매칭 거래처가 없습니다</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>

        <Divider />
        <DialogActions sx={{
          px: 3, py: 2,
          bgcolor: alpha(theme.palette.background.paper, 0.8),
          backdropFilter: 'blur(8px)',
        }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
            <Button size="small" variant="outlined" color="primary"
              onClick={() => {
                const updated = { ...mappingActions };
                for (const name of mappingUnmatched) { updated[name] = { action: 'create' }; }
                setMappingActions(updated);
              }}
              startIcon={<BatchIcon />}
              sx={{ fontSize: '0.8rem', borderRadius: 2 }}
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
          <Button onClick={() => setMappingDialogOpen(false)} color="inherit" disabled={batchRegistering}
            sx={{ borderRadius: 2 }}>
            닫기
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleBatchRegister}
            disabled={batchRegistering || createCount === 0}
            startIcon={batchRegistering ? <CircularProgress size={18} color="inherit" /> : <PersonAddIcon />}
            sx={{
              fontWeight: 700, px: 3, borderRadius: 2,
              boxShadow: createCount > 0 ? 2 : 0,
              background: createCount > 0 ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)` : undefined,
            }}
          >
            {batchRegistering ? '등록 중...' : `신규 ${createCount}건 일괄 등록`}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}

// ─── 요약 통계 박스 (프리미엄) ───
function StatBoxPremium({ label, count, color, icon }: { label: string; count: number; color: string; icon: React.ReactNode }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        px: 2,
        py: 1.2,
        minWidth: 85,
        textAlign: 'center',
        borderRadius: 2,
        borderColor: count > 0 ? color : 'divider',
        bgcolor: count > 0 ? `${color}08` : 'transparent',
        transition: 'all 0.2s ease',
        '&:hover': {
          transform: count > 0 ? 'translateY(-2px)' : 'none',
          boxShadow: count > 0 ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
        },
      }}
    >
      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center" sx={{ mb: 0.5 }}>
        <Box sx={{ color: count > 0 ? color : 'text.disabled', display: 'flex', alignItems: 'center' }}>
          {React.cloneElement(icon as React.ReactElement, { sx: { fontSize: 16 } })}
        </Box>
        <Typography variant="h5" fontWeight={800} sx={{ color: count > 0 ? color : 'text.disabled', lineHeight: 1 }}>
          {count}
        </Typography>
      </Stack>
      <Typography variant="caption" color={count > 0 ? 'text.primary' : 'text.disabled'} fontWeight={500}>
        {label}
      </Typography>
    </Paper>
  );
}
