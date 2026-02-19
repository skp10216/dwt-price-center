'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, Button, Stack, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, alpha, useTheme,
  IconButton, Tooltip, Grid, Divider, Card, CardContent,
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Refresh as RefreshIcon,
  DifferenceOutlined as DiffIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

interface ChangeRequest {
  id: string;
  voucher_id: string;
  voucher_number: string;
  counterparty_name: string;
  status: string;
  old_data: Record<string, unknown>;
  new_data: Record<string, unknown>;
  reason: string | null;
  requested_by_name: string;
  requested_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  approval_comment: string | null;
}

const statusColors: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

const statusLabels: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '거절',
};

/**
 * 변경 감지/승인 페이지
 */
export default function VerificationChangesPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<ChangeRequest | null>(null);
  const [comment, setComment] = useState('');

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.listVoucherChangeRequests({ page: page + 1, page_size: pageSize });
      const data = res.data as { requests: ChangeRequest[]; total: number };
      setRequests(data.requests || []);
      setTotal(data.total || 0);
    } catch {
      // handle
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleApprove = async (id: string) => {
    try {
      await settlementApi.approveVoucherChangeRequest(id, comment || undefined);
      enqueueSnackbar('변경 요청이 승인되었습니다', { variant: 'success' });
      setDetailOpen(false);
      setComment('');
      loadRequests();
    } catch {
      enqueueSnackbar('승인에 실패했습니다', { variant: 'error' });
    }
  };

  const handleReject = async (id: string) => {
    try {
      await settlementApi.rejectVoucherChangeRequest(id, comment || undefined);
      enqueueSnackbar('변경 요청이 거절되었습니다', { variant: 'success' });
      setDetailOpen(false);
      setComment('');
      loadRequests();
    } catch {
      enqueueSnackbar('거절에 실패했습니다', { variant: 'error' });
    }
  };

  const openDetail = (req: ChangeRequest) => {
    setSelected(req);
    setComment('');
    setDetailOpen(true);
  };

  const renderDiff = (old_data: Record<string, unknown>, new_data: Record<string, unknown>) => {
    const allKeys = [...new Set([...Object.keys(old_data), ...Object.keys(new_data)])];
    return (
      <Grid container spacing={2}>
        <Grid item xs={6}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>변경 전</Typography>
          <Card elevation={0} sx={{ bgcolor: alpha(theme.palette.error.main, 0.04), border: '1px solid', borderColor: alpha(theme.palette.error.main, 0.2), borderRadius: 2, p: 2 }}>
            {allKeys.map((key) => (
              <Box key={key} sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">{key}</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: old_data[key] !== new_data[key] ? 700 : 400, color: old_data[key] !== new_data[key] ? 'error.main' : 'text.primary' }}>
                  {String(old_data[key] ?? '-')}
                </Typography>
              </Box>
            ))}
          </Card>
        </Grid>
        <Grid item xs={6}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>변경 후</Typography>
          <Card elevation={0} sx={{ bgcolor: alpha(theme.palette.success.main, 0.04), border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.2), borderRadius: 2, p: 2 }}>
            {allKeys.map((key) => (
              <Box key={key} sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">{key}</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: old_data[key] !== new_data[key] ? 700 : 400, color: old_data[key] !== new_data[key] ? 'success.main' : 'text.primary' }}>
                  {String(new_data[key] ?? '-')}
                </Typography>
              </Box>
            ))}
          </Card>
        </Grid>
      </Grid>
    );
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>변경 감지 / 승인</Typography>
          <Typography variant="body2" color="text.secondary">
            UPM 재업로드 시 기존 전표의 데이터가 변경된 경우 승인 후 반영됩니다.
          </Typography>
        </Box>
        <Tooltip title="새로고침"><IconButton onClick={loadRequests}><RefreshIcon /></IconButton></Tooltip>
      </Stack>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.warning.main, 0.04) }}>
              <TableCell sx={{ fontWeight: 700 }}>요청일</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>전표번호</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>거래처</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>요청자</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>사유</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>상태</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>처리</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 8 }}>로딩 중...</TableCell></TableRow>
            ) : requests.length === 0 ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                <DiffIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">변경 요청이 없습니다</Typography>
              </TableCell></TableRow>
            ) : (
              requests.map((req) => (
                <TableRow key={req.id} hover>
                  <TableCell>{new Date(req.requested_at).toLocaleDateString('ko-KR')}</TableCell>
                  <TableCell><code>{req.voucher_number}</code></TableCell>
                  <TableCell>{req.counterparty_name}</TableCell>
                  <TableCell>{req.requested_by_name}</TableCell>
                  <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.reason || '-'}</TableCell>
                  <TableCell align="center">
                    <Chip label={statusLabels[req.status] || req.status} size="small" color={statusColors[req.status] || 'default'} />
                  </TableCell>
                  <TableCell align="center">
                    {req.status === 'pending' ? (
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="상세/승인"><IconButton size="small" color="info" onClick={() => openDetail(req)}><DiffIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="승인"><IconButton size="small" color="success" onClick={() => handleApprove(req.id)}><ApproveIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="거절"><IconButton size="small" color="error" onClick={() => handleReject(req.id)}><RejectIcon fontSize="small" /></IconButton></Tooltip>
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {req.approved_by_name || '-'}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))
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

      {/* 상세 다이얼로그 */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>변경 요청 상세</DialogTitle>
        <DialogContent>
          {selected && (
            <Box sx={{ mt: 1 }}>
              <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <Chip label={`전표: ${selected.voucher_number}`} />
                <Chip label={`거래처: ${selected.counterparty_name}`} />
                <Chip label={`요청자: ${selected.requested_by_name}`} />
              </Stack>
              {selected.reason && (
                <Alert severity="info" sx={{ mb: 2 }}>사유: {selected.reason}</Alert>
              )}
              <Divider sx={{ mb: 2 }} />
              {renderDiff(selected.old_data, selected.new_data)}
              {selected.status === 'pending' && (
                <TextField
                  label="승인/거절 코멘트"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                  sx={{ mt: 3 }}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailOpen(false)}>닫기</Button>
          {selected?.status === 'pending' && (
            <>
              <Button color="error" onClick={() => handleReject(selected.id)}>거절</Button>
              <Button variant="contained" color="success" onClick={() => handleApprove(selected.id)}>승인</Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
