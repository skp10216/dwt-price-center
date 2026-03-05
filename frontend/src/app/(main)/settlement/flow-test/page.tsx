'use client';

/**
 * 정산 시스템 — 전체 업무 플로우 테스트 대시보드
 * 각 업무 단계의 상태를 한눈에 점검하고, 주요 기능으로 빠르게 이동
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Stack, Alert, AlertTitle, Chip,
  Divider, LinearProgress, Tooltip, IconButton, alpha, useTheme, Grid,
} from '@mui/material';
import {
  CheckCircle as PassIcon,
  Warning as WarnIcon,
  Error as FailIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Business as MasterIcon,
  Receipt as VoucherIcon,
  SwapHoriz as TxnIcon,
  AccountBalance as AllocIcon,
  CloudUpload as ImportIcon,
  AccountBalanceWallet as BalanceIcon,
  History as LegacyIcon,
  OpenInNew as LinkIcon,
  Science as TestIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useAppRouter } from '@/lib/navigation';
import { useSnackbar } from 'notistack';
import { AppPageContainer, AppPageHeader } from '@/components/ui';

interface CheckItem {
  step: string;
  title: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  details: Record<string, unknown>;
  message: string;
}

interface HealthCheckResponse {
  overall: 'pass' | 'warn' | 'fail';
  checks: CheckItem[];
  summary: {
    counterparties: number;
    vouchers: number;
    transactions: number;
    allocations: number;
    bank_import_jobs: number;
  };
}

const STATUS_CONFIG = {
  pass: { icon: PassIcon, color: 'success' as const, label: '정상' },
  warn: { icon: WarnIcon, color: 'warning' as const, label: '주의' },
  fail: { icon: FailIcon, color: 'error' as const, label: '오류' },
  info: { icon: InfoIcon, color: 'info' as const, label: '참고' },
};

const STEP_ICONS: Record<string, React.ReactElement> = {
  master: <MasterIcon />,
  vouchers: <VoucherIcon />,
  transactions: <TxnIcon />,
  allocations: <AllocIcon />,
  bank_import: <ImportIcon />,
  balance: <BalanceIcon />,
  legacy: <LegacyIcon />,
};

const STEP_LINKS: Record<string, string> = {
  master: '/settlement/counterparties',
  vouchers: '/settlement/vouchers',
  transactions: '/settlement/transactions',
  allocations: '/settlement/transactions',
  bank_import: '/settlement/bank-import',
  balance: '/settlement/dashboard',
  legacy: '/settlement/activity',
};

const formatNumber = (n: number) => new Intl.NumberFormat('ko-KR').format(Math.round(n));
const formatWon = (n: number) => `${formatNumber(n)}원`;

const DETAIL_LABELS: Record<string, string> = {
  counterparties: '거래처',
  counterparties_active: '활성 거래처',
  aliases: '별칭',
  alias_coverage: '별칭 커버리지(%)',
  corporate_entities: '법인',
  branches: '지사',
  sales_count: '판매 전표',
  sales_total: '판매 총액',
  purchase_count: '매입 전표',
  purchase_total: '매입 총액',
  status_open: '미정산',
  status_settling: '정산중',
  status_settled: '정산완료',
  status_locked: '마감',
  deposit_active_count: '입금 건수',
  deposit_active_total: '입금 총액',
  withdrawal_active_count: '출금 건수',
  withdrawal_active_total: '출금 총액',
  cancelled_count: '취소 건수',
  allocation_count: '배분 건수',
  allocation_total: '배분 총액',
  pending_transactions: '미배분 건수',
  total_jobs: '작업 수',
  total_lines: '라인 수',
  confirmed_lines: '확정 라인',
  reviewing_jobs: '검수 대기',
  receivable: '미수금',
  payable: '미지급',
  receipts: '입금(레거시)',
  payments: '송금(레거시)',
};

export default function FlowTestPage() {
  const theme = useTheme();
  const router = useAppRouter();
  const { enqueueSnackbar } = useSnackbar();

  const [data, setData] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settlementApi.flowTestHealthCheck();
      setData(res.data as unknown as HealthCheckResponse);
      setLastChecked(new Date());
    } catch {
      enqueueSnackbar('시스템 점검에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => { runCheck(); }, [runCheck]);

  const overallConfig = data ? STATUS_CONFIG[data.overall] : STATUS_CONFIG.info;
  const OverallIcon = overallConfig.icon;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<TestIcon />}
        title="업무 플로우 점검"
        description="정산 시스템의 전체 업무 흐름을 단계별로 점검합니다"
        color="info"
        actions={[{
          label: loading ? '점검 중...' : '다시 점검',
          onClick: runCheck,
          variant: 'contained' as const,
          icon: <RefreshIcon />,
          disabled: loading,
        }]}
      />

      {loading && !data && <LinearProgress sx={{ mb: 2 }} />}

      {data && (
        <Stack spacing={3}>
          {/* 전체 상태 요약 */}
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              background: `linear-gradient(135deg, ${alpha(theme.palette[overallConfig.color].main, 0.04)}, ${alpha(theme.palette[overallConfig.color].main, 0.01)})`,
              borderColor: alpha(theme.palette[overallConfig.color].main, 0.3),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <OverallIcon sx={{ fontSize: 40, color: `${overallConfig.color}.main` }} />
              <Box>
                <Typography variant="h5" fontWeight={700}>
                  시스템 상태: <Chip label={overallConfig.label} color={overallConfig.color} size="small" sx={{ ml: 1, fontWeight: 700 }} />
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {lastChecked && `마지막 점검: ${lastChecked.toLocaleTimeString('ko-KR')}`}
                </Typography>
              </Box>
            </Box>

            <Grid container spacing={2}>
              {[
                { label: '거래처', value: data.summary.counterparties, suffix: '개' },
                { label: '전표', value: data.summary.vouchers, suffix: '건' },
                { label: '입출금', value: data.summary.transactions, suffix: '건' },
                { label: '배분', value: data.summary.allocations, suffix: '건' },
                { label: '은행임포트', value: data.summary.bank_import_jobs, suffix: '건' },
              ].map((item) => (
                <Grid item xs={6} sm={4} md={2} key={item.label}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h6" fontWeight={700}>{formatNumber(item.value)}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.label} ({item.suffix})</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>

          {/* 업무 흐름 다이어그램 */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
              표준 업무 흐름
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: '거래처/법인\n등록', step: 'master' },
                { label: 'UPM 전표\n업로드', step: 'vouchers' },
                { label: '은행 입출금\n임포트', step: 'bank_import' },
                { label: '입출금 → 전표\n배분', step: 'allocations' },
                { label: '미수/미지급\n확인', step: 'balance' },
              ].map((item, idx) => {
                const check = data.checks.find(c => c.step === item.step);
                const cfg = check ? STATUS_CONFIG[check.status] : STATUS_CONFIG.info;
                const StepIcon = cfg.icon;

                return (
                  <Box key={item.step} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        minWidth: 120,
                        textAlign: 'center',
                        cursor: 'pointer',
                        borderColor: alpha(theme.palette[cfg.color].main, 0.4),
                        bgcolor: alpha(theme.palette[cfg.color].main, 0.04),
                        '&:hover': { bgcolor: alpha(theme.palette[cfg.color].main, 0.08) },
                        transition: 'all 0.2s',
                      }}
                      onClick={() => router.push(STEP_LINKS[item.step] || '/settlement/dashboard')}
                    >
                      <StepIcon sx={{ fontSize: 20, color: `${cfg.color}.main`, mb: 0.5 }} />
                      <Typography variant="caption" fontWeight={600} sx={{ whiteSpace: 'pre-line', display: 'block', lineHeight: 1.3 }}>
                        {item.label}
                      </Typography>
                    </Paper>
                    {idx < 4 && (
                      <Typography variant="h6" color="text.disabled" sx={{ mx: 0.5 }}>→</Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Paper>

          {/* 단계별 상세 결과 */}
          <Typography variant="subtitle1" fontWeight={700}>단계별 점검 결과</Typography>

          {data.checks.map((check) => {
            const cfg = STATUS_CONFIG[check.status];
            const Icon = cfg.icon;
            const link = STEP_LINKS[check.step];

            return (
              <Paper key={check.step} variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 40, height: 40, borderRadius: '50%',
                    bgcolor: alpha(theme.palette[cfg.color].main, 0.1),
                    flexShrink: 0,
                  }}>
                    <Icon sx={{ color: `${cfg.color}.main` }} />
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="subtitle2" fontWeight={700}>{check.title}</Typography>
                      <Chip label={cfg.label} color={cfg.color} size="small" variant="outlined" />
                      {link && (
                        <Tooltip title="해당 메뉴로 이동">
                          <IconButton size="small" onClick={() => router.push(link)}>
                            <LinkIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {check.message}
                    </Typography>

                    {/* 상세 데이터 */}
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      {Object.entries(check.details).map(([key, val]) => {
                        if (val === null || val === undefined || typeof val === 'object' || typeof val === 'boolean') return null;
                        const isAmount = key.includes('total') || key.includes('receivable') || key.includes('payable');
                        const displayVal = isAmount ? formatWon(Number(val)) : String(val);
                        return (
                          <Box key={key} sx={{ minWidth: 80 }}>
                            <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                              {DETAIL_LABELS[key] || key.replace(/_/g, ' ')}
                            </Typography>
                            <Typography variant="body2" fontWeight={600}>
                              {displayVal}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                </Box>
              </Paper>
            );
          })}

          {/* 빠른 액션 */}
          <Divider />
          <Typography variant="subtitle1" fontWeight={700}>빠른 액션</Typography>
          <Grid container spacing={2}>
            {[
              { label: '대시보드', path: '/settlement/dashboard', color: 'primary' },
              { label: 'UPM 업로드', path: '/settlement/upload', color: 'info' },
              { label: '은행 임포트', path: '/settlement/bank-import', color: 'info' },
              { label: '전표 목록', path: '/settlement/vouchers', color: 'secondary' },
              { label: '입출금 관리', path: '/settlement/transactions', color: 'secondary' },
              { label: '거래처 관리', path: '/settlement/counterparties', color: 'success' },
              { label: '거래처 현황', path: '/settlement/status', color: 'success' },
              { label: '법인 관리', path: '/settlement/corporate-entities', color: 'success' },
              { label: '마감 관리', path: '/settlement/lock', color: 'warning' },
              { label: '통계', path: '/settlement/statistics', color: 'inherit' },
            ].map((item) => (
              <Grid item xs={6} sm={3} md={2} key={item.path}>
                <Button
                  fullWidth
                  variant="outlined"
                  color={item.color as 'primary'}
                  onClick={() => router.push(item.path)}
                  sx={{ py: 1.5, textTransform: 'none', fontWeight: 600 }}
                >
                  {item.label}
                </Button>
              </Grid>
            ))}
          </Grid>
        </Stack>
      )}
    </AppPageContainer>
  );
}
