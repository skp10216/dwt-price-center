'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Button, Chip, Alert, Skeleton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, Grid, alpha, useTheme, Tooltip, IconButton,
  FormControlLabel, Switch, Divider, Stack,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Lock as LockIcon,
  HelpOutline as HelpIcon,
  Refresh as RefreshIcon,
  FiberNew as FiberNewIcon,
  Update as UpdateIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';

interface PreviewRow {
  row_index: number;
  status: string; // new | update | conflict | unmatched | locked | error | unchanged
  counterparty_name: string;
  counterparty_id: string | null;
  trade_date: string;
  voucher_number: string;
  data: Record<string, unknown>;
  diff?: { before: Record<string, string>; after: Record<string, string>; changes: { field: string; old: string; new: string }[] };
  error?: string;
}

interface JobDetail {
  id: string;
  job_type: string;
  status: string;
  progress: number;
  original_filename: string;
  result_summary: Record<string, unknown> | null;
  error_message: string | null;
  is_reviewed: boolean;
  is_confirmed: boolean;
  created_at: string;
  completed_at: string | null;
  confirmed_at: string | null;
  preview_rows: PreviewRow[];
  unmatched_counterparties: string[];
}

const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' }> = {
  new: { label: '신규', color: 'success' },
  update: { label: '변경', color: 'info' },
  conflict: { label: '충돌(승인필요)', color: 'warning' },
  unmatched: { label: '미매칭', color: 'error' },
  locked: { label: '마감(스킵)', color: 'default' },
  error: { label: '오류', color: 'error' },
  unchanged: { label: '변경없음', color: 'default' },
};

export default function UploadJobDetailPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [excludeConflicts, setExcludeConflicts] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [selectedDiff, setSelectedDiff] = useState<PreviewRow | null>(null);

  const loadJob = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.getUploadJob(jobId);
      setJob(res.data as unknown as JobDetail);
    } catch {
      setError('작업 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { loadJob(); }, [loadJob]);

  const handleConfirm = async () => {
    try {
      setConfirming(true);
      await settlementApi.confirmUploadJob(jobId, excludeConflicts);
      setConfirmOpen(false);
      await loadJob();
    } catch {
      setError('확정 처리 중 오류가 발생했습니다.');
    } finally {
      setConfirming(false);
    }
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString('ko-KR') : '-';

  const summary = job?.result_summary ?? {};

  const getFilteredRows = (): PreviewRow[] => {
    return job?.preview_rows ?? [];
  };

  const filteredRows = getFilteredRows();
  const pagedRows = filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton width={300} height={40} />
        <Skeleton width="100%" height={200} sx={{ mt: 2 }} />
        <Skeleton width="100%" height={400} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (error || !job) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || '작업을 찾을 수 없습니다.'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()} sx={{ mt: 2 }}>
          뒤로가기
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => router.back()}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            업로드 작업 상세
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {job.original_filename}
          </Typography>
        </Box>
        <Tooltip title="새로고침">
          <IconButton onClick={loadJob}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 작업 정보 카드 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent sx={{ p: 3 }}>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">작업 ID</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ wordBreak: 'break-all' }}>
                    {job.id.slice(0, 8)}...
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">타입</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {job.job_type === 'voucher_sales_excel' ? '판매 전표' : '매입 전표'}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">상태</Typography>
                  <Chip
                    label={job.status === 'succeeded' ? '파싱 완료' : job.status === 'running' ? '처리중' : job.status === 'failed' ? '실패' : '대기중'}
                    color={job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'error' : 'default'}
                    size="small"
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">확정 상태</Typography>
                  <Chip
                    label={job.is_confirmed ? '확정됨' : '미확정'}
                    color={job.is_confirmed ? 'primary' : 'default'}
                    size="small"
                  />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">생성 일시</Typography>
                  <Typography variant="body2">{formatDate(job.created_at)}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">완료 일시</Typography>
                  <Typography variant="body2">{formatDate(job.completed_at)}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">확정 일시</Typography>
                  <Typography variant="body2">{formatDate(job.confirmed_at)}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>결과 요약</Typography>
              <Stack spacing={0.5}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">전체 행</Typography>
                  <Typography variant="body2" fontWeight={600}>{String(summary.total_rows ?? 0)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="success.main">신규</Typography>
                  <Typography variant="body2" fontWeight={600}>{String(summary.new_count ?? 0)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="info.main">변경</Typography>
                  <Typography variant="body2" fontWeight={600}>{String(summary.update_count ?? 0)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="warning.main">충돌</Typography>
                  <Typography variant="body2" fontWeight={600}>{String(summary.conflict_count ?? 0)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="error.main">미매칭</Typography>
                  <Typography variant="body2" fontWeight={600}>{String(summary.unmatched_count ?? 0)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.disabled">마감(스킵)</Typography>
                  <Typography variant="body2" fontWeight={600}>{String(summary.locked_count ?? 0)}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 오류 메시지 */}
      {job.error_message && (
        <Alert severity="error" sx={{ mb: 2 }}>{job.error_message}</Alert>
      )}

      {/* 확정 버튼 */}
      {job.status === 'succeeded' && !job.is_confirmed && (
        <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: alpha(theme.palette.primary.main, 0.05), border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.2), borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>
                미리보기 확인 후 확정하세요
              </Typography>
              <Typography variant="body2" color="text.secondary">
                확정하면 신규/변경 건은 전표 원장에 반영되고, 충돌 건은 변경 승인 대기로 이동합니다.
              </Typography>
            </Box>
            <Button
              variant="contained"
              color="primary"
              startIcon={<CheckCircleIcon />}
              onClick={() => setConfirmOpen(true)}
              sx={{ borderRadius: 2, px: 3 }}
            >
              업로드 확정
            </Button>
          </Box>
        </Paper>
      )}

      {/* 미리보기 테이블 */}
      {filteredRows.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" fontWeight={700}>
              미리보기 ({filteredRows.length}건)
            </Typography>
          </Box>
          <Divider />
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 50 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 110 }}>상태</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>거래처</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>일자</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>전표번호</TableCell>
                  <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>수량</TableCell>
                  <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>금액</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 80 }}>상세</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedRows.map((row) => {
                  const statusCfg = STATUS_CONFIG[row.status] ?? { label: row.status, color: 'default' as const };
                  const amount = row.data.actual_sale_price ?? row.data.actual_purchase_price ?? row.data.sale_amount ?? row.data.purchase_cost ?? 0;
                  return (
                    <TableRow
                      key={row.row_index}
                      sx={{
                        bgcolor: row.status === 'error' ? alpha(theme.palette.error.main, 0.04) :
                                 row.status === 'conflict' ? alpha(theme.palette.warning.main, 0.04) :
                                 row.status === 'unmatched' ? alpha(theme.palette.error.main, 0.02) : undefined,
                      }}
                    >
                      <TableCell>{row.row_index + 1}</TableCell>
                      <TableCell>
                        <Chip label={statusCfg.label} color={statusCfg.color} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                          {row.counterparty_name}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.trade_date}</TableCell>
                      <TableCell>{row.voucher_number}</TableCell>
                      <TableCell align="right">{String(row.data.quantity ?? 0)}</TableCell>
                      <TableCell align="right">
                        {typeof amount === 'number' ? amount.toLocaleString('ko-KR') : String(amount)}
                      </TableCell>
                      <TableCell>
                        {(row.diff || row.error) && (
                          <Tooltip title={row.error || '변경 내역 보기'}>
                            <IconButton
                              size="small"
                              onClick={() => { setSelectedDiff(row); setDiffDialogOpen(true); }}
                            >
                              {row.error ? <ErrorIcon color="error" fontSize="small" /> : <HelpIcon color="info" fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredRows.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage="행 수"
          />
        </Paper>
      )}

      {/* diff 다이얼로그 */}
      <Dialog open={diffDialogOpen} onClose={() => setDiffDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedDiff?.error ? '오류 상세' : '변경 내역'}
          <Typography variant="body2" color="text.secondary">
            행 #{(selectedDiff?.row_index ?? 0) + 1} · {selectedDiff?.counterparty_name} · {selectedDiff?.voucher_number}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {selectedDiff?.error && (
            <Alert severity="error" sx={{ mb: 2 }}>{selectedDiff.error}</Alert>
          )}
          {selectedDiff?.diff?.changes && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>필드</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>기존 값</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>새 값</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedDiff.diff.changes.map((c) => (
                  <TableRow key={c.field}>
                    <TableCell>{c.field}</TableCell>
                    <TableCell sx={{ color: 'error.main', textDecoration: 'line-through' }}>
                      {c.old ?? '-'}
                    </TableCell>
                    <TableCell sx={{ color: 'success.main', fontWeight: 600 }}>
                      {c.new ?? '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiffDialogOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>

      {/* 확정 확인 다이얼로그 */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>업로드 확정</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            미리보기 결과를 확인하셨나요? 확정하면 다음과 같이 처리됩니다:
          </Typography>
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FiberNewIcon color="success" fontSize="small" />
              <Typography variant="body2">신규 {String(summary.new_count ?? 0)}건 → 전표 생성</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <UpdateIcon color="info" fontSize="small" />
              <Typography variant="body2">변경 {String(summary.update_count ?? 0)}건 → 전표 업데이트</Typography>
            </Box>
            {Number(summary.conflict_count ?? 0) > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningIcon color="warning" fontSize="small" />
                <Typography variant="body2">충돌 {String(summary.conflict_count ?? 0)}건 → 변경 승인 대기</Typography>
              </Box>
            )}
            {Number(summary.locked_count ?? 0) > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LockIcon fontSize="small" />
                <Typography variant="body2">마감 {String(summary.locked_count ?? 0)}건 → 스킵</Typography>
              </Box>
            )}
          </Stack>
          <Divider sx={{ my: 2 }} />
          <FormControlLabel
            control={<Switch checked={excludeConflicts} onChange={(_, v) => setExcludeConflicts(v)} />}
            label="충돌 건은 변경 승인으로 보내기"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming ? '처리 중...' : '확정 실행'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
