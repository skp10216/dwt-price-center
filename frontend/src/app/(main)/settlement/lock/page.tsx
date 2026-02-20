'use client';

/**
 * 마감 관리 페이지 (통합)
 * 탭으로 마감 관리 / 마감 이력(감사 로그)을 전환
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Button, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Alert, alpha, useTheme,
  IconButton, Tooltip, Card, CardContent, FormControl, InputLabel,
  Select, MenuItem, Tabs, Tab, LinearProgress, Skeleton, TablePagination,
  Fade, Avatar, InputAdornment,
} from '@mui/material';
import {
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Refresh as RefreshIcon,
  History as HistoryIcon,
  CalendarMonth as CalendarIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Person as PersonIcon,
  EventNote as EventNoteIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

// ─── 타입 ───
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

type TabValue = 'management' | 'history';

// ─── 유틸리티 ───
function formatKST(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function getAvatarColor(name: string): string {
  const colors = ['#1976d2', '#388e3c', '#d32f2f', '#7b1fa2', '#1565c0', '#00838f', '#ef6c00', '#5d4037', '#455a64', '#6a1b9a'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function LockManagementPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  // ─── 공통 상태 ───
  const [tab, setTab] = useState<TabValue>('management');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

  // ─── 마감 관리 상태 ───
  const [locks, setLocks] = useState<LockEntry[]>([]);
  const [locksLoading, setLocksLoading] = useState(true);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockTarget, setLockTarget] = useState<string>('');
  const [lockDescription, setLockDescription] = useState('');
  const [lockProcessing, setLockProcessing] = useState(false);

  // ─── 감사 로그 상태 ───
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(0);
  const [auditSearch, setAuditSearch] = useState('');

  // ─── 데이터 로드 ───
  const loadLocks = useCallback(async () => {
    try {
      setLocksLoading(true);
      const res = await settlementApi.listLocks({ year: selectedYear });
      const data = res.data as unknown as { locks: LockEntry[] };
      setLocks(data.locks || []);
    } catch {
      // handle
    } finally {
      setLocksLoading(false);
    }
  }, [selectedYear]);

  const loadAuditLogs = useCallback(async () => {
    try {
      setAuditLoading(true);
      const res = await settlementApi.getLockAuditLogs({ year: selectedYear });
      const data = res.data as unknown as { logs: AuditLogEntry[] };
      setAuditLogs(data.logs || []);
    } catch {
      enqueueSnackbar('감사 로그를 불러오지 못했습니다', { variant: 'error' });
    } finally {
      setAuditLoading(false);
    }
  }, [selectedYear, enqueueSnackbar]);

  useEffect(() => {
    if (tab === 'management') {
      loadLocks();
    } else {
      loadAuditLogs();
    }
  }, [tab, loadLocks, loadAuditLogs]);

  // ─── 통계 ───
  const stats = useMemo(() => {
    const lockedCount = locks.filter((l) => l.status === 'locked').length;
    const openCount = locks.filter((l) => l.status === 'open').length;
    const totalVouchers = locks.reduce((sum, l) => sum + (l.total_vouchers || 0), 0);
    const lockedVouchers = locks.reduce((sum, l) => sum + (l.locked_vouchers || 0), 0);
    return { lockedCount, openCount, totalVouchers, lockedVouchers };
  }, [locks]);

  const filteredAuditLogs = useMemo(() => {
    if (!auditSearch) return auditLogs;
    const q = auditSearch.toLowerCase();
    return auditLogs.filter(log =>
      log.year_month.includes(q) ||
      log.user_name.toLowerCase().includes(q) ||
      (log.description || '').toLowerCase().includes(q)
    );
  }, [auditLogs, auditSearch]);

  // ─── 마감 처리 ───
  const openLockDialog = (yearMonth: string) => {
    setLockTarget(yearMonth);
    setLockDescription('');
    setLockDialogOpen(true);
  };

  const handleLock = async () => {
    try {
      setLockProcessing(true);
      await settlementApi.createLock(lockTarget, lockDescription || undefined);
      enqueueSnackbar(`${lockTarget} 마감이 완료되었습니다`, { variant: 'success' });
      setLockDialogOpen(false);
      loadLocks();
    } catch {
      enqueueSnackbar('마감에 실패했습니다', { variant: 'error' });
    } finally {
      setLockProcessing(false);
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

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* ─── 헤더 ─── */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            마감 관리
          </Typography>
          <Typography variant="body2" color="text.secondary">
            월별 전표 마감을 관리하고 이력을 조회합니다
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>연도</InputLabel>
            <Select label="연도" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <IconButton onClick={() => tab === 'management' ? loadLocks() : loadAuditLogs()}>
            <RefreshIcon />
          </IconButton>
        </Stack>
      </Stack>

      {/* ─── 탭 ─── */}
      <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            px: 2,
            '& .MuiTab-root': { fontWeight: 600, py: 2 },
          }}
        >
          <Tab
            value="management"
            icon={<LockIcon />}
            iconPosition="start"
            label="마감 관리"
          />
          <Tab
            value="history"
            icon={<HistoryIcon />}
            iconPosition="start"
            label="마감 이력"
          />
        </Tabs>
      </Paper>

      {/* ════════════════════════════════════════
          탭 1: 마감 관리
         ════════════════════════════════════════ */}
      {tab === 'management' && (
        <Fade in timeout={300}>
          <Box>
            {/* 요약 카드 */}
            <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
              <Paper elevation={0} sx={{
                p: 3, minWidth: 160, borderRadius: 3,
                border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.3),
                background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.08)} 0%, ${alpha(theme.palette.success.main, 0.02)} 100%)`,
              }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{
                    width: 48, height: 48, borderRadius: 2,
                    bgcolor: alpha(theme.palette.success.main, 0.15),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <LockIcon sx={{ color: 'success.main', fontSize: 28 }} />
                  </Box>
                  <Box>
                    <Typography variant="h4" fontWeight={800} color="success.main">{stats.lockedCount}</Typography>
                    <Typography variant="body2" color="text.secondary">마감 완료</Typography>
                  </Box>
                </Stack>
              </Paper>

              <Paper elevation={0} sx={{
                p: 3, minWidth: 160, borderRadius: 3,
                border: '1px solid', borderColor: alpha(theme.palette.warning.main, 0.3),
                background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.08)} 0%, ${alpha(theme.palette.warning.main, 0.02)} 100%)`,
              }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{
                    width: 48, height: 48, borderRadius: 2,
                    bgcolor: alpha(theme.palette.warning.main, 0.15),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <LockOpenIcon sx={{ color: 'warning.main', fontSize: 28 }} />
                  </Box>
                  <Box>
                    <Typography variant="h4" fontWeight={800} color="warning.main">{stats.openCount}</Typography>
                    <Typography variant="body2" color="text.secondary">마감 대기</Typography>
                  </Box>
                </Stack>
              </Paper>

              <Paper elevation={0} sx={{
                p: 3, minWidth: 180, borderRadius: 3,
                border: '1px solid', borderColor: 'divider',
              }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{
                    width: 48, height: 48, borderRadius: 2,
                    bgcolor: alpha(theme.palette.info.main, 0.1),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <EventNoteIcon sx={{ color: 'info.main', fontSize: 28 }} />
                  </Box>
                  <Box>
                    <Typography variant="h5" fontWeight={800}>{stats.lockedVouchers.toLocaleString()}</Typography>
                    <Typography variant="body2" color="text.secondary">마감 전표 수</Typography>
                  </Box>
                </Stack>
              </Paper>

              <Paper elevation={0} sx={{
                p: 3, minWidth: 140, borderRadius: 3,
                border: '1px solid', borderColor: 'divider',
              }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{
                    width: 48, height: 48, borderRadius: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CalendarIcon sx={{ color: 'primary.main', fontSize: 28 }} />
                  </Box>
                  <Box>
                    <Typography variant="h5" fontWeight={800}>{selectedYear}</Typography>
                    <Typography variant="body2" color="text.secondary">대상 연도</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Stack>

            {/* 월별 마감 테이블 */}
            <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
              {locksLoading && <LinearProgress />}
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{
                      background: `linear-gradient(90deg, ${alpha(theme.palette.info.main, 0.06)} 0%, ${alpha(theme.palette.background.paper, 1)} 100%)`,
                    }}>
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
                    {locksLoading ? (
                      Array.from({ length: 12 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton width={60} /></TableCell>
                          <TableCell align="center"><Skeleton width={60} /></TableCell>
                          <TableCell align="right"><Skeleton width={40} /></TableCell>
                          <TableCell align="right"><Skeleton width={40} /></TableCell>
                          <TableCell><Skeleton width={80} /></TableCell>
                          <TableCell><Skeleton width={60} /></TableCell>
                          <TableCell><Skeleton width={100} /></TableCell>
                          <TableCell align="center"><Skeleton width={60} /></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      months.map((month, index) => {
                        const yearMonth = `${selectedYear}-${month}`;
                        const lock = locks.find((l) => l.year_month === yearMonth);
                        const isLocked = lock?.status === 'locked';
                        return (
                          <Fade in key={yearMonth} timeout={300} style={{ transitionDelay: `${index * 30}ms` }}>
                            <TableRow hover sx={{
                              bgcolor: isLocked ? alpha(theme.palette.success.main, 0.04) : 'transparent',
                            }}>
                              <TableCell sx={{ fontWeight: 600 }}>{selectedYear}.{month}</TableCell>
                              <TableCell align="center">
                                {isLocked ? (
                                  <Chip icon={<LockIcon />} label="마감" size="small" color="success" />
                                ) : (
                                  <Chip icon={<LockOpenIcon />} label="미마감" size="small" color="warning" variant="outlined" />
                                )}
                              </TableCell>
                              <TableCell align="right">{(lock?.locked_vouchers ?? 0).toLocaleString()}</TableCell>
                              <TableCell align="right">{(lock?.total_vouchers ?? 0).toLocaleString()}</TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {lock?.locked_at ? new Date(lock.locked_at).toLocaleDateString('ko-KR') : '—'}
                              </TableCell>
                              <TableCell>
                                {lock?.locked_by_name ? (
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Avatar sx={{ width: 22, height: 22, fontSize: '0.65rem', bgcolor: getAvatarColor(lock.locked_by_name) }}>
                                      {getInitials(lock.locked_by_name)}
                                    </Avatar>
                                    <Typography variant="body2">{lock.locked_by_name}</Typography>
                                  </Stack>
                                ) : '—'}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem', maxWidth: 200 }}>
                                <Typography variant="body2" noWrap>{lock?.description || '—'}</Typography>
                              </TableCell>
                              <TableCell align="center">
                                {isLocked ? (
                                  <Button size="small" color="warning" variant="outlined" startIcon={<LockOpenIcon />} onClick={() => handleUnlock(yearMonth)}>
                                    해제
                                  </Button>
                                ) : (
                                  <Button size="small" color="success" variant="contained" startIcon={<LockIcon />} onClick={() => openLockDialog(yearMonth)}>
                                    마감
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          </Fade>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        </Fade>
      )}

      {/* ════════════════════════════════════════
          탭 2: 마감 이력
         ════════════════════════════════════════ */}
      {tab === 'history' && (
        <Fade in timeout={300}>
          <Box>
            {/* 검색 */}
            <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <TextField
                size="small"
                placeholder="대상월, 사용자, 비고 검색..."
                value={auditSearch}
                onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(0); }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: 300 }}
              />
            </Paper>

            {/* 이력 테이블 */}
            <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
              {auditLoading && <LinearProgress />}
              <TableContainer sx={{ maxHeight: 600 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{
                      background: `linear-gradient(90deg, ${alpha(theme.palette.info.main, 0.06)} 0%, ${alpha(theme.palette.background.paper, 1)} 100%)`,
                    }}>
                      <TableCell sx={{ fontWeight: 700 }}>일시</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>대상</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>액션</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>사용자</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>비고</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {auditLoading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton width={120} /></TableCell>
                          <TableCell><Skeleton width={70} /></TableCell>
                          <TableCell align="center"><Skeleton width={50} /></TableCell>
                          <TableCell><Skeleton width={80} /></TableCell>
                          <TableCell><Skeleton width={150} /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredAuditLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                          <HistoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                          <Typography color="text.secondary">
                            {auditSearch ? '검색 결과가 없습니다' : '감사 로그가 없습니다'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAuditLogs
                        .slice(auditPage * 20, auditPage * 20 + 20)
                        .map((log, index) => (
                          <Fade in key={log.id} timeout={300} style={{ transitionDelay: `${index * 20}ms` }}>
                            <TableRow hover>
                              <TableCell sx={{ fontSize: '0.8rem' }}>{formatKST(log.created_at)}</TableCell>
                              <TableCell>
                                <Chip label={log.year_month} size="small" variant="outlined" />
                              </TableCell>
                              <TableCell align="center">
                                <Chip
                                  icon={log.action === 'lock' ? <LockIcon /> : <LockOpenIcon />}
                                  label={log.action === 'lock' ? '마감' : '해제'}
                                  size="small"
                                  color={log.action === 'lock' ? 'success' : 'warning'}
                                />
                              </TableCell>
                              <TableCell>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  <Avatar sx={{ width: 22, height: 22, fontSize: '0.65rem', bgcolor: getAvatarColor(log.user_name) }}>
                                    {getInitials(log.user_name)}
                                  </Avatar>
                                  <Typography variant="body2">{log.user_name}</Typography>
                                </Stack>
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem', maxWidth: 300 }}>
                                <Typography variant="body2" noWrap>{log.description || '—'}</Typography>
                              </TableCell>
                            </TableRow>
                          </Fade>
                        ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={filteredAuditLogs.length}
                page={auditPage}
                onPageChange={(_, p) => setAuditPage(p)}
                rowsPerPage={20}
                rowsPerPageOptions={[20]}
                labelRowsPerPage=""
                sx={{ borderTop: '1px solid', borderColor: 'divider' }}
              />
            </Paper>
          </Box>
        </Fade>
      )}

      {/* ─── 마감 다이얼로그 ─── */}
      <Dialog open={lockDialogOpen} onClose={() => setLockDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LockIcon color="success" />
            <span>{lockTarget} 마감</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
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
          <Button onClick={() => setLockDialogOpen(false)} disabled={lockProcessing}>취소</Button>
          <Button variant="contained" color="success" startIcon={<LockIcon />} onClick={handleLock} disabled={lockProcessing}>
            {lockProcessing ? '처리 중...' : '마감 확정'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
