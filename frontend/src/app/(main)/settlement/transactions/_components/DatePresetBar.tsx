'use client';

import {
  Box, TextField, ToggleButton, ToggleButtonGroup,
  IconButton, Typography,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import { useCashEvent, getDateRange } from './CashEventProvider';

const DATE_PRESETS = [
  { value: 'all', label: '전체' },
  { value: 'today', label: '오늘' },
  { value: 'week', label: '7일' },
  { value: 'thisMonth', label: '이번달' },
  { value: 'lastMonth', label: '지난달' },
  { value: 'custom', label: '커스텀' },
] as const;

export default function DatePresetBar() {
  const { filters, setFilter, setFilters } = useCashEvent();

  const handlePreset = (preset: string) => {
    const range = getDateRange(preset);
    if (range) {
      setFilters({ datePreset: preset, dateFrom: range.from, dateTo: range.to });
    } else if (preset === 'all') {
      setFilters({ datePreset: 'all', dateFrom: '', dateTo: '' });
    } else {
      setFilter('datePreset', preset);
    }
  };

  // 월 단위 이동 (이번달/지난달 프리셋일 때)
  const handleMonthNav = (delta: number) => {
    const baseDate = filters.dateFrom ? new Date(filters.dateFrom) : new Date();
    const newMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + delta, 1);
    const endOfMonth = new Date(newMonth.getFullYear(), newMonth.getMonth() + 1, 0);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    setFilters({
      datePreset: 'custom',
      dateFrom: fmt(newMonth),
      dateTo: fmt(endOfMonth),
    });
  };

  // 현재 기간 라벨
  const periodLabel = (() => {
    if (filters.dateFrom && filters.dateTo) {
      const from = new Date(filters.dateFrom);
      const to = new Date(filters.dateTo);
      if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
        return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
      }
      return `${filters.dateFrom} ~ ${filters.dateTo}`;
    }
    return null;
  })();

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <ToggleButtonGroup
        value={filters.datePreset}
        exclusive
        onChange={(_, v) => v && handlePreset(v)}
        size="small"
      >
        {DATE_PRESETS.map((p) => (
          <ToggleButton
            key={p.value}
            value={p.value}
            sx={{ px: 1.5, py: 0.5, textTransform: 'none', fontSize: '0.8125rem' }}
          >
            {p.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* 월 네비게이션 */}
      {filters.dateFrom && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton size="small" onClick={() => handleMonthNav(-1)}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center', fontWeight: 500 }}>
            {periodLabel}
          </Typography>
          <IconButton size="small" onClick={() => handleMonthNav(1)}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
          <CalendarIcon fontSize="small" color="action" />
        </Box>
      )}

      {/* 커스텀 날짜 입력 */}
      {filters.datePreset === 'custom' && (
        <>
          <TextField
            size="small"
            type="date"
            label="시작일"
            value={filters.dateFrom}
            onChange={(e) => setFilter('dateFrom', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <TextField
            size="small"
            type="date"
            label="종료일"
            value={filters.dateTo}
            onChange={(e) => setFilter('dateTo', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
        </>
      )}
    </Box>
  );
}
