'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Select, MenuItem,
  FormControl, InputLabel, alpha, useTheme, Skeleton, Stack,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Paid as PaidIcon,
  Percent as PercentIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { AppPageContainer, AppPageHeader } from '@/components/ui';
import {
  fmt, fmtFull, CHART_MARGIN, useChartStyle,
  ChartTooltip, Section, ChartSkeleton, EmptyState, SCROLLABLE_SX,
  KpiCard, StatisticsTabNav,
} from '../_components/shared';

// ─── 타입 ──────────────────────────────────────────────────────────

interface ProfitSummary { total_sales: number; total_profit: number; avg_profit_rate: number; avg_margin: number; voucher_count: number }
interface ProfitMonth { month: string; sales_amount: number; profit: number; profit_rate: number; count: number }
interface ProfitCP { counterparty_name: string; sales_amount: number; profit: number; profit_rate: number; count: number }
interface ProfitDist { range: string; count: number }

// ─── 메인 ──────────────────────────────────────────────────────────

export default function ProfitStatsPage() {
  const { gridStroke, tickStyle, theme } = useChartStyle();
  const { enqueueSnackbar } = useSnackbar();
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<ProfitSummary | null>(null);
  const [monthly, setMonthly] = useState<ProfitMonth[]>([]);
  const [byCP, setByCP] = useState<ProfitCP[]>([]);
  const [dist, setDist] = useState<ProfitDist[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, mRes, cRes, dRes] = await Promise.all([
        settlementApi.statsProfitSummary(months),
        settlementApi.statsProfitMonthly(months),
        settlementApi.statsProfitByCounterparty(15, months),
        settlementApi.statsProfitDistribution(months),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSummary((sRes.data as any) as ProfitSummary);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMonthly(((mRes.data as any)?.data ?? []) as ProfitMonth[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setByCP(((cRes.data as any)?.data ?? []) as ProfitCP[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDist(((dRes.data as any)?.data ?? []) as ProfitDist[]);
    } catch {
      enqueueSnackbar('수익률 데이터를 불러오지 못했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [months, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <AppPageContainer sx={{ ...SCROLLABLE_SX }}>
      <AppPageHeader
        icon={<TrendingUpIcon />}
        title="수익률 분석"
        description="판매 전표 기반 손익·수익률·마진 분석"
        color="success"
        actions={[{
          label: '', variant: 'text' as const,
          icon: (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>조회 기간</InputLabel>
              <Select value={months} label="조회 기간" onChange={(e) => setMonths(Number(e.target.value))}>
                {[3, 6, 12, 24].map((v) => <MenuItem key={v} value={v}>{v}개월</MenuItem>)}
              </Select>
            </FormControl>
          ),
          onClick: () => {},
        }]}
      />

      <StatisticsTabNav />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pb: 3 }}>

        {/* ── KPI 카드 ────────────────────────────────────────── */}
        <Grid container spacing={2}>
          {[
            {
              label: '총 판매액', value: fmt(summary?.total_sales ?? 0),
              subtitle: `${summary?.voucher_count ?? 0}건`,
              icon: <PaidIcon sx={{ fontSize: 18 }} />, color: theme.palette.primary.main,
            },
            {
              label: '총 손익', value: fmt(summary?.total_profit ?? 0),
              subtitle: (summary?.total_profit ?? 0) >= 0 ? '이익' : '손실',
              icon: (summary?.total_profit ?? 0) >= 0 ? <TrendingUpIcon sx={{ fontSize: 18 }} /> : <TrendingDownIcon sx={{ fontSize: 18 }} />,
              color: (summary?.total_profit ?? 0) >= 0 ? theme.palette.success.main : theme.palette.error.main,
            },
            {
              label: '평균 수익률', value: `${(summary?.avg_profit_rate ?? 0).toFixed(1)}%`,
              icon: <PercentIcon sx={{ fontSize: 18 }} />, color: theme.palette.warning.main,
            },
            {
              label: '평균 마진', value: fmt(summary?.avg_margin ?? 0),
              icon: <AssessmentIcon sx={{ fontSize: 18 }} />, color: theme.palette.info.main,
            },
          ].map((kpi) => (
            <Grid item xs={6} md={3} key={kpi.label}>
              {loading ? (
                <Skeleton variant="rounded" height={110} sx={{ borderRadius: 3 }} animation="wave" />
              ) : (
                <KpiCard {...kpi} />
              )}
            </Grid>
          ))}
        </Grid>

        {/* ── 월별 손익 추이 ──────────────────────────────────── */}
        <Section title="월별 손익 추이" subtitle="판매액·손익 막대 + 수익률 라인">
          {loading ? <ChartSkeleton height={360} /> : monthly.length === 0 ? <EmptyState message="판매 전표 데이터가 없습니다." /> : (
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={monthly} margin={{ ...CHART_MARGIN, right: 48 }}>
                <defs>
                  <linearGradient id="gradSalesP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity={0.4} />
                  </linearGradient>
                  <linearGradient id="gradProfitP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#66bb6a" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#66bb6a" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={gridStroke} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis yAxisId="amount" tickFormatter={fmt} tick={tickStyle} axisLine={false} tickLine={false} width={52} />
                <YAxis yAxisId="rate" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ ...tickStyle, fill: '#ffa726' }} axisLine={false} tickLine={false} width={40} />
                <RTooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} />
                <Bar yAxisId="amount" dataKey="sales_amount" name="판매액" fill="url(#gradSalesP)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar yAxisId="amount" dataKey="profit" name="손익" fill="url(#gradProfitP)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line yAxisId="rate" type="monotone" dataKey="profit_rate" name="수익률(%)" stroke="#ffa726" strokeWidth={3} dot={{ r: 4, fill: '#ffa726', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 2, fill: '#fff' }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ── 2열: 거래처별 수익률 + 분포 히스토그램 ─────────── */}
        <Grid container spacing={2.5}>
          <Grid item xs={12} md={7}>
            <Section title="거래처별 수익률 (Top 15)" subtitle="판매액 기준 상위 거래처의 수익률">
              {loading ? <ChartSkeleton height={440} /> : byCP.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height={440}>
                  <BarChart data={byCP} layout="vertical" margin={{ ...CHART_MARGIN, left: 16 }}>
                    <CartesianGrid horizontal={false} stroke={gridStroke} />
                    <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)}%`} tick={tickStyle} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="counterparty_name" width={120} tick={{ ...tickStyle, fontSize: 11 }} axisLine={false} tickLine={false} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <RTooltip formatter={(value: any, name: any) => [
                      name === '수익률' ? `${Number(value).toFixed(1)}%` : fmtFull(Number(value)),
                      name,
                    ]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} />
                    <Bar
                      dataKey="profit_rate" name="수익률"
                      radius={[0, 6, 6, 0]} maxBarSize={20}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={{ position: 'right', formatter: (v: any) => `${Number(v).toFixed(1)}%`, fontSize: 10, fill: theme.palette.text.secondary }}
                    >
                      {byCP.map((item, i) => (
                        <Cell key={i} fill={item.profit_rate >= 0 ? '#66bb6a' : '#ef5350'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>
          </Grid>
          <Grid item xs={12} md={5}>
            <Section title="수익률 분포" subtitle="전표별 수익률 구간 분포">
              {loading ? <ChartSkeleton height={440} /> : dist.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height={440}>
                  <BarChart data={dist} margin={CHART_MARGIN} barCategoryGap="15%">
                    <CartesianGrid vertical={false} stroke={gridStroke} />
                    <XAxis dataKey="range" tick={{ ...tickStyle, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={36} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <RTooltip formatter={(value: any) => [`${value}건`, '전표 수']} />
                    <Bar dataKey="count" name="전표 수" radius={[6, 6, 0, 0]} maxBarSize={32}>
                      {dist.map((item, i) => {
                        const isNeg = item.range.startsWith('-') || item.range.startsWith('<');
                        return (
                          <Cell
                            key={i}
                            fill={isNeg ? '#ef5350' : `hsl(${122 + i * 8}, 50%, ${55 - i * 3}%)`}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>
          </Grid>
        </Grid>

      </Box>
    </AppPageContainer>
  );
}
