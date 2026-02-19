'use client';

/**
 * 업로드 작업 내역 (Job History)
 * - 한글 상태 표시 (대기, 처리중, 완료, 실패)
 * - 진행률 표시 (프로그레스바)
 * - 삭제 기능 (확인 다이얼로그)
 * - KST 시간대 자동 변환
 * - 결과 요약 표시
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, IconButton, Tooltip,
  Stack, alpha, useTheme, LinearProgress, Button,
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

// ─── 상태 매핑 ───
const statusConfig: Record<string, { label: string; color: 'default' | 'warning' | 'success' | 'error' | 'info'; icon: React.ReactNode }> = {
  queued: { label: '대기중', color: 'default', icon: <PendingIcon sx={{ fontSize: 16 }} /> },
  running: { label: '처리중', color: 'info', icon: <RunningIcon sx={{ fontSize: 16 }} /> },
  succeeded: { label: '완료', color: 'success', icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
  failed: { label: '실패', color: 'error', icon: <ErrorIcon sx={{ fontSize: 16 }} /> },
};

// ─── 유틸리티: UTC ISO → KST 로컬 시간 포맷 ───
function formatKST(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  // 서버에서 UTC 시간이 timezone 없이 올 수 있음 → 'Z' 또는 '+00:00' 미포함 시 UTC로 간주
  let dateStr = isoStr;
  if (dateStr.includes('T') && !dateStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    dateStr += 'Z'; // UTC임을 명시
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
  if (jobType.includes('sales')) return { label: '판매', color: 'primary' };
  if (jobType.includes('purchase')) return { label: '매입', color: 'secondary' };
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

  // 삭제 다이얼로그
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UploadJob | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 자동 새로고침 (진행중 작업이 있으면 5초마다)
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.listUploadJobs({ page: page + 1, page_size: pageSize });
      const data = res.data as { jobs: UploadJob[]; total: number };
      setJobs(data.jobs || []);
      setTotal(data.total || 0);

      // 진행중 작업이 있으면 자동 새로고침 활성화
      const hasActive = (data.jobs || []).some((j) => j.status === 'queued' || j.status === 'running');
      setAutoRefresh(hasActive);
    } catch {
      enqueueSnackbar('작업 목록을 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, enqueueSnackbar]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // 자동 새로고침 (진행중 작업이 있을 때 5초 간격)
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      loadJobs();
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadJobs]);

  // 삭제 핸들러
  const handleDeleteClick = (job: UploadJob) => {
    setDeleteTarget(job);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await settlementApi.deleteUploadJob(deleteTarget.id);
      enqueueSnackbar('작업이 삭제되었습니다', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      loadJobs(); // 목록 새로고침
    } catch {
      enqueueSnackbar('작업 삭제에 실패했습니다', { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  // 결과 요약 렌더링
  const renderSummary = (job: UploadJob) => {
    if (job.status === 'failed' && job.error_message) {
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
      if (job.status === 'queued') return <Typography variant="caption" color="text.disabled">대기중…</Typography>;
      if (job.status === 'running') return <Typography variant="caption" color="info.main">처리중…</Typography>;
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
        <Stack direction="row" spacing={1}>
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
              <TableCell sx={{ fontWeight: 700, width: 160 }}>등록일시</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 65 }} align="center">타입</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>파일명</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, width: 100 }}>상태</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, width: 80 }}>진행률</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 280 }}>결과 요약</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 160 }}>완료시간</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, width: 60 }}>작업</TableCell>
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
                const statusInfo = statusConfig[job.status] || { label: job.status, color: 'default' as const, icon: null };
                const canDelete = job.status !== 'running';

                return (
                  <TableRow
                    key={job.id}
                    hover
                    sx={{
                      bgcolor: job.status === 'failed' ? alpha(theme.palette.error.main, 0.02) : 'transparent',
                      '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.03) },
                    }}
                  >
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
                      {(job.status === 'queued' || job.status === 'running') ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <LinearProgress
                            variant={job.progress > 0 ? 'determinate' : 'indeterminate'}
                            value={job.progress}
                            sx={{ flex: 1, height: 6, borderRadius: 1 }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 30 }}>
                            {job.progress}%
                          </Typography>
                        </Box>
                      ) : job.status === 'succeeded' ? (
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

                    {/* 작업 (삭제) */}
                    <TableCell align="center">
                      {canDelete && (
                        <Tooltip title="삭제">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteClick(job)}
                            sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
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

      {/* ─── 삭제 확인 다이얼로그 ─── */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>작업 삭제 확인</DialogTitle>
        <DialogContent>
          <DialogContentText>
            다음 업로드 작업을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </DialogContentText>
          {deleteTarget && (
            <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
              <Typography variant="body2" fontWeight={600}>{deleteTarget.original_filename}</Typography>
              <Typography variant="caption" color="text.secondary">
                {formatKST(deleteTarget.created_at)} · {statusConfig[deleteTarget.status]?.label || deleteTarget.status}
              </Typography>
            </Paper>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleDeleteCancel} color="inherit" disabled={deleting}>취소</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={deleting}>
            {deleting ? '삭제중...' : '삭제'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
