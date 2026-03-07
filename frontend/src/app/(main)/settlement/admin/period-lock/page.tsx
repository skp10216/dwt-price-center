'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Chip, useTheme, Skeleton,
  Table, TableHead, TableBody, TableRow, TableCell,
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

export default function PeriodLockPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [periods, setPeriods] = useState<any[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([]);

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

  const c = theme.palette;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<CalendarMonthIcon />}
        title="기간 마감 관리"
        description="월별 마감 상태를 한눈에 확인하고 이력을 추적합니다"
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
            <Skeleton key={i} variant="rounded" height={100} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : (
        <>
          {/* 월별 카드 그리드 */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 2 }}>
            {periods.map((p) => {
              const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.OPEN;
              return (
                <Paper key={p.id} sx={{
                  p: 2, borderRadius: 2, textAlign: 'center',
                  border: '1px solid', borderColor: alpha(cfg.color, 0.3),
                  borderTop: `3px solid ${cfg.color}`,
                  background: alpha(cfg.color, 0.03),
                  transition: 'all 0.2s',
                  '&:hover': { boxShadow: `0 2px 12px ${alpha(cfg.color, 0.1)}` },
                }}>
                  <Typography variant="body2" fontWeight={800} sx={{ fontFeatureSettings: '"tnum" on', mb: 0.5 }}>
                    {p.year_month}
                  </Typography>
                  <AppStatusChip semantic={cfg.semantic} label={cfg.label} />
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
    </AppPageContainer>
  );
}
