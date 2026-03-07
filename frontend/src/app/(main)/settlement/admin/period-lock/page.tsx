'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Chip, useTheme, Skeleton,
  Table, TableHead, TableBody, TableRow, TableCell,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import TuneIcon from '@mui/icons-material/Tune';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { AppPageContainer, AppPageHeader, AppStatusChip } from '@/components/ui';
import { settlementAdminApi } from '@/lib/api';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

const STATUS_CONFIG: Record<string, { semantic: 'success' | 'error' | 'warning' | 'neutral'; label: string; color: string }> = {
  OPEN: { semantic: 'success', label: '미마감', color: '#388e3c' },
  LOCKED: { semantic: 'error', label: '마감', color: '#d32f2f' },
  ADJUSTING: { semantic: 'warning', label: '수정중', color: '#ed6c02' },
};

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  PERIOD_LOCK: { label: '마감', color: '#d32f2f' },
  PERIOD_UNLOCK: { label: '해제', color: '#388e3c' },
  PERIOD_ADJUST: { label: '수정 진입', color: '#ed6c02' },
};

type ActionType = 'lock' | 'unlock' | 'adjust';

const ACTION_CONFIG: Record<ActionType, { title: string; description: string; color: 'error' | 'success' | 'warning'; buttonLabel: string }> = {
  lock:   { title: '기간 마감', description: '해당 월의 모든 미마감 전표를 마감 처리합니다. 마감 후에는 전표/입출금 수정이 불가합니다.', color: 'error', buttonLabel: '마감 실행' },
  unlock: { title: '마감 해제', description: '마감을 해제하고 전표를 배분 실적 기반으로 상태를 복원합니다.', color: 'success', buttonLabel: '해제 실행' },
  adjust: { title: '수정 모드 전환', description: '마감 상태를 유지하면서 조정전표만 생성할 수 있는 수정 모드로 전환합니다.', color: 'warning', buttonLabel: '수정 모드 진입' },
};

export default function PeriodLockPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [periods, setPeriods] = useState<any[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([]);

  // 다이얼로그 상태
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<ActionType>('lock');
  const [dialogYearMonth, setDialogYearMonth] = useState('');
  const [dialogDescription, setDialogDescription] = useState('');
  const [dialogLoading, setDialogLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settlementAdminApi.getPeriodLockStatus();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res.data as any)?.data ?? res.data;
      setPeriods(data.periods || []);
      setStatusCounts(data.status_counts || {});
      setHistory(data.history || []);
    } catch {
      enqueueSnackbar('마감 현황 로딩 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  const openActionDialog = (action: ActionType, yearMonth: string) => {
    setDialogAction(action);
    setDialogYearMonth(yearMonth);
    setDialogDescription('');
    setDialogOpen(true);
  };

  const handleAction = async () => {
    setDialogLoading(true);
    try {
      const desc = dialogDescription || undefined;
      if (dialogAction === 'lock') {
        await settlementAdminApi.lockPeriod(dialogYearMonth, desc);
        enqueueSnackbar(`${dialogYearMonth} 마감 완료`, { variant: 'success' });
      } else if (dialogAction === 'unlock') {
        await settlementAdminApi.unlockPeriod(dialogYearMonth, desc);
        enqueueSnackbar(`${dialogYearMonth} 마감 해제 완료`, { variant: 'success' });
      } else {
        await settlementAdminApi.adjustPeriod(dialogYearMonth, desc);
        enqueueSnackbar(`${dialogYearMonth} 수정 모드 전환 완료`, { variant: 'success' });
      }
      setDialogOpen(false);
      await loadData();
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail || '작업 실패';
      enqueueSnackbar(detail, { variant: 'error' });
    } finally {
      setDialogLoading(false);
    }
  };

  const c = theme.palette;
  const cfg = dialogAction ? ACTION_CONFIG[dialogAction] : ACTION_CONFIG.lock;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<CalendarMonthIcon />}
        title="기간 마감 관리"
        description="월별 마감 상태를 확인하고 마감/해제/수정 모드를 조작합니다"
        color="error"
        onRefresh={loadData}
        loading={loading}
        chips={[
          ...(statusCounts.LOCKED ? [<Chip key="locked" icon={<LockIcon sx={{ fontSize: 14 }} />} label={`마감 ${statusCounts.LOCKED}`} size="small" color="error" sx={{ fontWeight: 700 }} />] : []),
          ...(statusCounts.OPEN ? [<Chip key="open" icon={<LockOpenIcon sx={{ fontSize: 14 }} />} label={`미마감 ${statusCounts.OPEN}`} size="small" color="success" sx={{ fontWeight: 700 }} />] : []),
          ...(statusCounts.ADJUSTING ? [<Chip key="adj" icon={<TuneIcon sx={{ fontSize: 14 }} />} label={`수정중 ${statusCounts.ADJUSTING}`} size="small" color="warning" sx={{ fontWeight: 700 }} />] : []),
        ]}
      />

      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 2 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={140} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : (
        <>
          {/* 월별 카드 그리드 */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 2 }}>
            {periods.map((p) => {
              const statusCfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.OPEN;
              return (
                <Paper key={p.id} sx={{
                  p: 2, borderRadius: 2, textAlign: 'center',
                  border: '1px solid', borderColor: alpha(statusCfg.color, 0.3),
                  borderTop: `3px solid ${statusCfg.color}`,
                  background: alpha(statusCfg.color, 0.03),
                  transition: 'all 0.2s',
                  '&:hover': { boxShadow: `0 2px 12px ${alpha(statusCfg.color, 0.1)}` },
                }}>
                  <Typography variant="body2" fontWeight={800} sx={{ fontFeatureSettings: '"tnum" on', mb: 0.5 }}>
                    {p.year_month}
                  </Typography>
                  <AppStatusChip semantic={statusCfg.semantic} label={statusCfg.label} />
                  {p.locked_by_name && (
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5, fontSize: '0.65rem' }}>
                      {p.locked_by_name}
                    </Typography>
                  )}
                  {p.locked_at && (
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontSize: '0.6rem', fontFeatureSettings: '"tnum" on' }}>
                      {formatDate(p.locked_at)}
                    </Typography>
                  )}
                  {/* 액션 버튼 */}
                  <Stack direction="row" spacing={0.5} justifyContent="center" sx={{ mt: 1 }}>
                    {p.status === 'OPEN' && (
                      <Button size="small" variant="outlined" color="error" onClick={() => openActionDialog('lock', p.year_month)}
                        sx={{ fontSize: '0.65rem', py: 0.25, px: 1, minWidth: 0 }}>
                        마감
                      </Button>
                    )}
                    {p.status === 'LOCKED' && (
                      <>
                        <Button size="small" variant="outlined" color="success" onClick={() => openActionDialog('unlock', p.year_month)}
                          sx={{ fontSize: '0.65rem', py: 0.25, px: 1, minWidth: 0 }}>
                          해제
                        </Button>
                        <Button size="small" variant="outlined" color="warning" onClick={() => openActionDialog('adjust', p.year_month)}
                          sx={{ fontSize: '0.65rem', py: 0.25, px: 1, minWidth: 0 }}>
                          수정
                        </Button>
                      </>
                    )}
                    {p.status === 'ADJUSTING' && (
                      <Button size="small" variant="outlined" color="error" onClick={() => openActionDialog('lock', p.year_month)}
                        sx={{ fontSize: '0.65rem', py: 0.25, px: 1, minWidth: 0 }}>
                        마감 복원
                      </Button>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Box>

          {/* 마감 이력 */}
          {history.length > 0 && (
            <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" fontWeight={700}>마감 변경 이력</Typography>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap', bgcolor: alpha(c.error.main, 0.03) } }}>
                    <TableCell>시간</TableCell>
                    <TableCell>작업</TableCell>
                    <TableCell>설명</TableCell>
                    <TableCell>사용자</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.map((h) => {
                    const actionCfg = ACTION_LABEL[h.action] || { label: h.action, color: '#9e9e9e' };
                    return (
                      <TableRow key={h.id} sx={{ '& td': { fontSize: '0.78rem' } }}>
                        <TableCell sx={{ fontFeatureSettings: '"tnum" on', whiteSpace: 'nowrap' }}>
                          {formatDate(h.created_at)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={actionCfg.label}
                            size="small"
                            sx={{
                              height: 20, fontSize: '0.65rem', fontWeight: 700,
                              bgcolor: alpha(actionCfg.color, 0.1), color: actionCfg.color,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{h.description || '-'}</TableCell>
                        <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {h.user_name || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}

      {/* 액션 확인 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => !dialogLoading && setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{cfg.title} — {dialogYearMonth}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {cfg.description}
          </Typography>
          <TextField
            label="사유 (선택)"
            fullWidth
            size="small"
            value={dialogDescription}
            onChange={(e) => setDialogDescription(e.target.value)}
            placeholder="마감/해제 사유를 입력하세요"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} disabled={dialogLoading}>취소</Button>
          <Button
            variant="contained"
            color={cfg.color}
            onClick={handleAction}
            disabled={dialogLoading}
          >
            {dialogLoading ? '처리 중...' : cfg.buttonLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
