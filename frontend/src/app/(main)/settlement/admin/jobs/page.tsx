'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Chip, useTheme, Skeleton,
  FormControl, InputLabel, Select, MenuItem, IconButton, Tooltip, Button,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import WorkIcon from '@mui/icons-material/Work';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { AppPageContainer, AppPageHeader, AppStatusChip } from '@/components/ui';
import { settlementAdminApi } from '@/lib/api';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

const STATUS_MAP: Record<string, { semantic: 'success' | 'error' | 'warning' | 'info' | 'neutral'; label: string }> = {
  QUEUED: { semantic: 'warning', label: '대기' },
  RUNNING: { semantic: 'info', label: '실행중' },
  SUCCEEDED: { semantic: 'success', label: '완료' },
  FAILED: { semantic: 'error', label: '실패' },
};

// --- 큐 상태 카드 ---
function QueueCard({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode; color: string;
}) {
  return (
    <Paper sx={{
      p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider',
      borderTop: `3px solid ${color}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <Box sx={{
        position: 'absolute', top: -20, right: -20,
        width: 70, height: 70, borderRadius: '50%', bgcolor: alpha(color, 0.06),
      }} />
      <Stack spacing={0.5}>
        <Box sx={{ color, display: 'flex' }}>{icon}</Box>
        <Typography variant="h5" fontWeight={800} sx={{ fontFeatureSettings: '"tnum" on' }}>
          {value.toLocaleString()}
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
      </Stack>
    </Paper>
  );
}

export default function JobsPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [overview, setOverview] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobTotal, setJobTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState('');

  // 다이얼로그 상태
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'retry' | 'cancel' | 'delete' | 'batch-retry'>('retry');
  const [confirmJobId, setConfirmJobId] = useState('');
  const [confirmJobName, setConfirmJobName] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const res = await settlementAdminApi.getJobStatus();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setOverview((res.data as any)?.data ?? res.data);
    } catch {
      enqueueSnackbar('작업 현황 로딩 실패', { variant: 'error' });
    }
  }, [enqueueSnackbar]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page: page + 1, page_size: pageSize };
      if (statusFilter) params.status = statusFilter;
      const res = await settlementAdminApi.getJobList(params);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res.data as any)?.data ?? res.data;
      setJobs(data.jobs || []);
      setJobTotal(data.total || 0);
    } catch {
      enqueueSnackbar('작업 목록 로딩 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, enqueueSnackbar]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  const refreshAll = () => { loadOverview(); loadJobs(); };

  const openConfirm = (action: typeof confirmAction, jobId: string, jobName: string) => {
    setConfirmAction(action);
    setConfirmJobId(jobId);
    setConfirmJobName(jobName);
    setConfirmOpen(true);
  };

  const handleConfirmAction = async () => {
    setActionLoading(true);
    try {
      if (confirmAction === 'retry') {
        await settlementAdminApi.retryJob(confirmJobId);
        enqueueSnackbar('작업 재시도 등록', { variant: 'success' });
      } else if (confirmAction === 'cancel') {
        await settlementAdminApi.cancelJob(confirmJobId);
        enqueueSnackbar('작업 취소 완료', { variant: 'success' });
      } else if (confirmAction === 'delete') {
        await settlementAdminApi.deleteJob(confirmJobId);
        enqueueSnackbar('작업 삭제 완료', { variant: 'success' });
      } else if (confirmAction === 'batch-retry') {
        const res = await settlementAdminApi.batchRetryJobs({ all_failed: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (res.data as any)?.data ?? res.data;
        enqueueSnackbar(`${data.retried_count}건 일괄 재시도 등록`, { variant: 'success' });
      }
      setConfirmOpen(false);
      refreshAll();
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail || '작업 실패';
      enqueueSnackbar(detail, { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const CONFIRM_TEXT: Record<string, { title: string; desc: string; btn: string; color: 'error' | 'warning' | 'success' }> = {
    retry: { title: '작업 재시도', desc: `"${confirmJobName}" 작업을 재시도하시겠습니까?`, btn: '재시도', color: 'warning' },
    cancel: { title: '작업 취소', desc: `"${confirmJobName}" 작업을 취소하시겠습니까?`, btn: '취소 실행', color: 'error' },
    delete: { title: '작업 삭제', desc: `"${confirmJobName}" 작업을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, btn: '삭제', color: 'error' },
    'batch-retry': { title: '실패 일괄 재시도', desc: '모든 실패 작업을 재시도하시겠습니까?', btn: '일괄 재시도', color: 'warning' },
  };

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'created_at',
      headerName: '생성 시간',
      width: 140,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" sx={{ fontFeatureSettings: '"tnum" on', fontSize: '0.72rem' }}>
          {formatDate(params.value)}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: '상태',
      width: 80,
      renderCell: (params: GridRenderCellParams) => {
        const s = STATUS_MAP[params.value] || { semantic: 'neutral' as const, label: params.value };
        return <AppStatusChip semantic={s.semantic} label={s.label} />;
      },
    },
    {
      field: 'job_type',
      headerName: '타입',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'file_name',
      headerName: '파일명',
      flex: 1,
      minWidth: 180,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" fontWeight={600} sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'progress',
      headerName: '진행률',
      width: 70,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" sx={{ fontFeatureSettings: '"tnum" on', fontWeight: 600 }}>
          {params.value != null ? `${params.value}%` : '-'}
        </Typography>
      ),
    },
    {
      field: 'is_confirmed',
      headerName: '확정',
      width: 55,
      renderCell: (params: GridRenderCellParams) => (
        <AppStatusChip
          semantic={params.value ? 'success' : 'neutral'}
          label={params.value ? 'Y' : 'N'}
        />
      ),
    },
    {
      field: 'user_name',
      headerName: '사용자',
      width: 90,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" fontWeight={600}>{params.value || '-'}</Typography>
      ),
    },
    {
      field: 'error_message',
      headerName: '에러',
      width: 150,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" color="error" sx={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: '0.7rem',
        }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: '액션',
      width: 110,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        const row = params.row;
        return (
          <Stack direction="row" spacing={0}>
            {row.status === 'FAILED' && (
              <Tooltip title="재시도">
                <IconButton size="small" color="warning" onClick={() => openConfirm('retry', row.id, row.file_name)}>
                  <ReplayIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            {(row.status === 'QUEUED' || row.status === 'RUNNING') && (
              <Tooltip title="취소">
                <IconButton size="small" color="error" onClick={() => openConfirm('cancel', row.id, row.file_name)}>
                  <CancelIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            {(row.status === 'SUCCEEDED' || row.status === 'FAILED') && (
              <Tooltip title="삭제">
                <IconButton size="small" color="default" onClick={() => openConfirm('delete', row.id, row.file_name)}>
                  <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        );
      },
    },
  ], []);

  const c = theme.palette;
  const dist = overview?.job_distribution || {};
  const rq = overview?.rq_queues || {};
  const failedCount = dist.FAILED || 0;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<WorkIcon />}
        title="Worker Job 현황"
        description="업로드 작업 및 RQ 큐 상태를 통합 모니터링합니다"
        color="secondary"
        count={jobTotal}
        onRefresh={refreshAll}
        loading={loading}
      />

      {/* 상태 카드 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        {overview ? (
          <>
            <QueueCard label="대기" value={dist.QUEUED || 0} icon={<HourglassEmptyIcon />} color={c.warning.main} />
            <QueueCard label="실행중" value={dist.RUNNING || 0} icon={<PlayCircleIcon />} color={c.info.main} />
            <QueueCard label="완료" value={dist.SUCCEEDED || 0} icon={<CheckCircleIcon />} color={c.success.main} />
            <QueueCard label="실패" value={dist.FAILED || 0} icon={<ErrorIcon />} color={c.error.main} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 2 }} />)
        )}
      </Box>

      {/* RQ 큐 상태 */}
      {overview && !rq.error && (
        <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Redis Queue 상태
          </Typography>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption" color="text.secondary">Workers:</Typography>
              <Chip label={rq.workers ?? 0} size="small" color={rq.workers > 0 ? 'success' : 'error'} sx={{ fontWeight: 700, height: 20 }} />
            </Stack>
            {['high', 'default', 'low'].map(q => (
              <Stack key={q} direction="row" spacing={0.5} alignItems="center">
                <Typography variant="caption" color="text.secondary">{q}:</Typography>
                <Typography variant="caption" fontWeight={700}>{rq[q] ?? 0}</Typography>
              </Stack>
            ))}
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption" color="text.secondary">Failed:</Typography>
              <Typography variant="caption" fontWeight={700} color={rq.failed > 0 ? 'error.main' : 'text.primary'}>
                {rq.failed ?? 0}
              </Typography>
            </Stack>
          </Stack>
        </Paper>
      )}

      {/* 필터 + 테이블 */}
      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>상태</InputLabel>
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }} label="상태">
              <MenuItem value="">전체</MenuItem>
              <MenuItem value="QUEUED">대기</MenuItem>
              <MenuItem value="RUNNING">실행중</MenuItem>
              <MenuItem value="SUCCEEDED">완료</MenuItem>
              <MenuItem value="FAILED">실패</MenuItem>
            </Select>
          </FormControl>
          {(statusFilter === 'FAILED' || (!statusFilter && failedCount > 0)) && (
            <Button
              variant="outlined"
              color="warning"
              size="small"
              startIcon={<ReplayIcon />}
              onClick={() => openConfirm('batch-retry', '', '')}
              sx={{ fontSize: '0.75rem' }}
            >
              실패 일괄 재시도 ({failedCount}건)
            </Button>
          )}
        </Box>
        <DataGrid
          rows={jobs}
          columns={columns}
          loading={loading}
          rowCount={jobTotal}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(m) => { setPage(m.page); setPageSize(m.pageSize); }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          autoHeight
          getRowId={(row) => row.id}
          sx={{
            border: 0,
            '& .MuiDataGrid-columnHeaders': { bgcolor: alpha(c.secondary.main, 0.03) },
            '& .MuiDataGrid-cell': { py: 0.5 },
            '& .MuiDataGrid-row:hover': { bgcolor: alpha(c.secondary.main, 0.02) },
          }}
        />
      </Paper>

      {/* 확인 다이얼로그 */}
      <Dialog open={confirmOpen} onClose={() => !actionLoading && setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {CONFIRM_TEXT[confirmAction]?.title}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{CONFIRM_TEXT[confirmAction]?.desc}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} disabled={actionLoading}>취소</Button>
          <Button
            variant="contained"
            color={CONFIRM_TEXT[confirmAction]?.color || 'primary'}
            onClick={handleConfirmAction}
            disabled={actionLoading}
          >
            {actionLoading ? '처리 중...' : CONFIRM_TEXT[confirmAction]?.btn}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
