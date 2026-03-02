'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Select, MenuItem, FormControl, InputLabel,
  alpha, useTheme, Chip, Stack, Skeleton,
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  AccountBalance as AccountBalanceIcon,
  SwapHoriz as SwapHorizIcon,
  Receipt as ReceiptIcon,
  Gavel as GavelIcon,
  AccountBalanceWallet as WalletIcon,
  MoneyOff as MoneyOffIcon,
  CheckCircleOutline as CheckCircleIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { AppPageContainer, AppPageHeader } from '@/components/ui';
import {
  fmt, fmtFull, CHART_MARGIN, useChartStyle,
  ChartTooltip, Section, ChartSkeleton, EmptyState, SCROLLABLE_SX,
  KpiCard, StatisticsTabNav,
} from './_components/shared';

// ─── 타입 ──────────────────────────────────────────────────────────

interface MonthlyBalance {
  month: string; sales_total: number; purchase_total: number;
  receipts: number; payments: number; sales_balance: number; purchase_balance: number;
}
interface TxnFlow {
  month: string; deposit_total: number; deposit_count: number;
  withdrawal_total: number; withdrawal_count: number;
}
interface StatusItem { status: string; count: number; amount: number }
interface NettingMonth { month: string; count: number; amount: number }
interface AdjItem { type: string; count: number; amount: number }
interface AgingItem { bucket: string; sales_count: number; sales_amount: number; purchase_count: number; purchase_amount: number }
interface SourceItem { source: string; count: number; amount: number }
interface CompletionItem { month: string; total_count: number; settled_count: number; completion_rate: number; total_amount: number; settled_amount: number }

// ─── 라벨 ──────────────────────────────────────────────────────────

const SETTLEMENT_LABELS: Record<string, string> = {
  open: '미정산', settling: '정산중', settled: '정산완료', locked: '마감',
};
const PAYMENT_LABELS: Record<string, string> = {
  unpaid: '미지급', partial: '부분지급', paid: '지급완료', locked: '마감',
};
const ADJ_LABELS: Record<string, string> = {
  CORRECTION: '수정', RETURN: '반품', WRITE_OFF: '대손', DISCOUNT: '할인',
  correction: '수정', return_: '반품', write_off: '대손', discount: '할인',
};
const SOURCE_LABELS: Record<string, string> = {
  manual: '수동 등록', bank_import: '은행 임포트', netting: '상계 처리',
};

// ─── 파이 차트 범례 ────────────────────────────────────────────────

function PieLegend({
  items,
  colors,
  unit = '건',
}: {
  items: { name: string; count: number; amount: number }[];
  colors: string[];
  unit?: string;
}) {
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <Stack spacing={0.75} sx={{ mt: 1 }}>
      {items.map((item, i) => {
        const pct = total > 0 ? ((item.count / total) * 100).toFixed(0) : '0';
        return (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 1, bgcolor: colors[i % colors.length], flexShrink: 0 }} />
            <Typography variant="body2" fontSize="0.8rem" sx={{ flex: 1 }}>
              {item.name}
            </Typography>
            <Typography variant="body2" fontSize="0.8rem" fontWeight={600}>
              {item.count}{unit}
            </Typography>
            <Chip label={`${pct}%`} size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, bgcolor: alpha(colors[i % colors.length], 0.12), color: colors[i % colors.length] }} />
          </Box>
        );
      })}
    </Stack>
  );
}

// ─── 메인 ──────────────────────────────────────────────────────────

export default function StatisticsOverviewPage() {
  const { gridStroke, tickStyle, theme } = useChartStyle();
  const { enqueueSnackbar } = useSnackbar();
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true);

  const [balance, setBalance] = useState<MonthlyBalance[]>([]);
  const [txnFlow, setTxnFlow] = useState<TxnFlow[]>([]);
  const [settlementStatus, setSettlementStatus] = useState<StatusItem[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<StatusItem[]>([]);
  const [netting, setNetting] = useState<NettingMonth[]>([]);
  const [adjustments, setAdjustments] = useState<AdjItem[]>([]);
  // 신규 데이터
  const [aging, setAging] = useState<AgingItem[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [completion, setCompletion] = useState<CompletionItem[]>([]);

  const PIE_COLORS = ['#ef5350', '#ffa726', '#66bb6a', '#78909c'];
  const SOURCE_COLORS = ['#42a5f5', '#66bb6a', '#ab47bc'];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, tRes, sRes, nRes, aRes, agRes, srcRes, crRes] = await Promise.all([
        settlementApi.statsMonthlyBalance(months),
        settlementApi.statsTransactionFlow(months),
        settlementApi.statsVoucherStatus(),
        settlementApi.statsNettingMonthly(months),
        settlementApi.statsAdjustmentSummary(),
        settlementApi.statsSettlementAging(),
        settlementApi.statsTransactionSource(),
        settlementApi.statsCompletionRate(months),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setBalance(((bRes.data as any)?.data ?? []) as MonthlyBalance[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTxnFlow(((tRes.data as any)?.data ?? []) as TxnFlow[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sData = (sRes.data as any) ?? {};
      setSettlementStatus(sData.settlement ?? []);
      setPaymentStatus(sData.payment ?? []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNetting(((nRes.data as any)?.data ?? []) as NettingMonth[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAdjustments(((aRes.data as any)?.data ?? []) as AdjItem[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAging(((agRes.data as any)?.data ?? []) as AgingItem[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSources(((srcRes.data as any)?.data ?? []) as SourceItem[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCompletion(((crRes.data as any)?.data ?? []) as CompletionItem[]);
    } catch {
      enqueueSnackbar('통계 데이터를 불러오지 못했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [months, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  // KPI 계산
  const totalReceivable = balance.reduce((s, b) => s + b.sales_balance, 0);
  const totalPayable = balance.reduce((s, b) => s + b.purchase_balance, 0);
  const latestCompletion = completion.length > 0 ? completion[completion.length - 1] : null;
  const unsettledCount = aging.reduce((s, a) => s + a.sales_count + a.purchase_count, 0);

  return (
    <AppPageContainer sx={{ ...SCROLLABLE_SX }}>
      <AppPageHeader
        icon={<BarChartIcon />}
        title="정산 현황"
        description="월별 미수·미지급 추이, 입출금 흐름, 전표 상태 분포"
        color="primary"
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

        {/* ── KPI 카드 4종 ──────────────────────────────────── */}
        <Grid container spacing={2}>
          {[
            {
              label: '총 미수 잔액', value: fmt(totalReceivable),
              subtitle: '매출전표 미수금 합계',
              icon: <WalletIcon sx={{ fontSize: 18 }} />, color: theme.palette.error.main,
            },
            {
              label: '총 미지급 잔액', value: fmt(totalPayable),
              subtitle: '매입전표 미지급금 합계',
              icon: <MoneyOffIcon sx={{ fontSize: 18 }} />, color: theme.palette.warning.main,
            },
            {
              label: '정산 완료율', value: latestCompletion ? `${latestCompletion.completion_rate}%` : '-',
              subtitle: latestCompletion ? `${latestCompletion.month} 기준` : '',
              icon: <CheckCircleIcon sx={{ fontSize: 18 }} />, color: theme.palette.success.main,
            },
            {
              label: '미정산 전표', value: `${unsettledCount}건`,
              subtitle: '미정산·정산중 전표 수',
              icon: <DescriptionIcon sx={{ fontSize: 18 }} />, color: theme.palette.info.main,
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

        {/* ── 월별 미수·미지급 추이 ──────────────────────────── */}
        <Section
          title="월별 미수·미지급 잔액 추이"
          subtitle="판매전표 잔액(미수)과 매입전표 잔액(미지급)의 월별 변화"
          action={<AccountBalanceIcon sx={{ color: 'text.disabled', fontSize: 20 }} />}
        >
          {loading ? <ChartSkeleton height={340} /> : balance.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={balance} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="gradReceivable" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef5350" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#ef5350" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradPayable" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#42a5f5" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#42a5f5" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={gridStroke} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmt} tick={tickStyle} axisLine={false} tickLine={false} width={52} />
                <RTooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} />
                <Area type="monotone" dataKey="sales_balance" name="미수 잔액" stroke="#ef5350" fill="url(#gradReceivable)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }} />
                <Area type="monotone" dataKey="purchase_balance" name="미지급 잔액" stroke="#42a5f5" fill="url(#gradPayable)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ── 에이징 분석 + 정산 완료율 추이 (2열) ─────────── */}
        <Grid container spacing={2.5}>
          <Grid item xs={12} md={7}>
            <Section title="미정산 전표 에이징 분석" subtitle="경과일별 미수·미지급 금액 분포">
              {loading ? <ChartSkeleton height={320} /> : aging.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={aging} margin={CHART_MARGIN} barCategoryGap="20%">
                    <defs>
                      <linearGradient id="gradAgingSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef5350" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#ef5350" stopOpacity={0.4} />
                      </linearGradient>
                      <linearGradient id="gradAgingPurch" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#42a5f5" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#42a5f5" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={gridStroke} />
                    <XAxis dataKey="bucket" tick={tickStyle} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmt} tick={tickStyle} axisLine={false} tickLine={false} width={52} />
                    <RTooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} />
                    <Bar dataKey="sales_amount" name="미수 금액" fill="url(#gradAgingSales)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="purchase_amount" name="미지급 금액" fill="url(#gradAgingPurch)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>
          </Grid>
          <Grid item xs={12} md={5}>
            <Section title="정산 완료율 추이" subtitle="월별 전표 정산 완료 비율">
              {loading ? <ChartSkeleton height={320} /> : completion.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={completion} margin={{ ...CHART_MARGIN, right: 40 }}>
                    <CartesianGrid vertical={false} stroke={gridStroke} />
                    <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="count" tick={tickStyle} axisLine={false} tickLine={false} width={36} />
                    <YAxis yAxisId="rate" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ ...tickStyle, fill: '#66bb6a' }} axisLine={false} tickLine={false} width={40} domain={[0, 100]} />
                    <RTooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} />
                    <Bar yAxisId="count" dataKey="total_count" name="총 전표" fill={alpha(theme.palette.primary.main, 0.2)} radius={[6, 6, 0, 0]} maxBarSize={28} />
                    <Bar yAxisId="count" dataKey="settled_count" name="완료 전표" fill={alpha(theme.palette.success.main, 0.6)} radius={[6, 6, 0, 0]} maxBarSize={28} />
                    <Line yAxisId="rate" type="monotone" dataKey="completion_rate" name="완료율(%)" stroke="#66bb6a" strokeWidth={3} dot={{ r: 4, fill: '#66bb6a', strokeWidth: 2, stroke: '#fff' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </Section>
          </Grid>
        </Grid>

        {/* ── 월별 입출금 흐름 ────────────────────────────────── */}
        <Section
          title="월별 입출금 흐름"
          subtitle="거래처 수준 입금·출금 금액 추이"
          action={<SwapHorizIcon sx={{ color: 'text.disabled', fontSize: 20 }} />}
        >
          {loading ? <ChartSkeleton height={280} /> : txnFlow.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={txnFlow} margin={CHART_MARGIN} barCategoryGap="25%">
                <CartesianGrid vertical={false} stroke={gridStroke} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmt} tick={tickStyle} axisLine={false} tickLine={false} width={52} />
                <RTooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} />
                <Bar dataKey="deposit_total" name="입금" fill="#66bb6a" radius={[6, 6, 0, 0]} maxBarSize={40} />
                <Bar dataKey="withdrawal_total" name="출금" fill="#42a5f5" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ── 전표 상태 분포 (2열) + 거래 소스 분포 ────────── */}
        <Grid container spacing={2.5}>
          <Grid item xs={12} md={4}>
            <Section
              title="정산 상태 분포"
              action={<ReceiptIcon sx={{ color: 'text.disabled', fontSize: 20 }} />}
            >
              {loading ? <ChartSkeleton height={280} /> : settlementStatus.length === 0 ? <EmptyState /> : (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie
                          data={settlementStatus.map((s) => ({ ...s, name: SETTLEMENT_LABELS[s.status] || s.status }))}
                          dataKey="count" nameKey="name"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3}
                          stroke="none"
                        >
                          {settlementStatus.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <RTooltip formatter={(value: any, name: any) => [`${value}건`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                  <PieLegend
                    items={settlementStatus.map((s) => ({ name: SETTLEMENT_LABELS[s.status] || s.status, count: s.count, amount: s.amount }))}
                    colors={PIE_COLORS}
                  />
                </>
              )}
            </Section>
          </Grid>
          <Grid item xs={12} md={4}>
            <Section
              title="지급 상태 분포"
              action={<ReceiptIcon sx={{ color: 'text.disabled', fontSize: 20 }} />}
            >
              {loading ? <ChartSkeleton height={280} /> : paymentStatus.length === 0 ? <EmptyState /> : (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie
                          data={paymentStatus.map((s) => ({ ...s, name: PAYMENT_LABELS[s.status] || s.status }))}
                          dataKey="count" nameKey="name"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3}
                          stroke="none"
                        >
                          {paymentStatus.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <RTooltip formatter={(value: any, name: any) => [`${value}건`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                  <PieLegend
                    items={paymentStatus.map((s) => ({ name: PAYMENT_LABELS[s.status] || s.status, count: s.count, amount: s.amount }))}
                    colors={PIE_COLORS}
                  />
                </>
              )}
            </Section>
          </Grid>
          <Grid item xs={12} md={4}>
            <Section title="거래 소스 분포" subtitle="입출금 발생 경로별 분포">
              {loading ? <ChartSkeleton height={280} /> : sources.length === 0 ? <EmptyState /> : (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie
                          data={sources.map((s) => ({ ...s, name: SOURCE_LABELS[s.source] || s.source }))}
                          dataKey="count" nameKey="name"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={4}
                          stroke="none"
                        >
                          {sources.map((_, i) => (
                            <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                          ))}
                        </Pie>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <RTooltip formatter={(value: any, name: any) => [`${value}건`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                  <PieLegend
                    items={sources.map((s) => ({ name: SOURCE_LABELS[s.source] || s.source, count: s.count, amount: s.amount }))}
                    colors={SOURCE_COLORS}
                  />
                </>
              )}
            </Section>
          </Grid>
        </Grid>

        {/* ── 상계·조정 (2열) ─────────────────────────────────── */}
        <Grid container spacing={2.5}>
          <Grid item xs={12} md={6}>
            <Section
              title="월별 상계 현황"
              subtitle="확정된 상계 건수·금액"
              action={<GavelIcon sx={{ color: 'text.disabled', fontSize: 20 }} />}
            >
              {loading ? <ChartSkeleton height={240} /> : netting.length === 0 ? <EmptyState message="상계 데이터가 없습니다." /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={netting} margin={CHART_MARGIN} barCategoryGap="30%">
                    <CartesianGrid vertical={false} stroke={gridStroke} />
                    <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmt} tick={tickStyle} axisLine={false} tickLine={false} width={52} />
                    <RTooltip content={<ChartTooltip />} />
                    <Bar dataKey="amount" name="상계 금액" radius={[6, 6, 0, 0]} maxBarSize={36}>
                      {netting.map((_, i) => (
                        <Cell key={i} fill={alpha(theme.palette.secondary.main, 0.7 + i * 0.03)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>
          </Grid>
          <Grid item xs={12} md={6}>
            <Section title="조정전표 유형별 분포">
              {loading ? <ChartSkeleton height={240} /> : adjustments.length === 0 ? <EmptyState message="조정전표 데이터가 없습니다." /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={adjustments.map((a) => ({ ...a, label: ADJ_LABELS[a.type] || a.type }))} layout="vertical" margin={{ ...CHART_MARGIN, left: 8 }}>
                    <CartesianGrid horizontal={false} stroke={gridStroke} />
                    <XAxis type="number" tickFormatter={fmt} tick={tickStyle} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={48} tick={tickStyle} axisLine={false} tickLine={false} />
                    <RTooltip content={<ChartTooltip />} />
                    <Bar dataKey="amount" name="금액" radius={[0, 6, 6, 0]} maxBarSize={28}>
                      {adjustments.map((_, i) => (
                        <Cell key={i} fill={['#ffa726', '#ef5350', '#78909c', '#ab47bc'][i % 4]} />
                      ))}
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
