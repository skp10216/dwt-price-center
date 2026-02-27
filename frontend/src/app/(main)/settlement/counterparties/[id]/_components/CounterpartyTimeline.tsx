'use client';

import { useMemo } from 'react';
import {
  Box, Typography, Chip, LinearProgress, Button,
  Skeleton, alpha, useTheme,
} from '@mui/material';
import Timeline from '@mui/lab/Timeline';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent';
import {
  ArrowDownward as DepositIcon,
  ArrowUpward as WithdrawalIcon,
  CalendarToday as DateIcon,
  PauseCircleOutline as HoldIcon,
  VisibilityOff as HiddenIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';

export interface TransactionItem {
  id: string;
  transaction_type: 'deposit' | 'withdrawal';
  transaction_date: string;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  source: string;
  status: string;
  memo: string | null;
  counterparty_name?: string;
  bank_reference?: string | null;
  created_at?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: 'error' | 'warning' | 'success' | 'default' | 'info' }> = {
  pending: { label: '미배분', color: 'error' },
  partial: { label: '부분배분', color: 'warning' },
  allocated: { label: '전액배분', color: 'success' },
  on_hold: { label: '보류', color: 'warning' },
  hidden: { label: '숨김', color: 'default' },
  cancelled: { label: '취소', color: 'default' },
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: '수동', manual: '수동',
  BANK_IMPORT: '은행', bank_import: '은행',
  NETTING: '상계', netting: '상계',
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

interface DateGroup {
  date: string;
  label: string;
  fullLabel: string;
  depositSum: number;
  withdrawalSum: number;
  items: TransactionItem[];
}

function groupByDate(txns: TransactionItem[]): DateGroup[] {
  const map = new Map<string, DateGroup>();
  for (const t of txns) {
    const dateKey = t.transaction_date;
    if (!map.has(dateKey)) {
      const d = new Date(dateKey);
      map.set(dateKey, {
        date: dateKey,
        label: `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`,
        fullLabel: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${WEEKDAYS[d.getDay()]}요일`,
        depositSum: 0, withdrawalSum: 0, items: [],
      });
    }
    const group = map.get(dateKey)!;
    group.items.push(t);
    if (t.transaction_type === 'deposit') group.depositSum += t.amount;
    else group.withdrawalSum += t.amount;
  }
  const groups = Array.from(map.values());
  return groups.sort((a, b) => b.date.localeCompare(a.date));
}

function TransactionTimelineCard({
  txn, onClick,
}: { txn: TransactionItem; onClick: () => void }) {
  const theme = useTheme();
  const isDeposit = txn.transaction_type === 'deposit';
  const statusInfo = STATUS_LABELS[txn.status];
  const sourceLabel = SOURCE_LABELS[txn.source] || txn.source;
  const allocPct = txn.amount > 0 ? Math.min(100, (txn.allocated_amount / txn.amount) * 100) : 0;
  const isHold = txn.status === 'on_hold';
  const isHidden = txn.status === 'hidden';
  const isCancelled = txn.status === 'cancelled';
  const accentColor = isDeposit ? theme.palette.info.main : theme.palette.error.main;

  return (
    <Box
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: isHold ? 'warning.300' : 'divider',
        bgcolor: isHold ? alpha(theme.palette.warning.main, 0.04) : 'background.paper',
        opacity: isCancelled || isHidden ? 0.5 : 1,
        textDecoration: isCancelled ? 'line-through' : 'none',
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: isDeposit ? 'info.main' : 'error.main',
          boxShadow: `0 2px 12px ${alpha(accentColor, 0.15)}`,
          transform: 'translateY(-1px)',
        },
      }}
    >
      {/* 1행: 유형 + 금액 */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            label={isDeposit ? '입금' : '출금'}
            size="small"
            variant="outlined"
            color={isDeposit ? 'info' : 'error'}
            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
          />
          <Chip
            label={sourceLabel}
            size="small"
            variant="outlined"
            sx={{ height: 22, fontSize: '0.65rem' }}
          />
        </Box>
        <Typography
          variant="subtitle1"
          fontWeight={800}
          sx={{ color: accentColor, whiteSpace: 'nowrap', lineHeight: 1.2 }}
        >
          {isDeposit ? '+' : '-'}{fmt(txn.amount)}
        </Typography>
      </Box>

      {/* 2행: 메모 */}
      {txn.memo && (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.75 }}>
          {txn.memo}
        </Typography>
      )}

      {/* 3행: 상태 + 배분 진행률 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <Chip
          label={statusInfo?.label ?? txn.status}
          color={statusInfo?.color ?? 'default'}
          size="small"
          sx={{ height: 20, fontSize: '0.65rem' }}
        />
        {txn.unallocated_amount > 0 && !isCancelled && (
          <Typography variant="caption" color="error.main" fontWeight={600} sx={{ fontSize: '0.7rem' }}>
            미배분 {fmt(txn.unallocated_amount)}
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
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
              {Math.round(allocPct)}%
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function getDotProps(txn: TransactionItem) {
  const isDeposit = txn.transaction_type === 'deposit';
  const { status } = txn;

  if (status === 'cancelled') return { color: 'grey' as const, variant: 'outlined' as const, icon: <CancelIcon sx={{ fontSize: 16 }} /> };
  if (status === 'on_hold') return { color: 'warning' as const, variant: 'outlined' as const, icon: <HoldIcon sx={{ fontSize: 16 }} /> };
  if (status === 'hidden') return { color: 'grey' as const, variant: 'outlined' as const, icon: <HiddenIcon sx={{ fontSize: 16 }} /> };
  if (status === 'allocated') {
    return {
      color: (isDeposit ? 'info' : 'error') as 'info' | 'error',
      variant: 'filled' as const,
      icon: isDeposit ? <DepositIcon sx={{ fontSize: 16 }} /> : <WithdrawalIcon sx={{ fontSize: 16 }} />,
    };
  }
  return {
    color: (isDeposit ? 'info' : 'error') as 'info' | 'error',
    variant: (status === 'pending' ? 'outlined' : 'filled') as 'outlined' | 'filled',
    icon: isDeposit ? <DepositIcon sx={{ fontSize: 16 }} /> : <WithdrawalIcon sx={{ fontSize: 16 }} />,
  };
}

interface CounterpartyTimelineProps {
  transactions: TransactionItem[];
  total: number;
  loading: boolean;
  onLoadMore?: () => void;
  onItemClick: (id: string) => void;
}

export default function CounterpartyTimeline({
  transactions, total, loading, onLoadMore, onItemClick,
}: CounterpartyTimelineProps) {
  const theme = useTheme();
  const groups = useMemo(() => groupByDate(transactions), [transactions]);
  const remaining = total - transactions.length;

  if (loading && transactions.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
        {[1, 2, 3].map((i) => (
          <Box key={i} sx={{ display: 'flex', gap: 2 }}>
            <Skeleton width={80} height={20} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="rounded" height={80} />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  if (groups.length === 0) {
    return (
      <Box sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: 240, gap: 1,
      }}>
        <Box sx={{
          width: 56, height: 56, borderRadius: '50%',
          bgcolor: alpha(theme.palette.text.disabled, 0.08),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DateIcon sx={{ fontSize: 28, color: 'text.disabled' }} />
        </Box>
        <Typography color="text.secondary" fontWeight={500}>
          입출금 내역이 없습니다
        </Typography>
        <Typography variant="caption" color="text.disabled">
          필터 조건을 변경해 보세요
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {groups.map((group, groupIdx) => (
        <Box key={group.date}>
          {/* 날짜 구분 헤더 */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5,
            px: 1, pt: groupIdx === 0 ? 1 : 2.5, pb: 0.5,
          }}>
            <Box sx={{
              width: 8, height: 8, borderRadius: '50%',
              bgcolor: 'text.primary', flexShrink: 0,
            }} />
            <Typography variant="subtitle2" fontWeight={800} color="text.primary">
              {group.fullLabel}
            </Typography>
            <Box sx={{ flex: 1, borderBottom: '1px dashed', borderColor: 'divider' }} />
            {group.depositSum > 0 && (
              <Chip
                icon={<DepositIcon sx={{ fontSize: '14px !important' }} />}
                label={`+${fmt(group.depositSum)}`}
                size="small" color="info" variant="outlined"
                sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
              />
            )}
            {group.withdrawalSum > 0 && (
              <Chip
                icon={<WithdrawalIcon sx={{ fontSize: '14px !important' }} />}
                label={`-${fmt(group.withdrawalSum)}`}
                size="small" color="error" variant="outlined"
                sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
              />
            )}
          </Box>

          {/* MUI Timeline 항목들 */}
          <Timeline
            sx={{
              p: 0, m: 0,
              '& .MuiTimelineItem-root:before': { flex: 0, padding: 0 },
              [`& .MuiTimelineOppositeContent-root`]: {
                flex: '0 0 70px', py: 1, px: 0.5,
              },
            }}
          >
            {group.items.map((txn, idx) => {
              const dotProps = getDotProps(txn);
              const createdTime = txn.created_at
                ? new Date(txn.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <TimelineItem key={txn.id}>
                  <TimelineOppositeContent sx={{ textAlign: 'right', pt: 2 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      {createdTime}
                    </Typography>
                  </TimelineOppositeContent>

                  <TimelineSeparator>
                    <TimelineConnector sx={{
                      bgcolor: idx === 0 ? 'transparent' : 'divider',
                    }} />
                    <TimelineDot
                      color={dotProps.color}
                      variant={dotProps.variant}
                      sx={{
                        m: 0, p: 0.5,
                        boxShadow: dotProps.variant === 'filled'
                          ? `0 0 0 4px ${alpha(theme.palette[dotProps.color].main, 0.15)}`
                          : 'none',
                      }}
                    >
                      {dotProps.icon}
                    </TimelineDot>
                    <TimelineConnector sx={{
                      bgcolor: idx === group.items.length - 1 ? 'transparent' : 'divider',
                    }} />
                  </TimelineSeparator>

                  <TimelineContent sx={{ py: 0.75, px: 1.5 }}>
                    <TransactionTimelineCard
                      txn={txn}
                      onClick={() => onItemClick(txn.id)}
                    />
                  </TimelineContent>
                </TimelineItem>
              );
            })}
          </Timeline>
        </Box>
      ))}

      {/* 더 보기 */}
      {remaining > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2.5 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={onLoadMore}
            disabled={loading}
            sx={{ borderRadius: 5, px: 3 }}
          >
            {loading ? '불러오는 중...' : `더 보기 (${remaining.toLocaleString()}건 남음)`}
          </Button>
        </Box>
      )}
    </Box>
  );
}
