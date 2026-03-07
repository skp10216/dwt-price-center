'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Skeleton, Chip, Button,
  TextField, FormControlLabel, Switch, useTheme,
  Table, TableHead, TableBody, TableRow, TableCell,
  Tabs, Tab,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import VerifiedIcon from '@mui/icons-material/Verified';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import { AppPageContainer, AppPageHeader } from '@/components/ui';
import { settlementAdminApi } from '@/lib/api';

// --- 검증 결과 카드 ---
interface CheckResult {
  total_checked: number;
  is_consistent: boolean;
  mismatches?: { transaction_id: string; stored: string; actual: string }[];
  over_allocated?: { voucher_id: string; total_amount: string; allocated: string; balance: string }[];
}

function IntegrityCard({ title, description, result, loading }: {
  title: string; description: string; result: CheckResult | null; loading: boolean;
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

        {/* 불일치 상세 (최대 5건) */}
        {!isOk && result?.mismatches && result.mismatches.length > 0 && (
          <Box sx={{ mt: 1, p: 1.5, bgcolor: alpha(color, 0.04), borderRadius: 2 }}>
            <Typography variant="caption" fontWeight={700} color="error" sx={{ mb: 0.5, display: 'block' }}>
              불일치 항목 (상위 {Math.min(result.mismatches.length, 5)}건)
            </Typography>
            {result.mismatches.slice(0, 5).map((m, i) => (
              <Typography key={i} variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                ID: {m.transaction_id.slice(0, 8)}... | 저장: {m.stored} | 실제: {m.actual}
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
                전표: {m.voucher_id.slice(0, 8)}... | 금액: {m.total_amount} | 배분: {m.allocated} | 잔액: {m.balance}
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [integrity, setIntegrity] = useState<any>(null);

  // 거래처 잔액
  const [balanceLoading, setBalanceLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [balanceData, setBalanceData] = useState<any[]>([]);
  const [balanceTotal, setBalanceTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const runCheck = useCallback(async () => {
    setCheckLoading(true);
    try {
      const res = await settlementAdminApi.checkIntegrity();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          />
          <IntegrityCard
            title="전표 잔액 정합성"
            description="전표 금액 대비 초과 배분 여부 검증"
            result={integrity?.voucher_balance}
            loading={checkLoading}
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
                </TableRow>
              </TableHead>
              <TableBody>
                {balanceLoading ? (
                  <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>로딩 중...</TableCell></TableRow>
                ) : balanceData.length === 0 ? (
                  <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>데이터 없음</TableCell></TableRow>
                ) : balanceData.map((row) => {
                  const hasMismatch = parseFloat(row.sales_balance) !== 0 || parseFloat(row.purchase_balance) !== 0;
                  return (
                    <TableRow key={row.id} sx={{
                      bgcolor: hasMismatch ? alpha(c.error.main, 0.04) : 'transparent',
                      '& td': { fontSize: '0.78rem', fontFeatureSettings: '"tnum" on' },
                    }}>
                      <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}
    </AppPageContainer>
  );
}
