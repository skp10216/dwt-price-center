'use client';

import {
  Box, Typography, Chip, LinearProgress, Button,
  Skeleton, alpha,
} from '@mui/material';
import {
  ArrowDownward as DepositIcon,
  ArrowUpward as WithdrawalIcon,
} from '@mui/icons-material';
import { useCashEvent, type TransactionRow } from './CashEventProvider';
import { STATUS_LABELS, SOURCE_LABELS, formatAmount } from './constants';

// ─── 날짜 그룹핑 ──────────────────────────────────────────────

interface DateGroup {
  date: string;
  label: string;
  depositSum: number;
  withdrawalSum: number;
  depositCount: number;
  withdrawalCount: number;
  items: TransactionRow[];
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function groupByDate(txns: TransactionRow[]): DateGroup[] {
  const map = new Map<string, DateGroup>();

  for (const t of txns) {
    const dateKey = t.transaction_date;
    if (!map.has(dateKey)) {
      const d = new Date(dateKey);
      map.set(dateKey, {
        date: dateKey,
        label: `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAYS[d.getDay()]}`,
        depositSum: 0,
        withdrawalSum: 0,
        depositCount: 0,
        withdrawalCount: 0,
        items: [],
      });
    }
    const group = map.get(dateKey)!;
    group.items.push(t);
    if (t.transaction_type === 'deposit') {
      group.depositSum += t.amount;
      group.depositCount++;
    } else {
      group.withdrawalSum += t.amount;
      group.withdrawalCount++;
    }
  }

  const groups = Array.from(map.values());
  for (const g of groups) {
    g.items.sort((a: TransactionRow, b: TransactionRow) => b.created_at.localeCompare(a.created_at));
  }

  return groups.sort((a: DateGroup, b: DateGroup) => b.date.localeCompare(a.date));
}

// ─── 타임라인 카드 ──────────────────────────────────────────────

function TimelineCard({ txn, onClick }: { txn: TransactionRow; onClick: () => void }) {
  const statusInfo = STATUS_LABELS[txn.status];
  const sourceLabel = SOURCE_LABELS[txn.source] || txn.source;
  const isDeposit = txn.transaction_type === 'deposit';
  const allocPct = txn.amount > 0 ? Math.min(100, (txn.allocated_amount / txn.amount) * 100) : 0;
  const isHold = txn.status === 'on_hold';
  const isHidden = txn.status === 'hidden';

  const accentColor = isDeposit ? 'info.main' : 'error.main';

  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        gap: 0,
        cursor: 'pointer',
        opacity: isHidden ? 0.45 : 1,
      }}
    >
      {/* 좌측: 수직 타임라인 연결선 + 아이콘 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, flexShrink: 0 }}>
        <Box sx={{ width: 2, flex: 1, bgcolor: 'divider' }} />
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: (theme) => alpha(isDeposit ? theme.palette.info.main : theme.palette.error.main, 0.12),
            border: '2px solid',
            borderColor: accentColor,
            flexShrink: 0,
            my: 0.25,
          }}
        >
          {isDeposit
            ? <DepositIcon sx={{ fontSize: 16, color: accentColor }} />
            : <WithdrawalIcon sx={{ fontSize: 16, color: accentColor }} />
          }
        </Box>
        <Box sx={{ width: 2, flex: 1, bgcolor: 'divider' }} />
      </Box>

      {/* 우측: 카드 본문 */}
      <Box
        sx={{
          flex: 1,
          ml: 1,
          my: 0.5,
          p: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: isHold ? 'warning.300' : 'divider',
          bgcolor: isHold ? 'warning.50' : 'background.paper',
          transition: 'all 0.15s',
          '&:hover': {
            borderColor: accentColor,
            boxShadow: (theme) => `0 2px 8px ${alpha(
              isDeposit ? theme.palette.info.main : theme.palette.error.main, 0.15
            )}`,
          },
        }}
      >
        {/* 1행: 거래처 + 금액 */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={700} noWrap>
              {txn.counterparty_name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {txn.memo || sourceLabel}
              {txn.memo && <> &middot; {sourceLabel}</>}
            </Typography>
          </Box>
          <Typography
            variant="h6"
            fontWeight={800}
            color={accentColor}
            sx={{ whiteSpace: 'nowrap', lineHeight: 1.2 }}
          >
            {isDeposit ? '+' : '-'}{formatAmount(txn.amount)}
          </Typography>
        </Box>

        {/* 2행: 상태 + 미배분 + 진행률 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Chip
            label={statusInfo?.label ?? txn.status}
            color={statusInfo?.color ?? 'default'}
            size="small"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
          {txn.unallocated_amount > 0 && (
            <Typography variant="caption" color="error.main" fontWeight={600}>
              미배분 {formatAmount(txn.unallocated_amount)}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          {(txn.status === 'partial' || txn.status === 'allocated') && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: 80 }}>
              <LinearProgress
                variant="determinate"
                value={allocPct}
                sx={{ flex: 1, height: 4, borderRadius: 2 }}
                color={allocPct >= 100 ? 'success' : 'primary'}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                {Math.round(allocPct)}%
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ─── 날짜 헤더 ──────────────────────────────────────────────────

function DateHeader({ group }: { group: DateGroup }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {/* 좌측 타임라인 도트 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, flexShrink: 0 }}>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: 'text.primary',
            border: '3px solid',
            borderColor: 'background.paper',
            boxShadow: 1,
          }}
        />
      </Box>

      {/* 우측 날짜 + 요약 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, ml: 1, py: 1 }}>
        <Typography variant="subtitle2" fontWeight={800} color="text.primary">
          {group.label}
        </Typography>
        <Box sx={{ flex: 1, borderBottom: '1px dashed', borderColor: 'divider' }} />
        {group.depositCount > 0 && (
          <Chip
            icon={<DepositIcon sx={{ fontSize: '14px !important' }} />}
            label={`+${formatAmount(group.depositSum)}`}
            size="small"
            color="info"
            variant="outlined"
            sx={{ height: 24, fontSize: '0.75rem', fontWeight: 700 }}
          />
        )}
        {group.withdrawalCount > 0 && (
          <Chip
            icon={<WithdrawalIcon sx={{ fontSize: '14px !important' }} />}
            label={`-${formatAmount(group.withdrawalSum)}`}
            size="small"
            color="error"
            variant="outlined"
            sx={{ height: 24, fontSize: '0.75rem', fontWeight: 700 }}
          />
        )}
      </Box>
    </Box>
  );
}

// ─── 메인 ──────────────────────────────────────────────────────

export default function CashEventTimelineView() {
  const { transactions, total, loading, page, setPage, setDetailId } = useCashEvent();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>
        {[1, 2, 3].map((i) => (
          <Box key={i}>
            <Skeleton width={160} height={28} />
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Skeleton variant="circular" width={28} height={28} />
              <Skeleton variant="rounded" height={72} sx={{ flex: 1 }} />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Skeleton variant="circular" width={28} height={28} />
              <Skeleton variant="rounded" height={72} sx={{ flex: 1 }} />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  const groups = groupByDate(transactions);
  const shown = transactions.length;
  const remaining = total - shown;

  if (groups.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Typography color="text.secondary">입출금 내역이 없습니다.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flex: 1, py: 1, px: 0.5 }}>
      {groups.map((group) => (
        <Box key={group.date}>
          <DateHeader group={group} />
          {group.items.map((txn) => (
            <TimelineCard
              key={txn.id}
              txn={txn}
              onClick={() => setDetailId(txn.id)}
            />
          ))}
        </Box>
      ))}

      {/* 더 보기 */}
      {remaining > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <Button variant="outlined" size="small" onClick={() => setPage(page + 1)}>
            더 보기 ({remaining.toLocaleString()}건 남음)
          </Button>
        </Box>
      )}
    </Box>
  );
}
