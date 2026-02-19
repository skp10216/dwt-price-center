'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Skeleton, Alert,
  Paper, Divider, Chip, alpha, useTheme, Stack, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Tooltip,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
  Lock as LockIcon,
  SwapHoriz as SwapHorizIcon,
  Warning as WarningIcon,
  Receipt as ReceiptIcon,
  ShoppingCart as ShoppingCartIcon,
  Visibility as ViewIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { settlementApi } from '@/lib/api';

interface DashboardData {
  total_receivable: number;
  total_payable: number;
  settling_count: number;
  locked_count: number;
  open_sales_count: number;
  unpaid_purchase_count: number;
  pending_changes_count: number;
  unmatched_count: number;
}

interface TopItem {
  counterparty_id: string;
  counterparty_name: string;
  amount: number;
  voucher_count: number;
}

/**
 * 정산 대시보드 - 정산 요약 (미수/미지급/정산중/마감현황)
 */
export default function SettlementDashboardPage() {
  const theme = useTheme();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [topReceivables, setTopReceivables] = useState<TopItem[]>([]);
  const [topPayables, setTopPayables] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, receivablesRes, payablesRes] = await Promise.all([
        settlementApi.getDashboardSummary(),
        settlementApi.getTopReceivables(5),
        settlementApi.getTopPayables(5),
      ]);
      setData(summaryRes.data as DashboardData);
      const rData = receivablesRes.data as unknown as { items: TopItem[] };
      const pData = payablesRes.data as unknown as { items: TopItem[] };
      setTopReceivables(rData?.items ?? []);
      setTopPayables(pData?.items ?? []);
    } catch {
      setError('대시보드 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount);

  const summaryCards = [
    {
      title: '미수 총액',
      value: data?.total_receivable ?? 0,
      icon: <TrendingUpIcon />,
      color: theme.palette.error.main,
      bgColor: alpha(theme.palette.error.main, 0.08),
      format: formatAmount,
    },
    {
      title: '미지급 총액',
      value: data?.total_payable ?? 0,
      icon: <TrendingDownIcon />,
      color: theme.palette.warning.main,
      bgColor: alpha(theme.palette.warning.main, 0.08),
      format: formatAmount,
    },
    {
      title: '정산중',
      value: data?.settling_count ?? 0,
      icon: <SwapHorizIcon />,
      color: theme.palette.info.main,
      bgColor: alpha(theme.palette.info.main, 0.08),
      format: (v: number) => `${v}건`,
    },
    {
      title: '마감 완료',
      value: data?.locked_count ?? 0,
      icon: <LockIcon />,
      color: theme.palette.success.main,
      bgColor: alpha(theme.palette.success.main, 0.08),
      format: (v: number) => `${v}건`,
    },
  ];

  const statusCards = [
    {
      title: '미정산 판매',
      value: data?.open_sales_count ?? 0,
      icon: <ReceiptIcon />,
      color: theme.palette.error.main,
    },
    {
      title: '미지급 매입',
      value: data?.unpaid_purchase_count ?? 0,
      icon: <ShoppingCartIcon />,
      color: theme.palette.warning.main,
    },
    {
      title: '변경 요청 대기',
      value: data?.pending_changes_count ?? 0,
      icon: <WarningIcon />,
      color: theme.palette.warning.dark,
    },
    {
      title: '미매칭 거래처',
      value: data?.unmatched_count ?? 0,
      icon: <AccountBalanceIcon />,
      color: theme.palette.text.secondary,
    },
  ];

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        정산 대시보드
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        미수/미지급/정산중/마감 현황을 한눈에 확인합니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* 핵심 지표 카드 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {summaryCards.map((card) => (
          <Grid item xs={12} sm={6} md={3} key={card.title}>
            <Card
              elevation={0}
              sx={{
                bgcolor: card.bgColor,
                borderRadius: 3,
                border: `1px solid ${alpha(card.color, 0.2)}`,
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{
                    width: 48, height: 48, borderRadius: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: alpha(card.color, 0.15), color: card.color,
                  }}>
                    {card.icon}
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
                  {card.title}
                </Typography>
                {loading ? (
                  <Skeleton width={120} height={36} />
                ) : (
                  <Typography variant="h5" fontWeight={700} sx={{ color: card.color, mt: 0.5 }}>
                    {card.format(card.value)}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* 운영 상태 카드 */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        운영 현황
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {statusCards.map((card) => (
          <Grid item xs={12} sm={6} md={3} key={card.title}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <Box sx={{ color: card.color }}>{card.icon}</Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {card.title}
                </Typography>
                {loading ? (
                  <Skeleton width={40} height={28} />
                ) : (
                  <Typography variant="h6" fontWeight={700}>
                    {card.value}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                      건
                    </Typography>
                  </Typography>
                )}
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Top 5 미수/미지급 */}
      <Grid container spacing={3}>
        {/* 미수 Top 5 */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: alpha(theme.palette.error.main, 0.04) }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <TrendingUpIcon sx={{ color: 'error.main' }} />
                <Typography variant="subtitle1" fontWeight={700}>미수 상위 거래처 Top 5</Typography>
              </Stack>
              <Tooltip title="미수 현황 보기">
                <IconButton size="small" onClick={() => router.push('/settlement/status/receivables')}>
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Divider />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>거래처</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>미수 잔액</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>전표</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, width: 40 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><Skeleton width="60%" /></TableCell></TableRow>
                  ) : topReceivables.length === 0 ? (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">미수 데이터가 없습니다</Typography>
                    </TableCell></TableRow>
                  ) : (
                    topReceivables.map((item, idx) => (
                      <TableRow key={item.counterparty_id} hover sx={{ cursor: 'pointer' }}
                        onClick={() => router.push(`/settlement/counterparties/${item.counterparty_id}`)}
                      >
                        <TableCell>
                          <Chip label={idx + 1} size="small" color={idx < 3 ? 'error' : 'default'} variant={idx < 3 ? 'filled' : 'outlined'} sx={{ fontWeight: 700, minWidth: 28 }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{item.counterparty_name}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>
                          {formatAmount(item.amount)}
                        </TableCell>
                        <TableCell align="right">{item.voucher_count}건</TableCell>
                        <TableCell align="center">
                          <IconButton size="small"><ViewIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* 미지급 Top 5 */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: alpha(theme.palette.warning.main, 0.04) }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <TrendingDownIcon sx={{ color: 'warning.main' }} />
                <Typography variant="subtitle1" fontWeight={700}>미지급 상위 거래처 Top 5</Typography>
              </Stack>
              <Tooltip title="미지급 현황 보기">
                <IconButton size="small" onClick={() => router.push('/settlement/status/payables')}>
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Divider />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>거래처</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>미지급 잔액</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>전표</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, width: 40 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><Skeleton width="60%" /></TableCell></TableRow>
                  ) : topPayables.length === 0 ? (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">미지급 데이터가 없습니다</Typography>
                    </TableCell></TableRow>
                  ) : (
                    topPayables.map((item, idx) => (
                      <TableRow key={item.counterparty_id} hover sx={{ cursor: 'pointer' }}
                        onClick={() => router.push(`/settlement/counterparties/${item.counterparty_id}`)}
                      >
                        <TableCell>
                          <Chip label={idx + 1} size="small" color={idx < 3 ? 'warning' : 'default'} variant={idx < 3 ? 'filled' : 'outlined'} sx={{ fontWeight: 700, minWidth: 28 }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{item.counterparty_name}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'warning.main' }}>
                          {formatAmount(item.amount)}
                        </TableCell>
                        <TableCell align="right">{item.voucher_count}건</TableCell>
                        <TableCell align="center">
                          <IconButton size="small"><ViewIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
