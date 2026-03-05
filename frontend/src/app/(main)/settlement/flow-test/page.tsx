'use client';

/**
 * 정산 시스템 — 전체 업무 플로우 테스트 대시보드
 * 각 업무 단계의 상태를 한눈에 점검 + 시나리오 자동 테스트 러너
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Stack, Alert, AlertTitle, Chip,
  Divider, LinearProgress, Tooltip, IconButton, alpha, useTheme, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Collapse, CircularProgress,
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
  DeleteForever as ResetIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Timer as TimerIcon,
  CheckCircleOutline as StepPassIcon,
  ErrorOutline as StepFailIcon,
  HourglassEmpty as StepWaitIcon,
  FiberManualRecord as StepDotIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useAppRouter } from '@/lib/navigation';
import { useSnackbar } from 'notistack';
import { AppPageContainer, AppPageHeader } from '@/components/ui';

// ─── 타입 정의 ────────────────────────────────────────

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

interface ScenarioStep {
  step: number;
  name: string;
}

interface StepResult {
  step: number;
  name: string;
  status: 'pass' | 'fail' | 'warn';
  duration_ms: number;
  message: string;
  details: Record<string, unknown>;
  error: string | null;
  context: Record<string, unknown>;
}

type StepState = 'idle' | 'running' | 'pass' | 'fail' | 'skipped';

// ─── 상수 ──────────────────────────────────────────────

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

// ─── 컴포넌트 ──────────────────────────────────────────

export default function FlowTestPage() {
  const theme = useTheme();
  const router = useAppRouter();
  const { enqueueSnackbar } = useSnackbar();

  // 헬스체크 상태
  const [data, setData] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // 전체 초기화 상태
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  // 시나리오 테스트 러너 상태
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenarioRunning, setScenarionRunning] = useState(false);
  const [scenarioSteps, setScenarioSteps] = useState<ScenarioStep[]>([]);
  const [stepStates, setStepStates] = useState<Record<number, StepState>>({});
  const [stepResults, setStepResults] = useState<Record<number, StepResult>>({});
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [scenarioContext, setScenarioContext] = useState<Record<string, unknown>>({});
  const [scenarioStartTime, setScenarioStartTime] = useState<number | null>(null);
  const [scenarioElapsed, setScenarioElapsed] = useState(0);
  const stopRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 헬스체크 ────────────────────────────────

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

  // ─── 초기화 ──────────────────────────────────

  const handleResetAll = useCallback(async () => {
    setResetting(true);
    try {
      const res = await settlementApi.flowTestResetAll();
      const result = res.data as unknown as { total_deleted: number; summary: Record<string, number> };
      enqueueSnackbar(`전체 데이터 초기화 완료 (총 ${result.total_deleted.toLocaleString()}건 삭제)`, { variant: 'success' });
      setResetDialogOpen(false);
      setResetConfirmText('');
      runCheck();
    } catch {
      enqueueSnackbar('데이터 초기화에 실패했습니다.', { variant: 'error' });
    } finally {
      setResetting(false);
    }
  }, [enqueueSnackbar, runCheck]);

  // ─── 시나리오 러너 ──────────────────────────

  // 단계 목록 로드
  useEffect(() => {
    (async () => {
      try {
        const res = await settlementApi.flowTestGetSteps();
        const d = res.data as unknown as { total_steps: number; steps: ScenarioStep[] };
        setScenarioSteps(d.steps);
      } catch { /* ignore */ }
    })();
  }, []);

  const startScenario = useCallback(async () => {
    if (scenarioRunning) return;
    stopRef.current = false;
    setScenarionRunning(true);

    // 초기화
    const initialStates: Record<number, StepState> = {};
    scenarioSteps.forEach(s => { initialStates[s.step] = 'idle'; });
    setStepStates(initialStates);
    setStepResults({});
    setExpandedStep(null);
    setScenarioOpen(true);

    const startTs = Date.now();
    setScenarioStartTime(startTs);
    setScenarioElapsed(0);
    timerRef.current = setInterval(() => {
      setScenarioElapsed(Date.now() - startTs);
    }, 100);

    let ctx: Record<string, unknown> = {};
    setScenarioContext({});

    for (const s of scenarioSteps) {
      if (stopRef.current) {
        setStepStates(prev => ({ ...prev, [s.step]: 'skipped' }));
        continue;
      }

      // 현재 단계 실행 중
      setStepStates(prev => ({ ...prev, [s.step]: 'running' }));
      setExpandedStep(s.step);

      try {
        const res = await settlementApi.flowTestRunStep(s.step, ctx);
        const result = res.data as unknown as StepResult;

        // context 업데이트
        if (result.context) {
          ctx = { ...ctx, ...result.context };
          setScenarioContext(ctx);
        }

        const state: StepState = result.status === 'pass' ? 'pass' : 'fail';
        setStepStates(prev => ({ ...prev, [s.step]: state }));
        setStepResults(prev => ({ ...prev, [s.step]: result }));

        // 실패 시 자동 확장
        if (result.status === 'fail') {
          setExpandedStep(s.step);
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
        setStepStates(prev => ({ ...prev, [s.step]: 'fail' }));
        setStepResults(prev => ({
          ...prev,
          [s.step]: {
            step: s.step,
            name: s.name,
            status: 'fail',
            duration_ms: 0,
            message: `API 호출 실패: ${errorMessage}`,
            details: {},
            error: errorMessage,
            context: ctx,
          },
        }));
        setExpandedStep(s.step);
      }
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setScenarioElapsed(Date.now() - startTs);
    setScenarionRunning(false);

    // 완료 후 헬스체크 갱신
    runCheck();
  }, [scenarioRunning, scenarioSteps, runCheck]);

  const stopScenario = useCallback(() => {
    stopRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // cleanup timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ─── 시나리오 통계 계산 ──────────────────────

  const passCount = Object.values(stepStates).filter(s => s === 'pass').length;
  const failCount = Object.values(stepStates).filter(s => s === 'fail').length;
  const totalSteps = scenarioSteps.length;
  const completedCount = passCount + failCount;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  // ─── 렌더링 ──────────────────────────────────

  const overallConfig = data ? STATUS_CONFIG[data.overall] : STATUS_CONFIG.info;
  const OverallIcon = overallConfig.icon;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<TestIcon />}
        title="업무 플로우 점검"
        description="정산 시스템의 전체 업무 흐름을 단계별로 점검합니다"
        color="info"
        actions={[
          {
            label: '전체 데이터 초기화',
            onClick: () => setResetDialogOpen(true),
            variant: 'outlined' as const,
            color: 'error' as const,
            icon: <ResetIcon />,
          },
          {
            label: loading ? '점검 중...' : '다시 점검',
            onClick: runCheck,
            variant: 'contained' as const,
            icon: <RefreshIcon />,
            disabled: loading,
          },
        ]}
      />

      {loading && !data && <LinearProgress sx={{ mb: 2 }} />}

      {/* ── 시나리오 테스트 러너 ────────────────────────── */}
      <Paper
        variant="outlined"
        sx={{
          mb: 3,
          overflow: 'hidden',
          borderColor: scenarioRunning
            ? alpha(theme.palette.info.main, 0.5)
            : alpha(theme.palette.divider, 1),
          transition: 'border-color 0.3s',
        }}
      >
        {/* 헤더 */}
        <Box
          sx={{
            px: 3, py: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.06)}, ${alpha(theme.palette.primary.main, 0.03)})`,
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
            cursor: 'pointer',
          }}
          onClick={() => setScenarioOpen(!scenarioOpen)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <TestIcon sx={{ color: 'info.main', fontSize: 28 }} />
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                시나리오 자동 테스트
              </Typography>
              <Typography variant="caption" color="text.secondary">
                12단계 전체 플로우를 자동으로 실행하고 결과를 검증합니다
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {completedCount > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1 }}>
                <Chip
                  size="small"
                  label={`${passCount} 통과`}
                  color="success"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
                {failCount > 0 && (
                  <Chip
                    size="small"
                    label={`${failCount} 실패`}
                    color="error"
                    variant="outlined"
                    sx={{ fontWeight: 600 }}
                  />
                )}
              </Box>
            )}
            {scenarioRunning ? (
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<StopIcon />}
                onClick={(e) => { e.stopPropagation(); stopScenario(); }}
              >
                중지
              </Button>
            ) : (
              <Button
                size="small"
                variant="contained"
                color="info"
                startIcon={<PlayIcon />}
                onClick={(e) => { e.stopPropagation(); startScenario(); }}
                disabled={scenarioSteps.length === 0}
              >
                테스트 실행
              </Button>
            )}
            <IconButton size="small">
              {scenarioOpen ? <CollapseIcon /> : <ExpandIcon />}
            </IconButton>
          </Box>
        </Box>

        {/* 진행 바 */}
        {scenarioRunning && (
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 3,
              '& .MuiLinearProgress-bar': {
                transition: 'transform 0.5s ease',
              },
            }}
          />
        )}

        {/* 본문 */}
        <Collapse in={scenarioOpen}>
          <Box sx={{ p: 0 }}>
            {/* 경과 시간 + 요약 */}
            {(scenarioRunning || completedCount > 0) && (
              <Box
                sx={{
                  px: 3, py: 1.5,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  bgcolor: alpha(theme.palette.background.default, 0.5),
                  borderBottom: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TimerIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                    {(scenarioElapsed / 1000).toFixed(1)}s
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mx: 1 }}>|</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {completedCount}/{totalSteps} 완료
                  </Typography>
                </Box>
                {!scenarioRunning && completedCount === totalSteps && (
                  <Chip
                    size="small"
                    label={failCount === 0 ? '전체 통과' : `${failCount}건 실패`}
                    color={failCount === 0 ? 'success' : 'error'}
                    sx={{ fontWeight: 700 }}
                  />
                )}
              </Box>
            )}

            {/* 단계별 결과 */}
            {scenarioSteps.map((s) => {
              const state = stepStates[s.step] || 'idle';
              const result = stepResults[s.step];
              const isExpanded = expandedStep === s.step;

              return (
                <Box
                  key={s.step}
                  sx={{
                    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                    '&:last-child': { borderBottom: 'none' },
                  }}
                >
                  {/* 단계 헤더 */}
                  <Box
                    sx={{
                      px: 3, py: 1.5,
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      cursor: result ? 'pointer' : 'default',
                      '&:hover': result ? {
                        bgcolor: alpha(theme.palette.action.hover, 0.04),
                      } : {},
                      bgcolor: state === 'running'
                        ? alpha(theme.palette.info.main, 0.04)
                        : 'transparent',
                      transition: 'background-color 0.3s',
                    }}
                    onClick={() => result && setExpandedStep(isExpanded ? null : s.step)}
                  >
                    {/* 상태 아이콘 */}
                    <Box sx={{ width: 28, display: 'flex', justifyContent: 'center' }}>
                      {state === 'running' ? (
                        <CircularProgress size={20} thickness={5} />
                      ) : state === 'pass' ? (
                        <StepPassIcon sx={{ color: 'success.main', fontSize: 22 }} />
                      ) : state === 'fail' ? (
                        <StepFailIcon sx={{ color: 'error.main', fontSize: 22 }} />
                      ) : state === 'skipped' ? (
                        <StepWaitIcon sx={{ color: 'text.disabled', fontSize: 22 }} />
                      ) : (
                        <StepDotIcon sx={{ color: 'text.disabled', fontSize: 10 }} />
                      )}
                    </Box>

                    {/* 단계 번호 + 이름 */}
                    <Chip
                      label={s.step}
                      size="small"
                      sx={{
                        minWidth: 28, height: 22,
                        fontWeight: 700, fontSize: '0.7rem',
                        bgcolor: state === 'pass'
                          ? alpha(theme.palette.success.main, 0.1)
                          : state === 'fail'
                            ? alpha(theme.palette.error.main, 0.1)
                            : alpha(theme.palette.action.selected, 0.08),
                        color: state === 'pass'
                          ? 'success.dark'
                          : state === 'fail'
                            ? 'error.dark'
                            : 'text.secondary',
                      }}
                    />
                    <Typography
                      variant="body2"
                      fontWeight={state === 'running' ? 700 : 500}
                      sx={{
                        flex: 1,
                        color: state === 'idle' ? 'text.secondary' : 'text.primary',
                      }}
                    >
                      {s.name}
                    </Typography>

                    {/* 시간 + 상태 */}
                    {result && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" color="text.disabled" fontFamily="monospace">
                          {result.duration_ms}ms
                        </Typography>
                        {result && <IconButton size="small" sx={{ p: 0.25 }}>
                          {isExpanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                        </IconButton>}
                      </Box>
                    )}
                  </Box>

                  {/* 상세 결과 */}
                  <Collapse in={isExpanded && !!result}>
                    {result && (
                      <Box
                        sx={{
                          px: 3, pb: 2, pt: 0.5, ml: 5.5,
                          borderLeft: `2px solid ${
                            result.status === 'pass'
                              ? theme.palette.success.main
                              : theme.palette.error.main
                          }`,
                        }}
                      >
                        {/* 메시지 */}
                        <Typography
                          variant="body2"
                          sx={{
                            mb: 1,
                            color: result.status === 'pass' ? 'success.dark' : 'error.dark',
                            fontWeight: 600,
                          }}
                        >
                          {result.message}
                        </Typography>

                        {/* 상세 데이터 */}
                        {Object.keys(result.details).length > 0 && (
                          <Box
                            sx={{
                              p: 1.5,
                              borderRadius: 1,
                              bgcolor: alpha(theme.palette.background.default, 0.7),
                              border: `1px solid ${theme.palette.divider}`,
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                              maxHeight: 300,
                              overflow: 'auto',
                            }}
                          >
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {JSON.stringify(result.details, null, 2)}
                            </pre>
                          </Box>
                        )}

                        {/* 에러 트레이스백 */}
                        {result.error && (
                          <Alert severity="error" sx={{ mt: 1 }} variant="outlined">
                            <AlertTitle>에러 상세</AlertTitle>
                            <Box
                              component="pre"
                              sx={{
                                m: 0, fontSize: '0.7rem', fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                maxHeight: 200, overflow: 'auto',
                              }}
                            >
                              {result.error}
                            </Box>
                          </Alert>
                        )}
                      </Box>
                    )}
                  </Collapse>
                </Box>
              );
            })}

            {/* 빈 상태 */}
            {scenarioSteps.length > 0 && completedCount === 0 && !scenarioRunning && (
              <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
                <PlayIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  상단의 <strong>테스트 실행</strong> 버튼을 클릭하여 시나리오를 시작하세요
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  전체 데이터를 초기화한 후 12단계 플로우를 자동으로 실행합니다
                </Typography>
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

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

      {/* 전체 데이터 초기화 확인 다이얼로그 */}
      <Dialog
        open={resetDialogOpen}
        onClose={() => { if (!resetting) { setResetDialogOpen(false); setResetConfirmText(''); } }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ResetIcon color="error" />
          전체 데이터 초기화
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>이 작업은 되돌릴 수 없습니다</AlertTitle>
            거래처, 법인, 지사, 전표, 입출금 내역, 배분, 상계, 은행 임포트, 마감, 업로드 템플릿, 작업 내역 등
            <strong> 모든 정산 데이터가 영구 삭제</strong>됩니다.
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            계속하려면 아래에 <strong>초기화</strong>를 입력하세요.
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="초기화"
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            disabled={resetting}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => { setResetDialogOpen(false); setResetConfirmText(''); }}
            disabled={resetting}
          >
            취소
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleResetAll}
            disabled={resetting || resetConfirmText !== '초기화'}
            startIcon={<ResetIcon />}
          >
            {resetting ? '초기화 중...' : '전체 초기화 실행'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
