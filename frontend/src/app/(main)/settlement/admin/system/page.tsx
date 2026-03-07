'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Skeleton, Chip,
  LinearProgress, useTheme, Table, TableHead, TableBody,
  TableRow, TableCell,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import DnsIcon from '@mui/icons-material/Dns';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import { AppPageContainer, AppPageHeader } from '@/components/ui';
import { settlementAdminApi } from '@/lib/api';

// --- 게이지 컴포넌트 ---
function GaugeBar({ label, value, max, unit, color }: {
  label: string; value: number; max: number; unit: string; color: string;
}) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const theme = useTheme();
  const gaugeColor = percent > 85 ? theme.palette.error.main : percent > 70 ? theme.palette.warning.main : color;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary">{label}</Typography>
        <Typography variant="caption" fontWeight={700} sx={{ fontFeatureSettings: '"tnum" on' }}>
          {value.toLocaleString()}{unit} / {max.toLocaleString()}{unit}
        </Typography>
      </Stack>
      <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: alpha(gaugeColor, 0.1) }}>
        <Box sx={{
          position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4,
          width: `${percent}%`, bgcolor: gaugeColor,
          transition: 'width 0.6s ease',
        }} />
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block', textAlign: 'right' }}>
        {percent.toFixed(1)}%
      </Typography>
    </Box>
  );
}

// --- 서비스 상태 카드 ---
function ServiceCard({ name, icon, status, details }: {
  name: string; icon: React.ReactNode;
  status: string; details: React.ReactNode;
}) {
  const theme = useTheme();
  const isHealthy = status === 'healthy';
  const color = isHealthy ? theme.palette.success.main : theme.palette.error.main;

  return (
    <Paper sx={{
      p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider',
      borderTop: `3px solid ${color}`,
      transition: 'box-shadow 0.2s',
      '&:hover': { boxShadow: `0 4px 20px ${alpha(color, 0.1)}` },
    }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
          <Typography variant="subtitle2" fontWeight={700}>{name}</Typography>
        </Stack>
        <Chip
          icon={isHealthy ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <CancelIcon sx={{ fontSize: 14 }} />}
          label={isHealthy ? '정상' : '이상'}
          size="small"
          sx={{
            bgcolor: alpha(color, 0.1), color, fontWeight: 700, fontSize: '0.7rem',
            '& .MuiChip-icon': { color },
          }}
        />
      </Stack>
      {details}
    </Paper>
  );
}

// --- 메인 ---
export default function SystemHealthPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [health, setHealth] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settlementAdminApi.getSystemHealth();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setHealth((res.data as any)?.data ?? res.data);
    } catch {
      enqueueSnackbar('시스템 상태를 불러오는데 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  const c = theme.palette;
  const pg = health?.services?.postgresql;
  const rd = health?.services?.redis;
  const sv = health?.services?.server;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<MonitorHeartIcon />}
        title="시스템 헬스"
        description="정산 시스템 인프라 상태를 실시간으로 모니터링합니다"
        color="success"
        onRefresh={loadData}
        loading={loading}
        chips={health ? [
          <Chip
            key="overall"
            label={health.overall === 'healthy' ? '전체 정상' : '이상 감지'}
            size="small"
            color={health.overall === 'healthy' ? 'success' : 'error'}
            sx={{ fontWeight: 700 }}
          />,
        ] : []}
      />

      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={280} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
      ) : health && (
        <>
          {/* --- 서비스 상태 카드 --- */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {/* PostgreSQL */}
            <ServiceCard
              name="PostgreSQL"
              icon={<StorageIcon />}
              status={pg?.status || 'unhealthy'}
              details={pg?.status === 'healthy' ? (
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">응답 시간</Typography>
                    <Typography variant="caption" fontWeight={700}>{pg.response_ms}ms</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">활성 연결</Typography>
                    <Typography variant="caption" fontWeight={700}>{pg.active_connections}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">DB 크기</Typography>
                    <Typography variant="caption" fontWeight={700}>{pg.database_size}</Typography>
                  </Stack>
                </Stack>
              ) : (
                <Typography variant="caption" color="error">{pg?.error}</Typography>
              )}
            />

            {/* Redis */}
            <ServiceCard
              name="Redis"
              icon={<MemoryIcon />}
              status={rd?.status || 'unhealthy'}
              details={rd?.status === 'healthy' ? (
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">응답 시간</Typography>
                    <Typography variant="caption" fontWeight={700}>{rd.response_ms}ms</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">메모리</Typography>
                    <Typography variant="caption" fontWeight={700}>{rd.memory_used}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Worker</Typography>
                    <Typography variant="caption" fontWeight={700}>{rd.workers}개</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">큐 (H/D/L)</Typography>
                    <Typography variant="caption" fontWeight={700}>
                      {rd.queues?.high || 0} / {rd.queues?.default || 0} / {rd.queues?.low || 0}
                    </Typography>
                  </Stack>
                </Stack>
              ) : (
                <Typography variant="caption" color="error">{rd?.error}</Typography>
              )}
            />

            {/* Server */}
            <ServiceCard
              name="서버"
              icon={<DnsIcon />}
              status={sv?.status || 'unknown'}
              details={sv?.status === 'healthy' ? (
                <Stack spacing={1.5}>
                  <GaugeBar
                    label="메모리" value={sv.memory.used_mb} max={sv.memory.total_mb}
                    unit="MB" color={c.info.main}
                  />
                  <GaugeBar
                    label="디스크" value={Math.round(sv.disk.used_gb * 10) / 10}
                    max={Math.round(sv.disk.total_gb * 10) / 10}
                    unit="GB" color={c.warning.main}
                  />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">업타임</Typography>
                    <Typography variant="caption" fontWeight={700}>{sv.uptime}</Typography>
                  </Stack>
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary">{sv?.error || '정보 없음'}</Typography>
              )}
            />
          </Box>

          {/* --- 테이블 행 수 --- */}
          {pg?.table_counts && (
            <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
                데이터베이스 테이블 현황
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>테이블</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>행 수</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(pg.table_counts as Record<string, number>)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .map(([table, count]) => (
                      <TableRow key={table} sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{table}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600, fontFeatureSettings: '"tnum" on' }}>
                          {(count as number).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}
    </AppPageContainer>
  );
}
