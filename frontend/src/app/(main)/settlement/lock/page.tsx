'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Alert, alpha, useTheme,
  IconButton, Tooltip, Card, CardContent, Grid, FormControl, InputLabel,
  Select, MenuItem,
} from '@mui/material';
import {
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

interface LockEntry {
  year_month: string;
  status: string;
  locked_vouchers: number;
  total_vouchers: number;
  locked_at: string | null;
  locked_by_name: string | null;
  description: string | null;
}

interface AuditLogEntry {
  id: string;
  action: string;
  year_month: string;
  user_name: string;
  description: string | null;
  created_at: string;
}

/**
 * 마감 관리 페이지 (LOCK)
 */
export default function LockManagementPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [locks, setLocks] = useState<LockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockTarget, setLockTarget] = useState<string>('');
  const [lockDescription, setLockDescription] = useState('');

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

  const loadLocks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.listLocks({ year: selectedYear });
      const data = res.data as { locks: LockEntry[] };
      setLocks(data.locks || []);
    } catch {
      // handle
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => { loadLocks(); }, [loadLocks]);

  const openLockDialog = (yearMonth: string) => {
    setLockTarget(yearMonth);
    setLockDescription('');
    setLockDialogOpen(true);
  };

  const handleLock = async () => {
    try {
      await settlementApi.createLock(lockTarget, lockDescription || undefined);
      enqueueSnackbar(`${lockTarget} 마감이 완료되었습니다`, { variant: 'success' });
      setLockDialogOpen(false);
      loadLocks();
    } catch {
      enqueueSnackbar('마감에 실패했습니다', { variant: 'error' });
    }
  };

  const handleUnlock = async (yearMonth: string) => {
    if (!confirm(`${yearMonth} 마감을 해제하시겠습니까? 이 작업은 감사 로그에 기록됩니다.`)) return;
    try {
      await settlementApi.releaseLock(yearMonth, '관리자 마감 해제');
      enqueueSnackbar(`${yearMonth} 마감이 해제되었습니다`, { variant: 'success' });
      loadLocks();
    } catch {
      enqueueSnackbar('마감 해제에 실패했습니다', { variant: 'error' });
    }
  };

  const openAuditLog = async () => {
    try {
      const res = await settlementApi.getLockAuditLogs({ year: selectedYear });
      const data = res.data as { logs: AuditLogEntry[] };
      setAuditLogs(data.logs || []);
      setAuditOpen(true);
    } catch {
      enqueueSnackbar('감사 로그를 불러오지 못했습니다', { variant: 'error' });
    }
  };

  const lockedCount = locks.filter((l) => l.status === 'locked').length;
  const openCount = locks.filter((l) => l.status === 'open').length;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>마감 관리</Typography>
          <Typography variant="body2" color="text.secondary">
            월별 전표 마감을 관리합니다. 마감된 전표는 수정/삭제가 차단됩니다.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>연도</InputLabel>
            <Select label="연도" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <Tooltip title="감사 로그"><IconButton onClick={openAuditLog}><HistoryIcon /></IconButton></Tooltip>
          <Tooltip title="새로고침"><IconButton onClick={loadLocks}><RefreshIcon /></IconButton></Tooltip>
        </Stack>
      </Stack>

      {/* 요약 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.04) }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">마감 완료</Typography>
              <Typography variant="h5" fontWeight={700} color="success.main">{lockedCount}개월</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: alpha(theme.palette.warning.main, 0.04) }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">마감 대기</Typography>
              <Typography variant="h5" fontWeight={700} color="warning.main">{openCount}개월</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">대상 연도</Typography>
              <Typography variant="h5" fontWeight={700}>{selectedYear}년</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 월별 마감 테이블 */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.info.main, 0.04) }}>
              <TableCell sx={{ fontWeight: 700 }}>월</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>상태</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>마감 전표</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>전체 전표</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>마감일</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>마감자</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>비고</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>관리</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 8 }}>로딩 중...</TableCell></TableRow>
            ) : (
              months.map((month) => {
                const yearMonth = `${selectedYear}-${month}`;
                const lock = locks.find((l) => l.year_month === yearMonth);
                const isLocked = lock?.status === 'locked';
                return (
                  <TableRow key={yearMonth} hover sx={{ bgcolor: isLocked ? alpha(theme.palette.success.main, 0.04) : 'transparent' }}>
                    <TableCell sx={{ fontWeight: 600 }}>{selectedYear}.{month}</TableCell>
                    <TableCell align="center">
                      {isLocked ? (
                        <Chip icon={<LockIcon />} label="마감" size="small" color="success" />
                      ) : (
                        <Chip icon={<LockOpenIcon />} label="미마감" size="small" color="warning" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="right">{lock?.locked_vouchers ?? 0}</TableCell>
                    <TableCell align="right">{lock?.total_vouchers ?? 0}</TableCell>
                    <TableCell>
                      {lock?.locked_at ? new Date(lock.locked_at).toLocaleDateString('ko-KR') : '-'}
                    </TableCell>
                    <TableCell>{lock?.locked_by_name || '-'}</TableCell>
                    <TableCell>{lock?.description || '-'}</TableCell>
                    <TableCell align="center">
                      {isLocked ? (
                        <Tooltip title="마감 해제">
                          <Button size="small" color="warning" variant="outlined" startIcon={<LockOpenIcon />} onClick={() => handleUnlock(yearMonth)}>
                            해제
                          </Button>
                        </Tooltip>
                      ) : (
                        <Tooltip title="마감 처리">
                          <Button size="small" color="success" variant="contained" startIcon={<LockIcon />} onClick={() => openLockDialog(yearMonth)}>
                            마감
                          </Button>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 마감 다이얼로그 */}
      <Dialog open={lockDialogOpen} onClose={() => setLockDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LockIcon color="success" />
            <span>{lockTarget} 마감</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            마감 처리 후 해당 월의 전표는 수정/삭제가 차단됩니다.
          </Alert>
          <TextField
            label="비고"
            value={lockDescription}
            onChange={(e) => setLockDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="마감 사유 또는 메모"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLockDialogOpen(false)}>취소</Button>
          <Button variant="contained" color="success" startIcon={<LockIcon />} onClick={handleLock}>
            마감 확정
          </Button>
        </DialogActions>
      </Dialog>

      {/* 감사 로그 다이얼로그 */}
      <Dialog open={auditOpen} onClose={() => setAuditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>마감 감사 로그 - {selectedYear}년</DialogTitle>
        <DialogContent>
          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>일시</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>대상</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>액션</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>사용자</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>비고</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLogs.length === 0 ? (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>감사 로그가 없습니다</TableCell></TableRow>
                ) : (
                  auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{new Date(log.created_at).toLocaleString('ko-KR')}</TableCell>
                      <TableCell><Chip label={log.year_month} size="small" /></TableCell>
                      <TableCell>
                        <Chip
                          label={log.action === 'lock' ? '마감' : '해제'}
                          size="small"
                          color={log.action === 'lock' ? 'success' : 'warning'}
                        />
                      </TableCell>
                      <TableCell>{log.user_name}</TableCell>
                      <TableCell>{log.description || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAuditOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
