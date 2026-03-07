'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Skeleton, Chip, Button,
  TextField, FormControlLabel, Switch, useTheme,
  Table, TableHead, TableBody, TableRow, TableCell,
  Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Select, InputLabel, FormControl, Link as MuiLink,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import VerifiedIcon from '@mui/icons-material/Verified';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BuildIcon from '@mui/icons-material/Build';
import SearchIcon from '@mui/icons-material/Search';
import AdjustIcon from '@mui/icons-material/Tune';
import { AppPageContainer, AppPageHeader } from '@/components/ui';
import { settlementAdminApi } from '@/lib/api';

// --- 검증 결과 카드 ---
interface CheckResult {
  total_checked: number;
  is_consistent: boolean;
  mismatches?: { transaction_id: string; stored: string; actual: string }[];
  over_allocated?: { voucher_id: string; total_amount: string; allocated: string; balance: string }[];
}

type FixType = 'allocations' | 'voucher-balances';

function IntegrityCard({ title, description, result, loading, fixType, onFix, fixing }: {
  title: string; description: string; result: CheckResult | null; loading: boolean;
  fixType?: FixType; onFix?: (type: FixType) => void; fixing?: boolean;
}) {
  const theme = useTheme();

  if (loading) return <Skeleton variant="rounded" height={160} sx={{ borderRadius: 3 }} />;

  const isOk = result?.is_consistent ?? true;
  const color = isOk ? theme.palette.success.main : theme.palette.error.main;
  const issues = result?.mismatches?.length || result?.over_allocated?.length || 0;

  return (
    <Paper sx={{
      p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider',
      borderTop: `3px solid ${color}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <Box sx={{
        position: 'absolute', top: -30, right: -30,
        width: 100, height: 100, borderRadius: '50%', bgcolor: alpha(color, 0.05),
      }} />
      <Stack spacing={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {!isOk && fixType && onFix && (
              <Button
                size="small"
                variant="contained"
                color="warning"
                startIcon={<BuildIcon sx={{ fontSize: 14 }} />}
                onClick={() => onFix(fixType)}
                disabled={fixing}
                sx={{ fontSize: '0.65rem', py: 0.25, px: 1, minWidth: 0 }}
              >
                {fixing ? '수정 중...' : '자동 수정'}
              </Button>
            )}
            <Chip
              icon={isOk ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <ErrorIcon sx={{ fontSize: 14 }} />}
              label={isOk ? '정상' : `불일치 ${issues}건`}
              size="small"
              sx={{
                bgcolor: alpha(color, 0.1), color, fontWeight: 700, fontSize: '0.7rem',
                '& .MuiChip-icon': { color },
              }}
            />
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary">{description}</Typography>
        <Stack direction="row" spacing={3}>
          <Box>
            <Typography variant="caption" color="text.disabled">검사 건수</Typography>
            <Typography variant="h6" fontWeight={800} sx={{ fontFeatureSettings: '"tnum" on' }}>
              {result?.total_checked?.toLocaleString() || 0}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.disabled">불일치</Typography>
            <Typography variant="h6" fontWeight={800} color={isOk ? 'success.main' : 'error.main'}
              sx={{ fontFeatureSettings: '"tnum" on' }}>
              {issues}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.disabled">일치율</Typography>
            <Typography variant="h6" fontWeight={800} sx={{ fontFeatureSettings: '"tnum" on' }}>
              {result && result.total_checked > 0
                ? `${((1 - issues / result.total_checked) * 100).toFixed(1)}%`
                : '-'
              }
            </Typography>
          </Box>
        </Stack>

        {/* 불일치 상세 (최대 5건) — 클릭 가능한 링크 */}
        {!isOk && result?.mismatches && result.mismatches.length > 0 && (
          <Box sx={{ mt: 1, p: 1.5, bgcolor: alpha(color, 0.04), borderRadius: 2 }}>
            <Typography variant="caption" fontWeight={700} color="error" sx={{ mb: 0.5, display: 'block' }}>
              불일치 항목 (상위 {Math.min(result.mismatches.length, 5)}건)
            </Typography>
            {result.mismatches.slice(0, 5).map((m, i) => (
              <Typography key={i} variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                <MuiLink
                  href={`/settlement/transactions?id=${m.transaction_id}`}
                  sx={{ color: 'primary.main', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {m.transaction_id.slice(0, 8)}...
                </MuiLink>
                {' | 저장: '}{m.stored}{' | 실제: '}{m.actual}
              </Typography>
            ))}
          </Box>
        )}
        {!isOk && result?.over_allocated && result.over_allocated.length > 0 && (
          <Box sx={{ mt: 1, p: 1.5, bgcolor: alpha(color, 0.04), borderRadius: 2 }}>
            <Typography variant="caption" fontWeight={700} color="error" sx={{ mb: 0.5, display: 'block' }}>
              초과배분 항목 (상위 {Math.min(result.over_allocated.length, 5)}건)
            </Typography>
            {result.over_allocated.slice(0, 5).map((m, i) => (
              <Typography key={i} variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                <MuiLink
                  href={`/settlement/vouchers/${m.voucher_id}`}
                  sx={{ color: 'primary.main', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {m.voucher_id.slice(0, 8)}...
                </MuiLink>
                {' | 금액: '}{m.total_amount}{' | 배분: '}{m.allocated}{' | 잔액: '}{m.balance}
              </Typography>
            ))}
          </Box>
        )}
      </Stack>
    </Paper>
  );
}

// --- 메인 ---
export default function IntegrityPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [tab, setTab] = useState(0);
  const [checkLoading, setCheckLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [integrity, setIntegrity] = useState<any>(null);

  // 거래처 잔액
  const [balanceLoading, setBalanceLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [balanceData, setBalanceData] = useState<any[]>([]);
  const [balanceTotal, setBalanceTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [mismatchOnly, setMismatchOnly] = useState(false);

  // 잔액 조정 다이얼로그
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; name: string } | null>(null);
  const [adjustType, setAdjustType] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [adjustVoucherType, setAdjustVoucherType] = useState<'SALES' | 'PURCHASE'>('SALES');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  const runCheck = useCallback(async () => {
    setCheckLoading(true);
    try {
      const res = await settlementAdminApi.checkIntegrity();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res.data as any)?.data ?? res.data;
      setIntegrity(data);
      if (data.is_consistent) {
        enqueueSnackbar('전체 정합성 검증 통과', { variant: 'success' });
      } else {
        enqueueSnackbar('정합성 불일치가 발견되었습니다.', { variant: 'warning' });
      }
    } catch {
      enqueueSnackbar('정합성 점검 실패', { variant: 'error' });
    } finally {
      setCheckLoading(false);
    }
  }, [enqueueSnackbar]);

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const res = await settlementAdminApi.checkCounterpartyBalance({
        search, mismatch_only: mismatchOnly, page: 1, page_size: 100,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res.data as any)?.data ?? res.data;
      setBalanceData(data.items || []);
      setBalanceTotal(data.total || 0);
    } catch {
      enqueueSnackbar('거래처 잔액 조회 실패', { variant: 'error' });
    } finally {
      setBalanceLoading(false);
    }
  }, [search, mismatchOnly, enqueueSnackbar]);

  useEffect(() => { runCheck(); }, [runCheck]);
  useEffect(() => { if (tab === 1) loadBalance(); }, [tab, loadBalance]);

  // 자동 수정 핸들러
  const handleFix = async (type: FixType) => {
    setFixing(true);
    try {
      if (type === 'allocations') {
        const res = await settlementAdminApi.recalculateAllocations({ all_mismatched: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (res.data as any)?.data ?? res.data;
        enqueueSnackbar(`배분 합계 재계산 완료: ${data.fixed_count}건 수정`, { variant: 'success' });
      } else {
        const res = await settlementAdminApi.recalculateVoucherBalances({ all_over_allocated: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (res.data as any)?.data ?? res.data;
        enqueueSnackbar(`전표 상태 재계산 완료: ${data.fixed_count}건 수정`, { variant: 'success' });
      }
      await runCheck();
    } catch {
      enqueueSnackbar('자동 수정 실패', { variant: 'error' });
    } finally {
      setFixing(false);
    }
  };

  // 잔액 조정 핸들러
  const openAdjustDialog = (cp: { id: string; name: string }) => {
    setAdjustTarget(cp);
    setAdjustType('INCREASE');
    setAdjustVoucherType('SALES');
    setAdjustAmount('');
    setAdjustDesc('');
    setAdjustOpen(true);
  };

  const handleAdjust = async () => {
    if (!adjustTarget || !adjustAmount || !adjustDesc) {
      enqueueSnackbar('모든 필드를 입력하세요', { variant: 'warning' });
      return;
    }
    setAdjustLoading(true);
    try {
      await settlementAdminApi.adjustCounterpartyBalance({
        counterparty_id: adjustTarget.id,
        adjustment_type: adjustType,
        amount: parseFloat(adjustAmount),
        voucher_type: adjustVoucherType,
        description: adjustDesc,
      });
      enqueueSnackbar(`${adjustTarget.name} 잔액 조정 완료`, { variant: 'success' });
      setAdjustOpen(false);
      await loadBalance();
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail || '잔액 조정 실패';
      enqueueSnackbar(detail, { variant: 'error' });
    } finally {
      setAdjustLoading(false);
    }
  };

  const c = theme.palette;
  const fmt = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? v : n.toLocaleString('ko-KR');
  };

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<VerifiedIcon />}
        title="데이터 정합성 점검"
        description="전표-입출금-배분-상계 데이터의 일관성을 검증합니다"
        color="info"
        chips={integrity ? [
          <Chip
            key="status"
            label={integrity.is_consistent ? '전체 정상' : '불일치 발견'}
            size="small"
            color={integrity.is_consistent ? 'success' : 'error'}
            sx={{ fontWeight: 700 }}
          />,
        ] : []}
        actions={[{ label: '전체 점검', onClick: runCheck, icon: <PlayArrowIcon /> }]}
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, '& .MuiTab-root': { fontWeight: 700, fontSize: '0.85rem' } }}>
        <Tab label="3대 정합성 검증" />
        <Tab label="거래처 잔액 교차 검증" />
      </Tabs>

      {/* --- Tab 0: 3대 검증 --- */}
      {tab === 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          <IntegrityCard
            title="입출금-배분 정합성"
            description="allocated_amount가 배분 합계와 일치하는지 검증"
            result={integrity?.transaction_allocation}
            loading={checkLoading}
            fixType="allocations"
            onFix={handleFix}
            fixing={fixing}
          />
          <IntegrityCard
            title="전표 잔액 정합성"
            description="전표 금액 대비 초과 배분 여부 검증"
            result={integrity?.voucher_balance}
            loading={checkLoading}
            fixType="voucher-balances"
            onFix={handleFix}
            fixing={fixing}
          />
          <IntegrityCard
            title="상계 정합성"
            description="상계 매출/매입 전표 합계 일치 검증"
            result={integrity?.netting_balance}
            loading={checkLoading}
          />
        </Box>
      )}

      {/* --- Tab 1: 거래처 잔액 --- */}
      {tab === 1 && (
        <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          {/* 필터 */}
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField
                size="small"
                placeholder="거래처명 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadBalance()}
                InputProps={{ startAdornment: <SearchIcon sx={{ mr: 0.5, fontSize: 18, color: 'text.disabled' }} /> }}
                sx={{ width: 240 }}
              />
              <FormControlLabel
                control={<Switch size="small" checked={mismatchOnly} onChange={(_, v) => setMismatchOnly(v)} />}
                label={<Typography variant="caption" fontWeight={600}>불일치만</Typography>}
              />
              <Button size="small" variant="outlined" onClick={loadBalance}>조회</Button>
              <Chip label={`${balanceTotal}건`} size="small" color="info" sx={{ fontWeight: 700 }} />
            </Stack>
          </Box>

          {/* 테이블 */}
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap', bgcolor: alpha(c.info.main, 0.04) } }}>
                  <TableCell>거래처</TableCell>
                  <TableCell align="right">판매 합계</TableCell>
                  <TableCell align="right">매입 합계</TableCell>
                  <TableCell align="right">입금 합계</TableCell>
                  <TableCell align="right">출금 합계</TableCell>
                  <TableCell align="right">배분 합계</TableCell>
                  <TableCell align="right">판매 잔액</TableCell>
                  <TableCell align="right">매입 잔액</TableCell>
                  <TableCell align="center">조정</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {balanceLoading ? (
                  <TableRow><TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>로딩 중...</TableCell></TableRow>
                ) : balanceData.length === 0 ? (
                  <TableRow><TableCell colSpan={9} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>데이터 없음</TableCell></TableRow>
                ) : balanceData.map((row) => {
                  const hasMismatch = parseFloat(row.sales_balance) !== 0 || parseFloat(row.purchase_balance) !== 0;
                  return (
                    <TableRow key={row.id} sx={{
                      bgcolor: hasMismatch ? alpha(c.error.main, 0.04) : 'transparent',
                      '& td': { fontSize: '0.78rem', fontFeatureSettings: '"tnum" on' },
                    }}>
                      <TableCell sx={{ fontWeight: 600 }}>
                        <MuiLink
                          href={`/settlement/counterparties/${row.id}`}
                          sx={{ color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline', color: 'primary.main' } }}
                        >
                          {row.name}
                        </MuiLink>
                      </TableCell>
                      <TableCell align="right">{fmt(row.sales_total)}</TableCell>
                      <TableCell align="right">{fmt(row.purchase_total)}</TableCell>
                      <TableCell align="right">{fmt(row.deposit_total)}</TableCell>
                      <TableCell align="right">{fmt(row.withdrawal_total)}</TableCell>
                      <TableCell align="right">{fmt(row.allocated_total)}</TableCell>
                      <TableCell align="right" sx={{ color: parseFloat(row.sales_balance) !== 0 ? 'error.main' : 'text.primary', fontWeight: 700 }}>
                        {fmt(row.sales_balance)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: parseFloat(row.purchase_balance) !== 0 ? 'error.main' : 'text.primary', fontWeight: 700 }}>
                        {fmt(row.purchase_balance)}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant="text"
                          color="warning"
                          onClick={() => openAdjustDialog({ id: row.id, name: row.name })}
                          sx={{ fontSize: '0.65rem', py: 0, px: 0.5, minWidth: 0 }}
                        >
                          <AdjustIcon sx={{ fontSize: 16 }} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}

      {/* 잔액 조정 다이얼로그 */}
      <Dialog open={adjustOpen} onClose={() => !adjustLoading && setAdjustOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          잔액 조정 — {adjustTarget?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>전표 유형</InputLabel>
              <Select
                value={adjustVoucherType}
                label="전표 유형"
                onChange={(e) => setAdjustVoucherType(e.target.value as 'SALES' | 'PURCHASE')}
              >
                <MenuItem value="SALES">판매 (매출)</MenuItem>
                <MenuItem value="PURCHASE">매입</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>조정 유형</InputLabel>
              <Select
                value={adjustType}
                label="조정 유형"
                onChange={(e) => setAdjustType(e.target.value as 'INCREASE' | 'DECREASE')}
              >
                <MenuItem value="INCREASE">잔액 증가 (입금/출금 추가)</MenuItem>
                <MenuItem value="DECREASE">잔액 감소 (입금/출금 차감)</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="금액"
              type="number"
              size="small"
              fullWidth
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              inputProps={{ min: 0 }}
            />
            <TextField
              label="사유 (필수)"
              size="small"
              fullWidth
              value={adjustDesc}
              onChange={(e) => setAdjustDesc(e.target.value)}
              placeholder="잔액 조정 사유를 입력하세요"
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAdjustOpen(false)} disabled={adjustLoading}>취소</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleAdjust}
            disabled={adjustLoading || !adjustAmount || !adjustDesc}
          >
            {adjustLoading ? '처리 중...' : '조정 실행'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
