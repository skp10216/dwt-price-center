'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Skeleton, Chip, Button,
  Table, TableHead, TableBody, TableRow, TableCell,
  ToggleButtonGroup, ToggleButton, Alert, AlertTitle,
  useTheme,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import DnsIcon from '@mui/icons-material/Dns';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import RefreshIcon from '@mui/icons-material/Refresh';
import { AppPageContainer, AppPageHeader } from '@/components/ui';
import { settlementAdminApi } from '@/lib/api';

// ─── Sparkline SVG ───────────────────────────────────────────────
function Sparkline({ data, color, height = 40, width = 200, showArea = true }: {
  data: number[]; color: string; height?: number; width?: number; showArea?: boolean;
}) {
  if (!data.length) return <Box sx={{ width, height }} />;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * width,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {showArea && <path d={areaPath} fill={color} opacity={0.1} />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
      {points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={color} />
      )}
    </svg>
  );
}

// ─── 게이지바 ────────────────────────────────────────────────────
function GaugeBar({ label, value, max, unit, color, suffix }: {
  label: string; value: number; max: number; unit: string; color: string; suffix?: string;
}) {
  const theme = useTheme();
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const gaugeColor = percent > 85 ? theme.palette.error.main : percent > 70 ? theme.palette.warning.main : color;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary">{label}</Typography>
        <Typography variant="caption" fontWeight={700} sx={{ fontFeatureSettings: '"tnum" on' }}>
          {value.toLocaleString()}{unit} / {max.toLocaleString()}{unit}
          {suffix && <Typography component="span" variant="caption" color="text.disabled"> {suffix}</Typography>}
        </Typography>
      </Stack>
      <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: alpha(gaugeColor, 0.1) }}>
        <Box sx={{
          position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4,
          width: `${percent}%`, bgcolor: gaugeColor, transition: 'width 0.6s ease',
        }} />
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block', textAlign: 'right', fontFeatureSettings: '"tnum" on' }}>
        {percent.toFixed(1)}%
      </Typography>
    </Box>
  );
}

// ─── 서비스 카드 ─────────────────────────────────────────────────
function ServiceCard({ name, icon, status, details }: {
  name: string; icon: React.ReactNode; status: string; details: React.ReactNode;
}) {
  const theme = useTheme();
  const isHealthy = status === 'healthy';
  const color = isHealthy ? theme.palette.success.main : theme.palette.error.main;

  return (
    <Paper sx={{
      p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider',
      borderTop: `3px solid ${color}`, transition: 'box-shadow 0.2s',
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
          sx={{ bgcolor: alpha(color, 0.1), color, fontWeight: 700, fontSize: '0.7rem', '& .MuiChip-icon': { color } }}
        />
      </Stack>
      {details}
    </Paper>
  );
}

// ─── KV Row ──────────────────────────────────────────────────────
function KV({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" fontWeight={700} color={color} sx={{ fontFeatureSettings: '"tnum" on' }}>{value}</Typography>
    </Stack>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────
export default function SystemHealthPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [health, setHealth] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any>(null);
  const [historyRange, setHistoryRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const res = await settlementAdminApi.getSystemHealth();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setHealth((res.data as any)?.data ?? res.data);
      setLastChecked(new Date());
    } catch {
      enqueueSnackbar('시스템 상태 로딩 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await settlementAdminApi.getHealthHistory(historyRange);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setHistory((res.data as any)?.data ?? res.data);
    } catch {
      // 히스토리 로딩 실패는 무시 (아직 데이터 없을 수 있음)
    }
  }, [historyRange]);

  useEffect(() => { loadHealth(); }, [loadHealth]);
  useEffect(() => { loadHistory(); }, [loadHistory, historyRange]);

  // 60초 자동 새로고침
  useEffect(() => {
    intervalRef.current = setInterval(() => { loadHealth(); loadHistory(); }, 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadHealth, loadHistory]);

  const c = theme.palette;
  const pg = health?.services?.postgresql;
  const rd = health?.services?.redis;
  const sv = health?.services?.server;
  const alerts: { level: string; service: string; message: string }[] = health?.alerts || [];

  // 히스토리 데이터 추출
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pts: any[] = history?.points || [];
  const memHistory = pts.map((p: { mem: number }) => p.mem);
  const cpuHistory = pts.map((p: { cpu: number }) => p.cpu);
  const diskHistory = pts.map((p: { disk: number }) => p.disk);
  const pgMsHistory = pts.map((p: { pg_ms: number }) => p.pg_ms);
  const redisMsHistory = pts.map((p: { redis_ms: number }) => p.redis_ms);
  const queueHistory = pts.map((p: { queue: number }) => p.queue);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableGrowth: Record<string, { before: number; after: number; change: number }> = history?.table_growth || {};

  const formatTime = (d: Date) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<MonitorHeartIcon />}
        title="시스템 헬스"
        description="정산 시스템 인프라 상태를 실시간으로 모니터링합니다"
        color="success"
        onRefresh={() => { loadHealth(); loadHistory(); }}
        loading={loading}
        chips={[
          ...(health ? [
            <Chip
              key="overall"
              label={health.overall === 'healthy' ? '전체 정상' : '이상 감지'}
              size="small"
              color={health.overall === 'healthy' ? 'success' : 'error'}
              sx={{ fontWeight: 700 }}
            />,
          ] : []),
          ...(lastChecked ? [
            <Chip
              key="time"
              icon={<RefreshIcon sx={{ fontSize: 12 }} />}
              label={`${formatTime(lastChecked)} (60s 자동)`}
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.65rem' }}
            />,
          ] : []),
        ]}
      />

      {/* 임계치 경고 배너 */}
      {alerts.length > 0 && (
        <Stack spacing={1}>
          {alerts.map((a, i) => (
            <Alert
              key={i}
              severity={a.level === 'critical' ? 'error' : 'warning'}
              icon={a.level === 'critical' ? <ErrorOutlineIcon /> : <WarningAmberIcon />}
              sx={{ borderRadius: 2, '& .MuiAlert-message': { fontSize: '0.82rem', fontWeight: 600 } }}
            >
              <AlertTitle sx={{ fontSize: '0.78rem', fontWeight: 700, mb: 0 }}>
                {a.service.toUpperCase()}
              </AlertTitle>
              {a.message}
            </Alert>
          ))}
        </Stack>
      )}

      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={320} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
      ) : health && (
        <>
          {/* ── 서비스 카드 3개 ── */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {/* PostgreSQL */}
            <ServiceCard
              name="PostgreSQL"
              icon={<StorageIcon />}
              status={pg?.status || 'unhealthy'}
              details={pg?.status === 'healthy' ? (
                <Stack spacing={1}>
                  <KV label="응답 시간" value={`${pg.response_ms}ms`} />
                  <KV label="연결 (활성/유휴/전체)" value={`${pg.connections?.active || 0} / ${pg.connections?.idle || 0} / ${pg.connections?.total || 0}`} />
                  <KV label="DB 크기" value={pg.database_size} />
                  {pg.error_summary && (
                    <KV
                      label="최근 1시간 에러"
                      value={pg.error_summary.last_hour_count}
                      color={pg.error_summary.last_hour_count > 0 ? 'error.main' : undefined}
                    />
                  )}
                  {pgMsHistory.length > 3 && (
                    <Box>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>응답 시간 추세</Typography>
                      <Sparkline data={pgMsHistory} color={c.primary.main} width={200} height={30} />
                    </Box>
                  )}
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
                  <KV label="응답 시간" value={`${rd.response_ms}ms`} />
                  <KV label="메모리 (현재/피크)" value={`${rd.memory_used} / ${rd.memory_peak || '-'}`} />
                  <KV label="Worker" value={`${rd.workers}개`} color={rd.workers === 0 ? 'error.main' : undefined} />
                  <KV label="큐 (H/D/L)" value={`${rd.queues?.high || 0} / ${rd.queues?.default || 0} / ${rd.queues?.low || 0}`} />
                  <KV label="실패" value={rd.failed_jobs} color={rd.failed_jobs > 0 ? 'error.main' : undefined} />
                  {redisMsHistory.length > 3 && (
                    <Box>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>응답 시간 추세</Typography>
                      <Sparkline data={redisMsHistory} color={c.secondary.main} width={200} height={30} />
                    </Box>
                  )}
                </Stack>
              ) : (
                <Typography variant="caption" color="error">{rd?.error}</Typography>
              )}
            />

            {/* 서버 */}
            <ServiceCard
              name="서버"
              icon={<DnsIcon />}
              status={sv?.status || 'unknown'}
              details={sv?.status === 'healthy' ? (
                <Stack spacing={1.5}>
                  <GaugeBar label="메모리" value={sv.memory.used_mb} max={sv.memory.total_mb} unit="MB" color={c.info.main} />
                  <GaugeBar label="Swap" value={sv.swap.used_mb} max={sv.swap.total_mb} unit="MB" color={c.secondary.main} />
                  <GaugeBar label="디스크" value={Math.round(sv.disk.used_gb * 10) / 10} max={Math.round(sv.disk.total_gb * 10) / 10} unit="GB" color={c.warning.main} />
                  <GaugeBar
                    label="CPU 로드"
                    value={Math.round(sv.cpu_loadavg[0] * 100) / 100}
                    max={sv.cpu_cores || 1}
                    unit=""
                    color={c.error.main}
                    suffix={`(${sv.cpu_cores}코어)`}
                  />
                  <KV label="업타임" value={sv.uptime} />
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary">{sv?.error || '정보 없음'}</Typography>
              )}
            />
          </Box>

          {/* ── 추세 차트 섹션 ── */}
          <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={700}>리소스 추세</Typography>
              <ToggleButtonGroup
                value={historyRange}
                exclusive
                onChange={(_, v) => v && setHistoryRange(v)}
                size="small"
              >
                <ToggleButton value="24h" sx={{ fontSize: '0.7rem', px: 1.5, py: 0.25 }}>24시간</ToggleButton>
                <ToggleButton value="7d" sx={{ fontSize: '0.7rem', px: 1.5, py: 0.25 }}>7일</ToggleButton>
                <ToggleButton value="30d" sx={{ fontSize: '0.7rem', px: 1.5, py: 0.25 }}>30일</ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            {pts.length < 3 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  데이터 수집 중입니다. 페이지를 주기적으로 방문하면 추세 데이터가 쌓입니다.
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  ({history?.point_count || 0}개 수집 / 5분 간격 저장)
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <TrendCard label="메모리 사용률" unit="%" data={memHistory} color={c.info.main} />
                <TrendCard label="CPU 로드" unit="" data={cpuHistory} color={c.error.main} />
                <TrendCard label="디스크 사용률" unit="%" data={diskHistory} color={c.warning.main} />
                <TrendCard label="PostgreSQL 응답" unit="ms" data={pgMsHistory} color={c.primary.main} />
                <TrendCard label="Redis 응답" unit="ms" data={redisMsHistory} color={c.secondary.main} />
                <TrendCard label="큐 적체" unit="건" data={queueHistory} color={c.error.main} />
              </Box>
            )}
          </Paper>

          {/* ── 테이블 현황 ── */}
          {pg?.table_stats && (
            <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
                데이터베이스 테이블 현황
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>테이블</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>행 수</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>크기</TableCell>
                    {Object.keys(tableGrowth).length > 0 && (
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>증감 ({historyRange})</TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(pg.table_stats as Record<string, { rows: number; size: string }>)
                    .sort(([, a], [, b]) => (b.rows) - (a.rows))
                    .map(([table, info]) => {
                      const growth = tableGrowth[table];
                      return (
                        <TableRow key={table} sx={{ '&:last-child td': { border: 0 } }}>
                          <TableCell sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{table}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600, fontFeatureSettings: '"tnum" on' }}>
                            {info.rows >= 0 ? info.rows.toLocaleString() : 'N/A'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.78rem', color: 'text.secondary', fontFeatureSettings: '"tnum" on' }}>
                            {info.size}
                          </TableCell>
                          {Object.keys(tableGrowth).length > 0 && (
                            <TableCell align="right" sx={{ fontSize: '0.78rem', fontFeatureSettings: '"tnum" on' }}>
                              {growth ? (
                                <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                                  {growth.change > 0 ? (
                                    <TrendingUpIcon sx={{ fontSize: 14, color: 'success.main' }} />
                                  ) : growth.change < 0 ? (
                                    <TrendingDownIcon sx={{ fontSize: 14, color: 'error.main' }} />
                                  ) : null}
                                  <Typography variant="caption" fontWeight={600}
                                    color={growth.change > 0 ? 'success.main' : growth.change < 0 ? 'error.main' : 'text.disabled'}>
                                    {growth.change > 0 ? '+' : ''}{growth.change.toLocaleString()}
                                  </Typography>
                                </Stack>
                              ) : (
                                <Typography variant="caption" color="text.disabled">-</Typography>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </Paper>
          )}

          {/* ── 에러 로그 요약 ── */}
          {pg?.error_summary?.recent?.length > 0 && (
            <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                최근 에러 로그
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>시간</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>액션</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>설명</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {pg.error_summary.recent.map((err: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontSize: '0.78rem', fontFeatureSettings: '"tnum" on', whiteSpace: 'nowrap' }}>
                        {err.created_at ? new Date(err.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>{err.action}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{err.description || '-'}</TableCell>
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

// ─── 추세 카드 ───────────────────────────────────────────────────
function TrendCard({ label, unit, data, color }: {
  label: string; unit: string; data: number[]; color: string;
}) {
  const current = data.length > 0 ? data[data.length - 1] : 0;
  const prev = data.length > 1 ? data[0] : current;
  const diff = current - prev;
  const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';

  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(color, 0.03), border: '1px solid', borderColor: alpha(color, 0.1) }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary">{label}</Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="caption" fontWeight={800} sx={{ fontFeatureSettings: '"tnum" on', color }}>
            {typeof current === 'number' ? (Number.isInteger(current) ? current.toLocaleString() : current.toFixed(1)) : current}
            {unit}
          </Typography>
          {trend !== 'flat' && (
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: trend === 'up' ? 'error.main' : 'success.main' }}>
              {trend === 'up' ? '▲' : '▼'}
            </Typography>
          )}
        </Stack>
      </Stack>
      <Sparkline data={data} color={color} width={180} height={32} />
    </Box>
  );
}
