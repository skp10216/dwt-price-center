'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Stack, Chip, Paper, alpha, Skeleton,
  IconButton, Tooltip, useTheme, Grid,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import SpeedIcon from '@mui/icons-material/Speed';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PeopleIcon from '@mui/icons-material/People';
import WorkIcon from '@mui/icons-material/Work';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import DonutSmallIcon from '@mui/icons-material/DonutSmall';
import { AppPageContainer, AppPageHeader } from '@/components/ui';
import { settlementAdminApi } from '@/lib/api';

// --- 포맷 유틸 ---
function formatAmount(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '₩0';
  return '₩' + n.toLocaleString('ko-KR');
}
function formatCompact(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '0';
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(1) + '억';
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(0) + '만';
  return n.toLocaleString('ko-KR');
}

// --- KPI 카드 컴포넌트 ---
interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}
function KpiCard({ label, value, sub, icon, color, onClick }: KpiCardProps) {
  const theme = useTheme();
  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 2.5, borderRadius: 3, cursor: onClick ? 'pointer' : 'default',
        border: '1px solid', borderColor: 'divider',
        background: `linear-gradient(135deg, ${alpha(color, 0.04)} 0%, ${alpha(color, 0.01)} 100%)`,
        transition: 'all 0.2s ease',
        '&:hover': onClick ? {
          borderColor: alpha(color, 0.4),
          boxShadow: `0 4px 20px ${alpha(color, 0.12)}`,
          transform: 'translateY(-2px)',
        } : {},
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* 장식 원 */}
      <Box sx={{
        position: 'absolute', top: -20, right: -20,
        width: 80, height: 80, borderRadius: '50%',
        background: alpha(color, 0.06),
      }} />
      <Stack spacing={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box sx={{
            width: 40, height: 40, borderRadius: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: alpha(color, 0.1),
            color: color,
          }}>
            {icon}
          </Box>
          {onClick && (
            <ArrowForwardIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
          )}
        </Stack>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: '0.02em' }}>
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={800} sx={{
            color: 'text.primary', lineHeight: 1.2,
            fontFeatureSettings: '"tnum" on', mt: 0.25,
          }}>
            {value}
          </Typography>
          {sub && (
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              {sub}
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

// --- 경고 카드 ---
interface AlertItem {
  type: string;
  severity: string;
  title: string;
  description: string;
  link: string;
}
function AlertCard({ alert, onClick }: { alert: AlertItem; onClick: () => void }) {
  const theme = useTheme();
  const severityMap: Record<string, { color: string; icon: React.ReactNode }> = {
    high: { color: theme.palette.error.main, icon: <ErrorOutlineIcon /> },
    medium: { color: theme.palette.warning.main, icon: <WarningAmberIcon /> },
    low: { color: theme.palette.info.main, icon: <InfoOutlinedIcon /> },
  };
  const { color, icon } = severityMap[alert.severity] || severityMap.low;

  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 2, borderRadius: 2, cursor: 'pointer',
        border: '1px solid', borderColor: alpha(color, 0.3),
        borderLeft: `4px solid ${color}`,
        background: alpha(color, 0.03),
        transition: 'all 0.2s ease',
        '&:hover': {
          background: alpha(color, 0.06),
          boxShadow: `0 2px 12px ${alpha(color, 0.1)}`,
        },
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box sx={{ color, mt: 0.25 }}>{icon}</Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" fontWeight={700}>{alert.title}</Typography>
          <Typography variant="caption" color="text.secondary">{alert.description}</Typography>
        </Box>
        <ArrowForwardIcon sx={{ fontSize: 16, color: 'text.disabled', mt: 0.5 }} />
      </Stack>
    </Paper>
  );
}

// --- 업무 현황 미니 카드 ---
function StatusMiniCard({ label, items }: { label: string; items: { name: string; value: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
        {label}
      </Typography>
      {/* 바 차트 */}
      {total > 0 && (
        <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', mb: 1.5 }}>
          {items.filter(i => i.value > 0).map((item, idx) => (
            <Box key={idx} sx={{
              width: `${(item.value / total) * 100}%`,
              bgcolor: item.color, minWidth: 4,
            }} />
          ))}
        </Box>
      )}
      <Stack spacing={0.5}>
        {items.map((item, idx) => (
          <Stack key={idx} direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color }} />
              <Typography variant="caption" color="text.secondary">{item.name}</Typography>
            </Stack>
            <Typography variant="caption" fontWeight={700} sx={{ fontFeatureSettings: '"tnum" on' }}>
              {item.value.toLocaleString()}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

// --- 메인 페이지 ---
export default function AdminDashboardPage() {
  const router = useRouter();
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [kpi, setKpi] = useState<any>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [workStatus, setWorkStatus] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [kpiRes, alertRes, workRes] = await Promise.all([
        settlementAdminApi.getKpi(),
        settlementAdminApi.getAlerts(),
        settlementAdminApi.getWorkStatus(),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kpiData = (kpiRes.data as any)?.data ?? kpiRes.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const alertData = (alertRes.data as any)?.data ?? alertRes.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workData = (workRes.data as any)?.data ?? workRes.data;
      setKpi(kpiData);
      setAlerts((alertData.alerts || []) as AlertItem[]);
      setWorkStatus(workData);
    } catch {
      enqueueSnackbar('대시보드 데이터를 불러오는데 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  const c = theme.palette;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<SpeedIcon />}
        title="운영 대시보드"
        description="정산 시스템 전체 현황을 한눈에 확인합니다"
        color="warning"
        onRefresh={loadData}
        loading={loading}
      />

      {/* --- KPI 카드 그리드 --- */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 2 }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={140} sx={{ borderRadius: 3 }} />
          ))
        ) : kpi && (
          <>
            <KpiCard
              label="총 전표"
              value={kpi.vouchers.total.toLocaleString()}
              sub={`이번 달 +${kpi.vouchers.this_month}`}
              icon={<ReceiptIcon />}
              color={c.primary.main}
              onClick={() => router.push('/settlement/vouchers')}
            />
            <KpiCard
              label="미수금(AR)"
              value={formatCompact(kpi.unsettled.receivable)}
              sub={`판매 ${kpi.vouchers.sales_count}건`}
              icon={<TrendingUpIcon />}
              color={c.error.main}
              onClick={() => router.push('/settlement/status')}
            />
            <KpiCard
              label="미지급(AP)"
              value={formatCompact(kpi.unsettled.payable)}
              sub={`매입 ${kpi.vouchers.purchase_count}건`}
              icon={<TrendingDownIcon />}
              color={c.warning.main}
              onClick={() => router.push('/settlement/status')}
            />
            <KpiCard
              label="배분율"
              value={`${kpi.transactions.allocation_rate}%`}
              sub={`미배분 ${kpi.transactions.pending + kpi.transactions.partial}건`}
              icon={<DonutSmallIcon />}
              color={kpi.transactions.allocation_rate >= 80 ? c.success.main : c.warning.main}
              onClick={() => router.push('/settlement/transactions')}
            />
            <KpiCard
              label="활성 사용자"
              value={`${kpi.users.active_7d}명`}
              sub={`전체 ${kpi.users.total_active}명`}
              icon={<PeopleIcon />}
              color={c.info.main}
              onClick={() => router.push('/settlement/admin/users')}
            />
            <KpiCard
              label="작업 현황"
              value={`${kpi.jobs.pending}건`}
              sub={kpi.jobs.failed > 0 ? `실패 ${kpi.jobs.failed}건` : '정상'}
              icon={<WorkIcon />}
              color={kpi.jobs.failed > 0 ? c.error.main : c.success.main}
              onClick={() => router.push('/settlement/upload/jobs')}
            />
          </>
        )}
      </Box>

      {/* --- 이상 징후 경고 --- */}
      {!loading && alerts.length > 0 && (
        <Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningAmberIcon sx={{ fontSize: 18, color: 'warning.main' }} />
            이상 징후 ({alerts.length})
          </Typography>
          <Stack spacing={1}>
            {alerts.map((alert, i) => (
              <AlertCard key={i} alert={alert} onClick={() => router.push(alert.link)} />
            ))}
          </Stack>
        </Box>
      )}

      {!loading && alerts.length === 0 && (
        <Paper sx={{
          p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider',
          borderLeft: `4px solid ${c.success.main}`,
          background: alpha(c.success.main, 0.03),
        }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CheckCircleOutlineIcon sx={{ color: c.success.main }} />
            <Box>
              <Typography variant="body2" fontWeight={700}>시스템 정상</Typography>
              <Typography variant="caption" color="text.secondary">감지된 이상 징후가 없습니다.</Typography>
            </Box>
          </Stack>
        </Paper>
      )}

      {/* --- 업무 진행 현황 --- */}
      {!loading && workStatus && (
        <Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            업무 진행 현황
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {/* 업로드 상태 */}
            <StatusMiniCard
              label="업로드 작업"
              items={[
                { name: '완료', value: workStatus.uploads?.succeeded || 0, color: c.success.main },
                { name: '진행중', value: workStatus.uploads?.running || 0, color: c.info.main },
                { name: '대기', value: workStatus.uploads?.queued || 0, color: c.warning.main },
                { name: '실패', value: workStatus.uploads?.failed || 0, color: c.error.main },
              ]}
            />
            {/* 전표 상태 (판매) */}
            <StatusMiniCard
              label="판매 전표 상태"
              items={
                workStatus.voucher_status
                  ?.filter((v: { voucher_type: string }) => v.voucher_type === 'sales')
                  .map((v: { status: string; count: number }) => ({
                    name: v.status === 'open' ? '미정산' : v.status === 'settling' ? '정산중' : v.status === 'settled' ? '정산완료' : '마감',
                    value: v.count,
                    color: v.status === 'settled' ? c.success.main : v.status === 'open' ? c.error.main : v.status === 'settling' ? c.warning.main : c.grey[500],
                  })) || []
              }
            />
            {/* 입출금 상태 */}
            <StatusMiniCard
              label="입출금 상태"
              items={
                workStatus.transaction_status?.map((t: { status: string; count: number }) => ({
                  name: t.status === 'pending' ? '미배분' : t.status === 'partial' ? '부분배분' : t.status === 'allocated' ? '배분완료' : t.status,
                  value: t.count,
                  color: t.status === 'allocated' ? c.success.main : t.status === 'pending' ? c.warning.main : t.status === 'partial' ? c.info.main : c.grey[500],
                })) || []
              }
            />
          </Box>
        </Box>
      )}
    </AppPageContainer>
  );
}
