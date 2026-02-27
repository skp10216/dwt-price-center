'use client';

import { Box, Typography, Skeleton, alpha, useTheme } from '@mui/material';
import {
  ArrowDownward as DepositIcon,
  ArrowUpward as WithdrawalIcon,
  AccountBalance as BalanceIcon,
  ErrorOutline as UnallocIcon,
} from '@mui/icons-material';

export interface TimelineSummaryData {
  totalDeposits: number;
  totalWithdrawals: number;
  depositCount: number;
  withdrawalCount: number;
  unallocatedDeposits: number;
  unallocatedWithdrawals: number;
}

interface TimelineSummaryStripProps {
  data: TimelineSummaryData | null;
  loading?: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

function MetricBlock({
  icon,
  label,
  value,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  count?: number;
  color: string;
}) {
  const theme = useTheme();
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
      borderRadius: 2, bgcolor: alpha(theme.palette[color as 'info'].main, 0.06),
      border: '1px solid', borderColor: alpha(theme.palette[color as 'info'].main, 0.12),
      minWidth: 0, flex: 1,
    }}>
      <Box sx={{
        width: 32, height: 32, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        bgcolor: alpha(theme.palette[color as 'info'].main, 0.12),
      }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography variant="subtitle2" fontWeight={700} color={`${color}.main`} noWrap>
            {fmt(value)}
          </Typography>
          {count !== undefined && (
            <Typography variant="caption" color="text.disabled">
              ({count}건)
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function TimelineSummaryStrip({ data, loading }: TimelineSummaryStripProps) {
  if (loading || !data) {
    return (
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ flex: 1, minWidth: 160 }} />
        ))}
      </Box>
    );
  }

  const netBalance = data.totalDeposits - data.totalWithdrawals;

  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
      <MetricBlock
        icon={<DepositIcon sx={{ fontSize: 18, color: 'info.main' }} />}
        label="총 입금"
        value={data.totalDeposits}
        count={data.depositCount}
        color="info"
      />
      <MetricBlock
        icon={<WithdrawalIcon sx={{ fontSize: 18, color: 'error.main' }} />}
        label="총 출금"
        value={data.totalWithdrawals}
        count={data.withdrawalCount}
        color="error"
      />
      <MetricBlock
        icon={<BalanceIcon sx={{ fontSize: 18, color: netBalance >= 0 ? 'success.main' : 'warning.main' }} />}
        label="순잔액"
        value={Math.abs(netBalance)}
        color={netBalance >= 0 ? 'success' : 'warning'}
      />
      <MetricBlock
        icon={<UnallocIcon sx={{ fontSize: 18, color: 'warning.main' }} />}
        label="미배분"
        value={data.unallocatedDeposits + data.unallocatedWithdrawals}
        color="warning"
      />
    </Box>
  );
}
