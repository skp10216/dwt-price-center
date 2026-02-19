'use client';

/**
 * 업로드 작업 내역 (Job History)
 * - 체크박스 선택 → 일괄 삭제
 * - 한글 상태 표시 (대기, 처리중, 완료, 실패)
 * - 진행률 프로그레스바 + %
 * - KST 시간대 자동 변환
 * - 진행중 작업 자동 새로고침 (3초)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, IconButton, Tooltip,
  Stack, alpha, useTheme, LinearProgress, Button, Checkbox,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  PlayArrow as RunningIcon,
  ArrowBack as ArrowBackIcon,
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
  } | null;
  error_message: string | null;
  is_reviewed: boolean;
  is_confirmed: boolean;
  created_at: string;
  completed_at: string | null;
  confirmed_at: string | null;
}

// ─── 상태 매핑 (DB enum 대문자 + API 소문자 모두 대응) ───
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

function isActiveStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'queued' || s === 'running';
}

function isRunning(status: string): boolean {
  return status.toLowerCase() === 'running';
}

function isSucceeded(status: string): boolean {
  return status.toLowerCase() === 'succeeded';
}

function isFailed(status: string): boolean {
  return status.toLowerCase() === 'failed';
}

// ─── 유틸리티: UTC ISO → KST 로컬 시간 포맷 ───
function formatKST(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  let dateStr = isoStr;
  if (dateStr.includes('T') && !dateStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    dateStr += 'Z';
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoStr;
  }
}

// ─── 작업 유형 표시 ───
function getJobTypeLabel(jobType: string): { label: string; color: 'primary' | 'secondary' } {
  if (jobType.toLowerCase().includes('sales')) return { label: '판매', color: 'primary' };
  if (jobType.toLowerCase().includes('purchase')) return { label: '매입', color: 'secondary' };
  return { label: jobType, color: 'primary' };
}

export default function UploadJobsPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const router = useRouter();

  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);

  // 선택 상태 (체크박스)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 삭제 다이얼로그
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 자동 새로고침
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.listUploadJobs({ page: page + 1, page_size: pageSize });
      const data = res.data as { jobs: UploadJob[]; total: number };
      setJobs(data.jobs || []);
      setTotal(data.total || 0);

      const hasActive = (data.jobs || []).some((j) => isActiveStatus(j.status));
      setAutoRefresh(hasActive);
    } catch {
      enqueueSnackbar('작업 목록을 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, enqueueSnackbar]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // 자동 새로고침 (진행중 작업 → 3초 간격)
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(loadJobs, 3000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadJobs]);

  // ─── 체크박스 핸들러 ───
  // 삭제 가능한 항목 (RUNNING 제외)
  const deletableJobs = jobs.filter((j) => !isRunning(j.status));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(deletableJobs.map((j) => j.id)));
    } else {
      setSelected(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const isAllSelected = deletableJobs.length > 0 && deletableJobs.every((j) => selected.has(j.id));
  const isSomeSelected = selected.size > 0 && !isAllSelected;

  // ─── 일괄 삭제 ───
  const handleBatchDeleteClick = () => {
    if (selected.size === 0) return;
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (selected.size === 0) return;
    try {
      setDeleting(true);
      const ids = Array.from(selected);
      const res = await settlementApi.batchDeleteUploadJobs(ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = res.data as any;
      const deletedCount = data?.deleted_count ?? data?.data?.deleted_count ?? ids.length;
      enqueueSnackbar(`${deletedCount}건 삭제 완료`, { variant: 'success' });
      setSelected(new Set());
      setDeleteDialogOpen(false);
      loadJobs();
    } catch {
      enqueueSnackbar('삭제에 실패했습니다', { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  // ─── 결과 요약 렌더링 ───
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
        {s.total_rows != null && <Chip label={`전체 ${s.total_rows}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />}
        {(s.new_count ?? 0) > 0 && <Chip label={`신규 ${s.new_count}`} size="small" color="success" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />}
        {(s.update_count ?? 0) > 0 && <Chip label={`변경 ${s.update_count}`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />}
        {(s.error_count ?? 0) > 0 && <Chip label={`오류 ${s.error_count}`} size="small" color="error" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />}
        {(s.unmatched_count ?? 0) > 0 && <Chip label={`미매칭 ${s.unmatched_count}`} size="small" color="warning" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />}
      </Stack>
    );
  };

  // ─── 선택된 작업 정보 ───
  const selectedJobs = jobs.filter((j) => selected.has(j.id));
  const runningSelected = selectedJobs.filter((j) => isRunning(j.status)).length;

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
              전표 업로드 작업의 처리 현황과 결과를 확인합니다.
              {autoRefresh && (
                <Chip label="자동 새로고침" size="small" color="info" variant="outlined"
                  sx={{ ml: 1, fontSize: '0.65rem', height: 18 }}
                />
              )}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          {/* 일괄 삭제 버튼 */}
          {selected.size > 0 && (
            <Button
              variant="contained"
              color="error"
              size="small"
              startIcon={<DeleteIcon />}
              onClick={handleBatchDeleteClick}
            >
              {selected.size}건 삭제
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            onClick={() => router.push('/settlement/upload/sales')}
          >
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
              {/* 전체 선택 체크박스 */}
              <TableCell padding="checkbox" sx={{ width: 48 }}>
                <Checkbox
                  size="small"
                  indeterminate={isSomeSelected}
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: 160 }}>등록일시</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 65 }} align="center">타입</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>파일명</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, width: 100 }}>상태</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, width: 100 }}>진행률</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 280 }}>결과 요약</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 160 }}>완료시간</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                  <Typography color="text.secondary">로딩 중...</Typography>
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                  <Typography color="text.secondary">업로드 작업이 없습니다</Typography>
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => {
                const typeInfo = getJobTypeLabel(job.job_type);
                const statusInfo = getStatusInfo(job.status);
                const canSelect = !isRunning(job.status);
                const isChecked = selected.has(job.id);

                return (
                  <TableRow
                    key={job.id}
                    hover
                    selected={isChecked}
                    sx={{
                      bgcolor: isFailed(job.status) ? alpha(theme.palette.error.main, 0.02) : 'transparent',
                      '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.03) },
                    }}
                  >
                    {/* 체크박스 */}
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={isChecked}
                        disabled={!canSelect}
                        onChange={(e) => handleSelectOne(job.id, e.target.checked)}
                      />
                    </TableCell>

                    {/* 등록일시 */}
                    <TableCell sx={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {formatKST(job.created_at)}
                    </TableCell>

                    {/* 타입 */}
                    <TableCell align="center">
                      <Chip label={typeInfo.label} size="small" color={typeInfo.color} variant="outlined" />
                    </TableCell>

                    {/* 파일명 */}
                    <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={job.original_filename} arrow>
                        <Typography variant="body2" noWrap>{job.original_filename}</Typography>
                      </Tooltip>
                    </TableCell>

                    {/* 상태 */}
                    <TableCell align="center">
                      <Chip
                        icon={statusInfo.icon as React.ReactElement}
                        label={statusInfo.label}
                        size="small"
                        color={statusInfo.color}
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>

                    {/* 진행률 */}
                    <TableCell align="center">
                      {isActiveStatus(job.status) ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <LinearProgress
                            variant={job.progress > 0 ? 'determinate' : 'indeterminate'}
                            value={job.progress}
                            sx={{ flex: 1, height: 6, borderRadius: 1 }}
                          />
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

                    {/* 결과 요약 */}
                    <TableCell>{renderSummary(job)}</TableCell>

                    {/* 완료시간 */}
                    <TableCell sx={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {formatKST(job.completed_at)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="페이지당 행:"
        />
      </TableContainer>

      {/* ─── 일괄 삭제 확인 다이얼로그 ─── */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>작업 삭제 확인</DialogTitle>
        <DialogContent>
          <DialogContentText>
            선택한 <strong>{selected.size}건</strong>의 업로드 작업을 삭제하시겠습니까?
            <br />이 작업은 되돌릴 수 없습니다.
          </DialogContentText>
          {runningSelected > 0 && (
            <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
              ※ 실행 중인 작업 {runningSelected}건은 삭제에서 제외됩니다.
            </Typography>
          )}
          {/* 선택된 파일 목록 */}
          <Paper variant="outlined" sx={{ mt: 2, p: 1.5, maxHeight: 200, overflow: 'auto' }}>
            {selectedJobs.map((j) => (
              <Stack key={j.id} direction="row" spacing={1} alignItems="center" sx={{ py: 0.3 }}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {j.original_filename}
                </Typography>
                <Chip label={getStatusInfo(j.status).label} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
              </Stack>
            ))}
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleDeleteCancel} color="inherit" disabled={deleting}>취소</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={deleting}>
            {deleting ? '삭제중...' : `${selected.size}건 삭제`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
