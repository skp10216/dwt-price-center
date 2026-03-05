'use client';

/**
 * 정산 시스템 — 업무 플로우 점검
 * Tab 1: 시스템 상태 점검 (헬스체크)
 * Tab 2: 시나리오 자동 테스트 (12단계 플로우 러너)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Stack, Alert, AlertTitle, Chip,
  Divider, LinearProgress, Tooltip, IconButton, alpha, useTheme,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Collapse, CircularProgress, Tabs, Tab,
} from '@mui/material';
import {
  CheckCircle as PassIcon,
  Warning as WarnIcon,
  Error as FailIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  OpenInNew as LinkIcon,
  Science as TestIcon,
  DeleteForever as ResetIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  CheckCircleOutline as StepPassIcon,
  ErrorOutline as StepFailIcon,
  HourglassEmpty as StepWaitIcon,
  FiberManualRecord as StepDotIcon,
  HealthAndSafety as HealthIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useAppRouter } from '@/lib/navigation';
import { useSnackbar } from 'notistack';
import { AppPageHeader } from '@/components/ui';

// ─── 타입 ────────────────────────────────────────

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
  description?: string;
  checks?: string[];
  depends_on?: number[];
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

// ─── 상수 ────────────────────────────────────────

const STATUS_MAP = {
  pass: { icon: PassIcon, color: 'success' as const, label: '통과' },
  warn: { icon: WarnIcon, color: 'warning' as const, label: '주의' },
  fail: { icon: FailIcon, color: 'error' as const, label: '실패' },
  info: { icon: InfoIcon, color: 'info' as const, label: '정보' },
};

const STEP_LINKS: Record<string, string> = {
  master: '/settlement/counterparties',
  vouchers: '/settlement/vouchers',
  transactions: '/settlement/transactions',
  allocations: '/settlement/transactions',
  bank_import: '/settlement/bank-import',
  balance: '/settlement/dashboard',
  legacy: '/settlement/activity',
  netting: '/settlement/netting',
};

const formatNum = (n: number) => new Intl.NumberFormat('ko-KR').format(Math.round(n));
const formatWon = (n: number) => `${formatNum(n)}원`;

const DETAIL_LABELS: Record<string, string> = {
  counterparties: '거래처', counterparties_active: '활성', aliases: '별칭',
  alias_coverage: '별칭 커버리지(%)', corporate_entities: '법인', branches: '지사',
  sales_count: '판매', sales_total: '판매 총액', purchase_count: '매입', purchase_total: '매입 총액',
  status_open: '미정산', status_settling: '정산중', status_settled: '정산완료', status_locked: '마감',
  deposit_active_count: '입금', deposit_active_total: '입금 총액',
  withdrawal_active_count: '출금', withdrawal_active_total: '출금 총액',
  cancelled_count: '취소', allocation_count: '배분', allocation_total: '배분 총액',
  pending_transactions: '미배분', total_jobs: '작업', total_lines: '라인',
  confirmed_lines: '확정', reviewing_jobs: '검수대기',
  receivable: '미수금', payable: '미지급',
  receipts: '입금(레거시)', payments: '송금(레거시)',
};

// ─── 헬스체크 항목 행 ────────────────────────────

function CheckRow({ check, onNavigate }: { check: CheckItem; onNavigate: (p: string) => void }) {
  const theme = useTheme();
  const cfg = STATUS_MAP[check.status] || STATUS_MAP.info;
  const Icon = cfg.icon;
  const link = STEP_LINKS[check.step];
  const [open, setOpen] = useState(false);

  const details = Object.entries(check.details).filter(
    ([, v]) => v !== null && v !== undefined && typeof v !== 'object' && typeof v !== 'boolean',
  );

  return (
    <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}`, '&:last-child': { borderBottom: 'none' } }}>
      <Box
        onClick={() => details.length > 0 && setOpen(!open)}
        sx={{
          px: 2.5, py: 1.5,
          display: 'flex', alignItems: 'center', gap: 1.5,
          cursor: details.length > 0 ? 'pointer' : 'default',
          '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.04) },
          transition: 'background-color 0.15s',
        }}
      >
        <Box sx={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: alpha(theme.palette[cfg.color].main, 0.1),
        }}>
          <Icon sx={{ fontSize: 18, color: `${cfg.color}.main` }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" fontWeight={700} noWrap>{check.title}</Typography>
            <Chip
              label={cfg.label} size="small"
              sx={{
                height: 20, fontSize: '0.675rem', fontWeight: 700,
                bgcolor: alpha(theme.palette[cfg.color].main, 0.1),
                color: `${cfg.color}.dark`, border: 'none',
              }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" noWrap>{check.message}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          {link && (
            <Tooltip title="해당 메뉴로 이동" arrow>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onNavigate(link); }}>
                <LinkIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {details.length > 0 && (
            <IconButton size="small" sx={{ p: 0.25 }}>
              {open ? <CollapseIcon sx={{ fontSize: 18 }} /> : <ExpandIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          )}
        </Box>
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 2.5, pb: 2, pt: 0.5, ml: 5.5, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {details.map(([key, val]) => {
            const isAmt = key.includes('total') || key.includes('receivable') || key.includes('payable');
            return (
              <Box key={key}>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.2 }}>
                  {DETAIL_LABELS[key] || key.replace(/_/g, ' ')}
                </Typography>
                <Typography variant="body2" fontWeight={600}>{isAmt ? formatWon(Number(val)) : String(val)}</Typography>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────

export default function FlowTestPage() {
  const theme = useTheme();
  const router = useAppRouter();
  const { enqueueSnackbar } = useSnackbar();
  const [activeTab, setActiveTab] = useState(0);

  // ── 헬스체크 상태
  const [data, setData] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // ── 초기화 상태
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  // ── 시나리오 상태
  const [scenarioRunning, setScenarioRunning] = useState(false);
  const [scenarioSteps, setScenarioSteps] = useState<ScenarioStep[]>([]);
  const [stepStates, setStepStates] = useState<Record<number, StepState>>({});
  const [stepResults, setStepResults] = useState<Record<number, StepResult>>({});
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [scenarioElapsed, setScenarioElapsed] = useState(0);
  const stopRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 헬스체크 ─────────────────────────

  const runCheck = useCallback(async (showFeedback = false) => {
    setLoading(true);
    try {
      const res = await settlementApi.flowTestHealthCheck();
      const result = res.data as unknown as HealthCheckResponse;
      setData(result);
      setLastChecked(new Date());
      if (showFeedback) {
        const lbl = { pass: '정상', warn: '주의', fail: '오류' }[result.overall] || result.overall;
        const p = result.checks.filter(c => c.status === 'pass').length;
        enqueueSnackbar(`점검 완료 — ${lbl} (${p}/${result.checks.length} 통과)`, {
          variant: result.overall === 'pass' ? 'success' : result.overall === 'fail' ? 'error' : 'warning',
        });
      }
    } catch {
      enqueueSnackbar('시스템 점검에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => { runCheck(); }, [runCheck]);

  // ── 초기화 ───────────────────────────

  const handleResetAll = useCallback(async () => {
    setResetting(true);
    try {
      const res = await settlementApi.flowTestResetAll();
      const result = res.data as unknown as { total_deleted: number };
      enqueueSnackbar(`초기화 완료 (${result.total_deleted.toLocaleString()}건 삭제)`, { variant: 'success' });
      setResetDialogOpen(false);
      setResetConfirmText('');
      // 시나리오 결과도 함께 초기화
      setStepStates({});
      setStepResults({});
      setExpandedStep(null);
      setScenarioElapsed(0);
      scenarioContextRef.current = {};
      runCheck();
    } catch {
      enqueueSnackbar('데이터 초기화에 실패했습니다.', { variant: 'error' });
    } finally {
      setResetting(false);
    }
  }, [enqueueSnackbar, runCheck]);

  // ── 시나리오 러너 ────────────────────

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
    setScenarioRunning(true);

    const init: Record<number, StepState> = {};
    scenarioSteps.forEach(s => { init[s.step] = 'idle'; });
    setStepStates(init);
    setStepResults({});
    setExpandedStep(null);

    const t0 = Date.now();
    setScenarioElapsed(0);
    timerRef.current = setInterval(() => setScenarioElapsed(Date.now() - t0), 100);

    let ctx: Record<string, unknown> = {};

    for (const s of scenarioSteps) {
      if (stopRef.current) {
        setStepStates(prev => ({ ...prev, [s.step]: 'skipped' }));
        continue;
      }
      setStepStates(prev => ({ ...prev, [s.step]: 'running' }));
      setExpandedStep(s.step);

      try {
        const res = await settlementApi.flowTestRunStep(s.step, ctx);
        const r = res.data as unknown as StepResult;
        if (r.context) ctx = { ...ctx, ...r.context };
        setStepStates(prev => ({ ...prev, [s.step]: r.status === 'pass' ? 'pass' : 'fail' }));
        setStepResults(prev => ({ ...prev, [s.step]: r }));
        if (r.status === 'fail') setExpandedStep(s.step);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '알 수 없는 오류';
        setStepStates(prev => ({ ...prev, [s.step]: 'fail' }));
        setStepResults(prev => ({
          ...prev,
          [s.step]: { step: s.step, name: s.name, status: 'fail', duration_ms: 0, message: `API 호출 실패: ${msg}`, details: {}, error: msg, context: ctx },
        }));
        setExpandedStep(s.step);
      }
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setScenarioElapsed(Date.now() - t0);
    setScenarioRunning(false);
    runCheck();
  }, [scenarioRunning, scenarioSteps, runCheck]);

  const stopScenario = useCallback(() => {
    stopRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── 개별 단계 실행 (수동) ────────────

  const [singleRunning, setSingleRunning] = useState<number | null>(null);
  const scenarioContextRef = useRef<Record<string, unknown>>({});

  const runSingleStep = useCallback(async (stepNum: number) => {
    if (scenarioRunning || singleRunning !== null) return;
    setSingleRunning(stepNum);
    setStepStates(prev => ({ ...prev, [stepNum]: 'running' }));
    setExpandedStep(stepNum);

    try {
      const res = await settlementApi.flowTestRunStep(stepNum, scenarioContextRef.current);
      const r = res.data as unknown as StepResult;
      if (r.context) {
        scenarioContextRef.current = { ...scenarioContextRef.current, ...r.context };
      }
      setStepStates(prev => ({ ...prev, [stepNum]: r.status === 'pass' ? 'pass' : 'fail' }));
      setStepResults(prev => ({ ...prev, [stepNum]: r }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      setStepStates(prev => ({ ...prev, [stepNum]: 'fail' }));
      setStepResults(prev => ({
        ...prev,
        [stepNum]: { step: stepNum, name: '', status: 'fail', duration_ms: 0, message: `API 호출 실패: ${msg}`, details: {}, error: msg, context: scenarioContextRef.current },
      }));
    } finally {
      setSingleRunning(null);
    }
  }, [scenarioRunning, singleRunning]);

  const resetScenarioResults = useCallback(() => {
    setStepStates({});
    setStepResults({});
    setExpandedStep(null);
    setScenarioElapsed(0);
    scenarioContextRef.current = {};
  }, []);

  // ── 통계 계산 ────────────────────────

  const sPass = Object.values(stepStates).filter(s => s === 'pass').length;
  const sFail = Object.values(stepStates).filter(s => s === 'fail').length;
  const sTotal = scenarioSteps.length;
  const sDone = sPass + sFail;
  const sProgress = sTotal > 0 ? (sDone / sTotal) * 100 : 0;

  const hPass = data?.checks.filter(c => c.status === 'pass').length ?? 0;
  const hWarn = data?.checks.filter(c => c.status === 'warn').length ?? 0;
  const hFail = data?.checks.filter(c => c.status === 'fail').length ?? 0;
  const hTotal = data?.checks.length ?? 0;

  // ── 렌더링 ──────────────────────────

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── 헤더 (고정) ──────────────────── */}
      <Box sx={{ flexShrink: 0 }}>
        <AppPageHeader
          icon={<TestIcon />}
          title="업무 플로우 점검"
          description="시스템 상태 확인 및 전체 플로우 자동 테스트"
          color="info"
          actions={[
            {
              label: '전체 초기화',
              onClick: () => setResetDialogOpen(true),
              variant: 'outlined' as const,
              color: 'error' as const,
              icon: <ResetIcon />,
            },
          ]}
        />
      </Box>

      {/* ── 탭 바 (고정) ──────────────────── */}
      <Paper
        variant="outlined"
        sx={{
          flexShrink: 0,
          borderLeft: 0, borderRight: 0, borderRadius: 0,
          px: 1,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ minHeight: 44 }}
        >
          <Tab
            icon={<HealthIcon />}
            iconPosition="start"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                시스템 상태
                {data && (
                  <Chip
                    size="small"
                    label={`${hPass}/${hTotal}`}
                    color={hFail > 0 ? 'error' : hWarn > 0 ? 'warning' : 'success'}
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                  />
                )}
              </Box>
            }
            sx={{ minHeight: 44, fontWeight: activeTab === 0 ? 700 : 400, textTransform: 'none' }}
          />
          <Tab
            icon={<TestIcon />}
            iconPosition="start"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                시나리오 테스트
                {scenarioRunning && <CircularProgress size={14} thickness={5} />}
                {!scenarioRunning && sDone > 0 && (
                  <Chip
                    size="small"
                    label={sFail === 0 ? `${sPass} PASS` : `${sFail} FAIL`}
                    color={sFail === 0 ? 'success' : 'error'}
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                  />
                )}
              </Box>
            }
            sx={{ minHeight: 44, fontWeight: activeTab === 1 ? 700 : 400, textTransform: 'none' }}
          />
        </Tabs>
      </Paper>

      {/* ── 탭 콘텐츠 (스크롤) ──────────────── */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>

        {/* ━━━ Tab 0: 시스템 상태 ━━━ */}
        {activeTab === 0 && (
          <Stack spacing={2}>
            {loading && !data && <LinearProgress />}

            {data && (
              <>
                {/* 상태 요약 카드 */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    borderColor: alpha(theme.palette[data.overall === 'pass' ? 'success' : data.overall === 'fail' ? 'error' : 'warning'].main, 0.3),
                    background: `linear-gradient(135deg, ${alpha(theme.palette[data.overall === 'pass' ? 'success' : data.overall === 'fail' ? 'error' : 'warning'].main, 0.04)}, transparent)`,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {(() => { const C = STATUS_MAP[data.overall]; const I = C.icon; return <I sx={{ fontSize: 28, color: `${C.color}.main` }} />; })()}
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700}>
                          시스템 상태: {STATUS_MAP[data.overall].label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {lastChecked && `마지막 점검 ${lastChecked.toLocaleTimeString('ko-KR')}`}
                        </Typography>
                      </Box>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
                      onClick={() => runCheck(true)}
                      disabled={loading}
                      sx={{ height: 32 }}
                    >
                      {loading ? '점검 중' : '점검 실행'}
                    </Button>
                  </Box>

                  {/* KPI 수치 */}
                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                    {[
                      { label: '통과', value: hPass, color: 'success' },
                      { label: '주의', value: hWarn, color: 'warning' },
                      { label: '실패', value: hFail, color: 'error' },
                    ].map(k => (
                      <Chip
                        key={k.label}
                        icon={k.value > 0 ? (() => { const I = STATUS_MAP[k.label === '통과' ? 'pass' : k.label === '주의' ? 'warn' : 'fail'].icon; return <I sx={{ fontSize: '16px !important' }} />; })() : undefined}
                        label={`${k.label} ${k.value}`}
                        size="small"
                        color={k.value > 0 ? k.color as 'success' : 'default'}
                        variant={k.value > 0 ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 700 }}
                      />
                    ))}
                    <Divider orientation="vertical" flexItem />
                    {[
                      { l: '거래처', v: data.summary.counterparties },
                      { l: '전표', v: data.summary.vouchers },
                      { l: '입출금', v: data.summary.transactions },
                      { l: '배분', v: data.summary.allocations },
                      { l: '은행임포트', v: data.summary.bank_import_jobs },
                    ].map(m => (
                      <Chip
                        key={m.l}
                        label={`${m.l} ${formatNum(m.v)}`}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 600 }}
                      />
                    ))}
                  </Box>
                </Paper>

                {/* 점검 항목 목록 */}
                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                  <Box sx={{
                    px: 2.5, py: 1.25,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    bgcolor: alpha(theme.palette.background.default, 0.5),
                  }}>
                    <Typography variant="subtitle2" fontWeight={700}>단계별 점검 결과</Typography>
                    <Typography variant="caption" color="text.secondary">{hPass}/{hTotal} 통과</Typography>
                  </Box>
                  {data.checks.map(check => (
                    <CheckRow key={check.step} check={check} onNavigate={p => router.push(p)} />
                  ))}
                </Paper>

                {/* 빠른 이동 */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', pt: 0.5 }}>
                  <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center', mr: 0.5 }}>바로가기</Typography>
                  {[
                    { label: '대시보드', path: '/settlement/dashboard' },
                    { label: 'UPM 업로드', path: '/settlement/upload' },
                    { label: '은행 임포트', path: '/settlement/bank-import' },
                    { label: '전표', path: '/settlement/vouchers' },
                    { label: '입출금', path: '/settlement/transactions' },
                    { label: '거래처', path: '/settlement/counterparties' },
                    { label: '상계', path: '/settlement/netting' },
                    { label: '마감', path: '/settlement/lock' },
                  ].map(item => (
                    <Chip key={item.path} label={item.label} size="small" variant="outlined" clickable
                      onClick={() => router.push(item.path)}
                      sx={{ fontWeight: 600, '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) } }}
                    />
                  ))}
                </Box>
              </>
            )}
          </Stack>
        )}

        {/* ━━━ Tab 1: 시나리오 테스트 ━━━ */}
        {activeTab === 1 && (
          <Stack spacing={2}>
            {/* 컨트롤 바 */}
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>시나리오 테스트</Typography>
                  <Typography variant="caption" color="text.secondary">
                    전체 자동 실행하거나, 각 단계를 개별적으로 실행할 수 있습니다. 전체 초기화 후 실행을 권장합니다.
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                  {sDone > 0 && !scenarioRunning && (
                    <Button variant="text" size="small" onClick={resetScenarioResults} sx={{ fontSize: '0.75rem' }}>
                      결과 초기화
                    </Button>
                  )}
                  {scenarioRunning ? (
                    <Button variant="outlined" color="error" startIcon={<StopIcon />} onClick={stopScenario} size="small">
                      중지
                    </Button>
                  ) : (
                    <Button variant="contained" color="info" startIcon={<PlayIcon />} onClick={startScenario}
                      disabled={scenarioSteps.length === 0 || singleRunning !== null} size="small"
                    >
                      전체 실행
                    </Button>
                  )}
                </Box>
              </Box>

              {/* 진행 상태 */}
              {(scenarioRunning || sDone > 0) && (
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                      {sDone}/{sTotal} 완료{scenarioElapsed > 0 ? ` · ${(scenarioElapsed / 1000).toFixed(1)}초` : ''}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {sPass > 0 && <Chip size="small" label={`${sPass} PASS`} color="success" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />}
                      {sFail > 0 && <Chip size="small" label={`${sFail} FAIL`} color="error" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />}
                    </Box>
                  </Box>
                  <LinearProgress variant="determinate" value={sProgress} color={sFail > 0 ? 'error' : 'info'} sx={{ height: 6, borderRadius: 3 }} />
                </Box>
              )}
            </Paper>

            {/* 완료 배너 */}
            {!scenarioRunning && sDone === sTotal && sTotal > 0 && (
              <Alert severity={sFail === 0 ? 'success' : 'error'} variant="filled">
                <AlertTitle>{sFail === 0 ? '전체 통과' : `${sFail}개 단계 실패`}</AlertTitle>
                {sFail === 0
                  ? `전체 ${sTotal}단계를 ${(scenarioElapsed / 1000).toFixed(1)}초 만에 모두 통과했습니다.`
                  : `${sPass}개 통과, ${sFail}개 실패 (총 ${(scenarioElapsed / 1000).toFixed(1)}초)`}
              </Alert>
            )}

            {/* 단계 카드 목록 */}
            {scenarioSteps.map((s, idx) => {
              const state = stepStates[s.step] || 'idle';
              const result = stepResults[s.step];
              const isExp = expandedStep === s.step;
              const isBusy = state === 'running' || singleRunning === s.step;

              // 순차 실행 제어: 이전 단계가 모두 pass여야 실행 가능
              const prevStepsCompleted = scenarioSteps
                .slice(0, idx)
                .every(ps => stepStates[ps.step] === 'pass');
              const isCompleted = state === 'pass';
              const isStepEnabled = !scenarioRunning && singleRunning === null && prevStepsCompleted && !isCompleted;
              const isDisabled = !isStepEnabled && !isBusy;

              return (
                <Paper
                  key={s.step}
                  variant="outlined"
                  sx={{
                    overflow: 'hidden',
                    opacity: isDisabled && state !== 'fail' ? 0.5 : 1,
                    borderColor: state === 'pass' ? alpha(theme.palette.success.main, 0.4)
                      : state === 'fail' ? alpha(theme.palette.error.main, 0.4)
                      : state === 'running' ? alpha(theme.palette.info.main, 0.4)
                      : undefined,
                    transition: 'all 0.2s',
                    pointerEvents: isDisabled && !result ? 'none' : 'auto',
                  }}
                >
                  {/* 카드 헤더 */}
                  <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    {/* 상태 아이콘 */}
                    <Box sx={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0, mt: 0.25,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: state === 'pass' ? alpha(theme.palette.success.main, 0.1)
                        : state === 'fail' ? alpha(theme.palette.error.main, 0.1)
                        : state === 'running' ? alpha(theme.palette.info.main, 0.1)
                        : alpha(theme.palette.action.selected, 0.08),
                    }}>
                      {isBusy ? <CircularProgress size={18} thickness={5} />
                        : state === 'pass' ? <StepPassIcon sx={{ color: 'success.main', fontSize: 20 }} />
                        : state === 'fail' ? <StepFailIcon sx={{ color: 'error.main', fontSize: 20 }} />
                        : state === 'skipped' ? <StepWaitIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
                        : <Typography variant="caption" fontWeight={700} color="text.secondary">{s.step}</Typography>}
                    </Box>

                    {/* 내용 */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                        <Typography variant="body2" fontWeight={700} color={isDisabled && !result ? 'text.disabled' : 'text.primary'}>
                          Step {s.step}. {s.name}
                        </Typography>
                        {result && (
                          <Chip
                            size="small"
                            label={`${result.status === 'pass' ? 'PASS' : 'FAIL'} · ${result.duration_ms}ms`}
                            color={result.status === 'pass' ? 'success' : 'error'}
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                          />
                        )}
                        {isCompleted && (
                          <Chip size="small" label="완료" variant="filled" color="success"
                            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }} />
                        )}
                        {!prevStepsCompleted && !result && (
                          <Chip size="small" label="이전 단계 필요" variant="outlined" color="default"
                            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600 }} />
                        )}
                      </Box>
                      {s.description && (
                        <Typography variant="caption" color={isDisabled && !result ? 'text.disabled' : 'text.secondary'} sx={{ display: 'block', mb: 0.75 }}>
                          {s.description}
                        </Typography>
                      )}
                      {/* 확인 포인트 */}
                      {s.checks && s.checks.length > 0 && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                          {s.checks.map((c, i) => (
                            <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                              <Box sx={{
                                width: 5, height: 5, borderRadius: '50%', mt: 0.8, flexShrink: 0,
                                bgcolor: result
                                  ? result.status === 'pass' ? theme.palette.success.main : theme.palette.error.main
                                  : theme.palette.text.disabled,
                              }} />
                              <Typography variant="caption" color={result ? (result.status === 'pass' ? 'success.dark' : 'text.primary') : 'text.secondary'}>
                                {c}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>

                    {/* 실행 버튼 */}
                    <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {result && (
                        <IconButton size="small" onClick={() => setExpandedStep(isExp ? null : s.step)}>
                          {isExp ? <CollapseIcon sx={{ fontSize: 18 }} /> : <ExpandIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                      )}
                      <Tooltip title={
                        isBusy ? '실행 중...'
                          : isCompleted ? '이미 완료됨'
                          : !prevStepsCompleted ? '이전 단계를 먼저 완료하세요'
                          : `Step ${s.step} 실행`
                      } arrow>
                        <span>
                          <IconButton
                            size="small"
                            color="info"
                            disabled={!isStepEnabled || isBusy}
                            onClick={() => runSingleStep(s.step)}
                            sx={{
                              border: `1px solid ${alpha(theme.palette.info.main, isStepEnabled ? 0.3 : 0.1)}`,
                              '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.08) },
                            }}
                          >
                            {isBusy ? <CircularProgress size={16} thickness={5} /> : <PlayIcon sx={{ fontSize: 18 }} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </Box>

                  {/* 실행 결과 상세 */}
                  <Collapse in={isExp && !!result}>
                    {result && (
                      <Box sx={{
                        px: 2.5, pb: 2, pt: 0.5, mx: 2, mb: 1,
                        borderLeft: `3px solid ${result.status === 'pass' ? theme.palette.success.main : theme.palette.error.main}`,
                        borderRadius: '0 4px 4px 0',
                        bgcolor: alpha(result.status === 'pass' ? theme.palette.success.main : theme.palette.error.main, 0.02),
                      }}>
                        <Typography variant="body2" fontWeight={600} sx={{ mb: 1, color: result.status === 'pass' ? 'success.dark' : 'error.dark' }}>
                          {result.message}
                        </Typography>
                        {Object.keys(result.details).length > 0 && (
                          <Box sx={{
                            p: 1.5, borderRadius: 1, fontSize: '0.75rem', fontFamily: 'monospace',
                            bgcolor: theme.palette.background.paper,
                            border: `1px solid ${theme.palette.divider}`,
                            maxHeight: 280, overflow: 'auto',
                          }}>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {JSON.stringify(result.details, null, 2)}
                            </pre>
                          </Box>
                        )}
                        {result.error && (
                          <Alert severity="error" sx={{ mt: 1 }} variant="outlined">
                            <AlertTitle>에러 상세</AlertTitle>
                            <Box component="pre" sx={{ m: 0, fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>
                              {result.error}
                            </Box>
                          </Alert>
                        )}
                      </Box>
                    )}
                  </Collapse>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* ── 초기화 다이얼로그 ─────────────── */}
      <Dialog
        open={resetDialogOpen}
        onClose={() => { if (!resetting) { setResetDialogOpen(false); setResetConfirmText(''); } }}
        maxWidth="sm" fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ResetIcon color="error" /> 전체 데이터 초기화
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>되돌릴 수 없습니다</AlertTitle>
            모든 정산 데이터가 <strong>영구 삭제</strong>됩니다.
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            계속하려면 <strong>초기화</strong>를 입력하세요.
          </Typography>
          <TextField fullWidth size="small" placeholder="초기화" value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)} disabled={resetting} autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setResetDialogOpen(false); setResetConfirmText(''); }} disabled={resetting}>취소</Button>
          <Button variant="contained" color="error" onClick={handleResetAll}
            disabled={resetting || resetConfirmText !== '초기화'} startIcon={<ResetIcon />}
          >
            {resetting ? '초기화 중...' : '전체 초기화 실행'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
