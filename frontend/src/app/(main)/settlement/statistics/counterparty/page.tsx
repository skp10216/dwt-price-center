'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, alpha, useTheme, Chip,
  LinearProgress, Stack,
} from '@mui/material';
import { DonutSmall as DonutSmallIcon } from '@mui/icons-material';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { useAppRouter } from '@/lib/navigation';
import { AppPageContainer, AppPageHeader } from '@/components/ui';
import {
  fmt, fmtFull, CHART_MARGIN, useChartStyle,
  ChartTooltip, Section, ChartSkeleton, EmptyState, SCROLLABLE_SX,
  StatisticsTabNav,
} from '../_components/shared';

// ─── 타입 ──────────────────────────────────────────────────────────

interface BranchItem { branch_name: string; sales_amount: number; sales_count: number; purchase_amount: number; purchase_count: number }
interface BalanceItem { counterparty_name: string; receivable: number; payable: number; total: number }
interface TypeItem { type: string; count: number; total_amount: number }
interface ProgressItem {
  counterparty_id: string; counterparty_name: string;
  total_amount: number; settled_amount: number; balance: number;
  progress: number; voucher_count: number;
}
interface CashLagItem { counterparty_name: string; avg_days: number; allocation_count: number }

const TYPE_LABELS: Record<string, string> = { SELLER: '매출처', BUYER: '매입처', BOTH: '매출/매입', seller: '매출처', buyer: '매입처', both: '매출/매입' };

// ─── 메인 ──────────────────────────────────────────────────────────

export default function CounterpartyStatsPage() {
  const { gridStroke, tickStyle, theme } = useChartStyle();
  const router = useAppRouter();
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(true);

  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [topBalance, setTopBalance] = useState<BalanceItem[]>([]);
  const [cpTypes, setCpTypes] = useState<TypeItem[]>([]);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [cashLag, setCashLag] = useState<CashLagItem[]>([]);

  const PIE_COLORS = ['#ffa726', '#42a5f5', '#66bb6a', '#ab47bc'];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, tRes, tyRes, pRes, clRes] = await Promise.all([
        settlementApi.statsByBranch(),
        settlementApi.statsTopBalance(10),
        settlementApi.statsCounterpartyType(),
        settlementApi.statsCounterpartyProgress(20),
        settlementApi.statsCashLag(15),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setBranches(((bRes.data as any)?.data ?? []) as BranchItem[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTopBalance(((tRes.data as any)?.data ?? []) as BalanceItem[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCpTypes(((tyRes.data as any)?.data ?? []) as TypeItem[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setProgress(((pRes.data as any)?.data ?? []) as ProgressItem[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCashLag(((clRes.data as any)?.data ?? []) as CashLagItem[]);
    } catch {
      enqueueSnackbar('통계 데이터를 불러오지 못했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <AppPageContainer sx={{ ...SCROLLABLE_SX }}>
      <AppPageHeader
        icon={<DonutSmallIcon />}
        title="거래처 분석"
        description="지사별·거래처별 매출/매입 구조 및 정산 진행률"
        color="info"
      />

      <StatisticsTabNav />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pb: 3 }}>

        {/* ── 지사별 매출·매입 ─────────────────────────────────── */}
        <Section title="지사별 매출·매입 비중" subtitle="거래처 소속 지사 기준 금액 집계">
          {loading ? <ChartSkeleton height={320} /> : branches.length === 0 ? <EmptyState message="지사 데이터가 없습니다." /> : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={branches} margin={CHART_MARGIN} barCategoryGap="25%">
                <defs>
                  <linearGradient id="gradSalesB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffa726" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#ffa726" stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="gradPurchB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#42a5f5" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#42a5f5" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={gridStroke} />
                <XAxis dataKey="branch_name" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmt} tick={tickStyle} axisLine={false} tickLine={false} width={52} />
                <RTooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} />
                <Bar dataKey="sales_amount" name="판매" fill="url(#gradSalesB)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="purchase_amount" name="매입" fill="url(#gradPurchB)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ── 2열: Top 10 잔액 + 유형별 분포 ─────────────────── */}
        <Grid container spacing={2.5}>
          <Grid item xs={12} md={7}>
            <Section title="거래처 Top 10 미수·미지급" subtitle="잔액 절대값 기준 상위 10개">
              {loading ? <ChartSkeleton height={420} /> : topBalance.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height={420}>
                  <BarChart data={topBalance} layout="vertical" margin={{ ...CHART_MARGIN, left: 16 }}>
                    <CartesianGrid horizontal={false} stroke={gridStroke} />
                    <XAxis type="number" tickFormatter={fmt} tick={tickStyle} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="counterparty_name" width={120} tick={{ ...tickStyle, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <RTooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} />
                    <Bar dataKey="receivable" name="미수" fill="#ef5350" radius={[0, 4, 4, 0]} stackId="stack" maxBarSize={22} />
                    <Bar dataKey="payable" name="미지급" fill="#42a5f5" radius={[0, 4, 4, 0]} stackId="stack" maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>
          </Grid>
          <Grid item xs={12} md={5}>
            <Section title="거래처 유형별 분포">
              {loading ? <ChartSkeleton height={420} /> : cpTypes.length === 0 ? <EmptyState /> : (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <ResponsiveContainer width={220} height={220}>
                      <PieChart>
                        <Pie
                          data={cpTypes.map((t) => ({ ...t, name: TYPE_LABELS[t.type] || t.type }))}
                          dataKey="count" nameKey="name"
                          cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                          paddingAngle={4} stroke="none"
                        >
                          {cpTypes.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <RTooltip formatter={(value: any, name: any) => [`${value}개`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                  <Stack spacing={1} sx={{ mt: 1.5 }}>
                    {cpTypes.map((t, i) => (
                      <Box key={t.type} sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5,
                        p: 1.25, borderRadius: 2, bgcolor: alpha(PIE_COLORS[i % PIE_COLORS.length], 0.04),
                        border: '1px solid', borderColor: alpha(PIE_COLORS[i % PIE_COLORS.length], 0.1),
                      }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: 1, bgcolor: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                        <Typography variant="body2" fontSize="0.82rem" fontWeight={600} sx={{ flex: 1 }}>
                          {TYPE_LABELS[t.type] || t.type}
                        </Typography>
                        <Typography variant="body2" fontSize="0.8rem" color="text.secondary">
                          {t.count}개
                        </Typography>
                        <Typography variant="body2" fontSize="0.8rem" fontWeight={600}>
                          {fmt(t.total_amount)}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </>
              )}
            </Section>
          </Grid>
        </Grid>

        {/* ── 거래처별 입금 지연일 ─────────────────────────────── */}
        <Section title="거래처별 평균 입금 지연일" subtitle="거래일 대비 입금일 차이 (Top 15)">
          {loading ? <ChartSkeleton height={420} /> : cashLag.length === 0 ? <EmptyState message="입금 지연 데이터가 없습니다." /> : (
            <ResponsiveContainer width="100%" height={Math.max(320, cashLag.length * 32)}>
              <BarChart data={cashLag} layout="vertical" margin={{ ...CHART_MARGIN, left: 16 }}>
                <CartesianGrid horizontal={false} stroke={gridStroke} />
                <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} unit="일" />
                <YAxis type="category" dataKey="counterparty_name" width={120} tick={{ ...tickStyle, fontSize: 11 }} axisLine={false} tickLine={false} />
                <RTooltip content={<ChartTooltip />} />
                <Bar dataKey="avg_days" name="평균 지연일" radius={[0, 6, 6, 0]} maxBarSize={20}>
                  {cashLag.map((item, i) => (
                    <Cell key={i} fill={item.avg_days > 60 ? '#ef5350' : item.avg_days > 30 ? '#ffa726' : '#66bb6a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ── 거래처별 정산 진행률 ─────────────────────────────── */}
        <Section title="거래처별 정산 진행률" subtitle="총 전표금액 대비 수금/지급 진행률 (Top 20)">
          {loading ? <ChartSkeleton height={400} /> : progress.length === 0 ? <EmptyState /> : (
            <Box sx={{ overflowX: 'auto', ...SCROLLABLE_SX }}>
              <Box sx={{ minWidth: 720 }}>
                {/* 헤더 */}
                <Box sx={{
                  display: 'flex', gap: 1.5, px: 1.5, py: 1,
                  borderBottom: '2px solid', borderColor: 'divider',
                  bgcolor: alpha(theme.palette.action.hover, 0.3),
                  borderRadius: '8px 8px 0 0',
                }}>
                  {[
                    { label: '거래처', w: 170 },
                    { label: '총액', w: 110, align: 'right' as const },
                    { label: '정산액', w: 110, align: 'right' as const },
                    { label: '잔액', w: 110, align: 'right' as const },
                    { label: '진행률', w: undefined },
                    { label: '전표', w: 56, align: 'center' as const },
                  ].map((col) => (
                    <Typography
                      key={col.label}
                      variant="caption"
                      fontWeight={700}
                      color="text.secondary"
                      sx={{ width: col.w, flex: col.w ? undefined : 1, textAlign: col.align }}
                    >
                      {col.label}
                    </Typography>
                  ))}
                </Box>
                {/* 행 */}
                {progress.map((p, idx) => (
                  <Box
                    key={p.counterparty_id}
                    sx={{
                      display: 'flex', gap: 1.5, px: 1.5, py: 1.25, alignItems: 'center',
                      borderBottom: '1px solid', borderColor: alpha(theme.palette.divider, 0.5),
                      cursor: 'pointer',
                      '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.03) },
                      transition: 'background 0.15s',
                      bgcolor: idx % 2 === 1 ? alpha(theme.palette.action.hover, 0.15) : 'transparent',
                    }}
                    onClick={() => router.push(`/settlement/counterparties/${p.counterparty_id}`)}
                  >
                    <Typography variant="body2" fontWeight={600} fontSize="0.82rem" sx={{ width: 170 }} noWrap>
                      {p.counterparty_name}
                    </Typography>
                    <Typography variant="body2" fontSize="0.8rem" sx={{ width: 110, textAlign: 'right' }}>
                      {fmtFull(p.total_amount)}
                    </Typography>
                    <Typography variant="body2" fontSize="0.8rem" color="success.main" sx={{ width: 110, textAlign: 'right' }}>
                      {fmtFull(p.settled_amount)}
                    </Typography>
                    <Typography
                      variant="body2" fontSize="0.8rem" fontWeight={600}
                      color={p.balance > 0 ? 'error.main' : 'success.main'}
                      sx={{ width: 110, textAlign: 'right' }}
                    >
                      {fmtFull(p.balance)}
                    </Typography>
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(p.progress, 100)}
                        sx={{
                          flex: 1, height: 7, borderRadius: 4,
                          bgcolor: alpha(theme.palette.primary.main, 0.08),
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 4,
                            background: p.progress >= 100
                              ? `linear-gradient(90deg, ${theme.palette.success.main}, ${theme.palette.success.light})`
                              : `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`,
                          },
                        }}
                      />
                      <Chip
                        label={`${p.progress.toFixed(0)}%`}
                        size="small"
                        sx={{
                          height: 20, fontSize: '0.7rem', fontWeight: 700,
                          bgcolor: p.progress >= 100 ? alpha(theme.palette.success.main, 0.12) : alpha(theme.palette.primary.main, 0.1),
                          color: p.progress >= 100 ? theme.palette.success.main : theme.palette.primary.main,
                        }}
                      />
                    </Box>
                    <Typography variant="body2" fontSize="0.8rem" color="text.secondary" sx={{ width: 56, textAlign: 'center' }}>
                      {p.voucher_count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Section>

      </Box>
    </AppPageContainer>
  );
}
