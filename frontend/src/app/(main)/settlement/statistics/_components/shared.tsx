'use client';

import { usePathname } from 'next/navigation';
import { Box, Typography, Paper, Skeleton, alpha, useTheme, Card, CardContent, Tabs, Tab } from '@mui/material';
import { useAppRouter } from '@/lib/navigation';

// ─── 포맷 유틸 ─────────────────────────────────────────────

export const fmt = (v: number) => {
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
  return v.toLocaleString();
};

export const fmtFull = (v: number) =>
  new Intl.NumberFormat('ko-KR').format(Math.round(v));

// ─── 차트 공통 스타일 ──────────────────────────────────────

export const CHART_MARGIN = { top: 8, right: 24, left: 0, bottom: 0 };

export function useChartStyle() {
  const theme = useTheme();
  return {
    gridStroke: alpha(theme.palette.divider, 0.4),
    axisStroke: 'transparent',
    tickStyle: { fontSize: 11, fill: theme.palette.text.secondary, fontFamily: 'inherit' },
    theme,
  };
}

// ─── 커스텀 툴팁 ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        backdropFilter: 'blur(12px)',
        bgcolor: (t) => alpha(t.palette.background.paper, 0.92),
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        minWidth: 140,
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 0.5, display: 'block' }}>
        {label}
      </Typography>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.3 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
          <Typography variant="body2" fontSize="0.8rem">
            {p.name}:&nbsp;
            <strong>
              {p.name.includes('률') || p.name.includes('%')
                ? `${Number(p.value).toFixed(1)}%`
                : fmtFull(p.value)}
            </strong>
          </Typography>
        </Box>
      ))}
    </Paper>
  );
}

// ─── 섹션 래퍼 (고급) ─────────────────────────────────────

export function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        p: { xs: 2, md: 3 },
        background: (t) =>
          t.palette.mode === 'dark'
            ? alpha(t.palette.background.paper, 0.6)
            : t.palette.background.paper,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={700} letterSpacing="-0.01em">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

// ─── 차트 스켈레톤 ────────────────────────────────────────

export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <Skeleton
      variant="rounded"
      height={height}
      sx={{ borderRadius: 2, bgcolor: (t) => alpha(t.palette.action.hover, 0.4) }}
      animation="wave"
    />
  );
}

// ─── 빈 상태 ──────────────────────────────────────────────

export function EmptyState({ message = '데이터가 없습니다.' }: { message?: string }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, opacity: 0.6 }}>
      <Typography variant="body2" color="text.secondary">{message}</Typography>
    </Box>
  );
}

// ─── 스크롤 가능한 컨테이너 sx ────────────────────────────

export const SCROLLABLE_SX = {
  overflow: 'auto',
  '&::-webkit-scrollbar': { width: 6, height: 6 },
  '&::-webkit-scrollbar-thumb': {
    borderRadius: 3,
    bgcolor: 'action.disabled',
  },
};

// ─── KPI 카드 (공통) ─────────────────────────────────────

export function KpiCard({ label, value, subtitle, icon, color }: {
  label: string; value: string; subtitle?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: alpha(color, 0.2),
        borderRadius: 3,
        position: 'relative',
        overflow: 'hidden',
        background: (t) => `linear-gradient(135deg, ${alpha(color, 0.04)} 0%, ${t.palette.background.paper} 60%)`,
        boxShadow: `0 1px 4px ${alpha(color, 0.06)}`,
        transition: 'box-shadow 0.2s, transform 0.2s',
        '&:hover': {
          boxShadow: `0 4px 16px ${alpha(color, 0.12)}`,
          transform: 'translateY(-1px)',
        },
        '&::before': {
          content: '""', position: 'absolute',
          top: 0, left: 0, bottom: 0, width: 4,
          bgcolor: color, borderRadius: '4px 0 0 4px',
        },
      }}
    >
      <CardContent sx={{ pl: 3, py: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <Box sx={{
            width: 28, height: 28, borderRadius: 1.5,
            bgcolor: alpha(color, 0.1), display: 'flex',
            alignItems: 'center', justifyContent: 'center', color,
          }}>
            {icon}
          </Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
        </Box>
        <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">{value}</Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 탭 내비게이션 ───────────────────────────────────────

const STAT_TABS = [
  { label: '정산 현황', path: '/settlement/statistics' },
  { label: '거래처 분석', path: '/settlement/statistics/counterparty' },
  { label: '수익률 분석', path: '/settlement/statistics/profit' },
];

export function StatisticsTabNav() {
  const pathname = usePathname();
  const router = useAppRouter();
  const currentIdx = STAT_TABS.findIndex(
    (t) => t.path === pathname || (t.path !== '/settlement/statistics' && pathname.startsWith(t.path))
  );

  return (
    <Tabs
      value={currentIdx === -1 ? 0 : currentIdx}
      onChange={(_, idx) => router.push(STAT_TABS[idx].path)}
      sx={{
        mb: 2,
        minHeight: 36,
        '& .MuiTab-root': {
          minHeight: 36, py: 0.75, px: 2,
          fontSize: '0.82rem', fontWeight: 600,
          textTransform: 'none',
        },
        '& .MuiTabs-indicator': { height: 2.5, borderRadius: 2 },
      }}
    >
      {STAT_TABS.map((t) => <Tab key={t.path} label={t.label} />)}
    </Tabs>
  );
}
