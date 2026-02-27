'use client';

import { useState } from 'react';
import {
  Box, Chip, TextField, InputAdornment, ToggleButton, ToggleButtonGroup,
  Collapse, IconButton, Tooltip, alpha, useTheme,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  ArrowDownward as DepositIcon,
  ArrowUpward as WithdrawalIcon,
  SwapHoriz as AllIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import { subDays, subMonths, subYears, format } from 'date-fns';

export interface TimelineFilters {
  dateFrom: string;
  dateTo: string;
  transactionType: 'all' | 'deposit' | 'withdrawal';
  statuses: string[];
  search: string;
}

interface PeriodPreset {
  key: string;
  label: string;
  getRange: () => { from: string; to: string };
}

const PERIOD_PRESETS: PeriodPreset[] = [
  { key: '7d', label: '7일', getRange: () => ({ from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { key: '1m', label: '1개월', getRange: () => ({ from: format(subMonths(new Date(), 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { key: '3m', label: '3개월', getRange: () => ({ from: format(subMonths(new Date(), 3), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { key: '6m', label: '6개월', getRange: () => ({ from: format(subMonths(new Date(), 6), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { key: '1y', label: '1년', getRange: () => ({ from: format(subYears(new Date(), 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { key: 'all', label: '전체', getRange: () => ({ from: '', to: '' }) },
];

const STATUS_OPTIONS = [
  { key: 'pending', label: '미배분', color: 'error' as const },
  { key: 'partial', label: '부분배분', color: 'warning' as const },
  { key: 'allocated', label: '전액배분', color: 'success' as const },
  { key: 'on_hold', label: '보류', color: 'warning' as const },
  { key: 'cancelled', label: '취소', color: 'default' as const },
];

interface TimelineFilterBarProps {
  filters: TimelineFilters;
  onChange: (filters: TimelineFilters) => void;
}

export default function TimelineFilterBar({ filters, onChange }: TimelineFilterBarProps) {
  const theme = useTheme();
  const [activePeriod, setActivePeriod] = useState('3m');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handlePeriodChange = (key: string) => {
    setActivePeriod(key);
    const preset = PERIOD_PRESETS.find((p) => p.key === key);
    if (preset) {
      const range = preset.getRange();
      onChange({ ...filters, dateFrom: range.from, dateTo: range.to });
    }
  };

  const handleTypeChange = (_: unknown, val: string | null) => {
    if (val) onChange({ ...filters, transactionType: val as TimelineFilters['transactionType'] });
  };

  const handleStatusToggle = (status: string) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: next });
  };

  const handleDateChange = (field: 'dateFrom' | 'dateTo', value: string) => {
    setActivePeriod('custom');
    onChange({ ...filters, [field]: value });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* 1행: 기간 프리셋 + 유형 필터 + 검색 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {/* 기간 프리셋 */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {PERIOD_PRESETS.map((preset) => (
            <Chip
              key={preset.key}
              label={preset.label}
              size="small"
              variant={activePeriod === preset.key ? 'filled' : 'outlined'}
              color={activePeriod === preset.key ? 'primary' : 'default'}
              onClick={() => handlePeriodChange(preset.key)}
              sx={{
                fontWeight: activePeriod === preset.key ? 700 : 500,
                transition: 'all 0.15s',
              }}
            />
          ))}
        </Box>

        <Box sx={{ flex: 1, minWidth: 40 }} />

        {/* 유형 필터 */}
        <ToggleButtonGroup
          value={filters.transactionType}
          exclusive
          onChange={handleTypeChange}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              px: 1.5, py: 0.25, fontSize: '0.75rem', fontWeight: 600,
              textTransform: 'none',
            },
          }}
        >
          <ToggleButton value="all"><AllIcon sx={{ fontSize: 16, mr: 0.5 }} />전체</ToggleButton>
          <ToggleButton value="deposit"><DepositIcon sx={{ fontSize: 16, mr: 0.5, color: 'info.main' }} />입금</ToggleButton>
          <ToggleButton value="withdrawal"><WithdrawalIcon sx={{ fontSize: 16, mr: 0.5, color: 'error.main' }} />출금</ToggleButton>
        </ToggleButtonGroup>

        {/* 고급 필터 토글 */}
        <Tooltip title="상세 필터">
          <IconButton
            size="small"
            onClick={() => setShowAdvanced(!showAdvanced)}
            sx={{
              bgcolor: showAdvanced ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
              color: showAdvanced ? 'primary.main' : 'text.secondary',
            }}
          >
            <FilterIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* 검색 */}
        <TextField
          size="small"
          placeholder="메모, 참조번호 검색"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
          sx={{ width: 200, '& .MuiInputBase-root': { height: 32, fontSize: '0.8rem' } }}
        />
      </Box>

      {/* 2행: 고급 필터 (접을 수 있음) */}
      <Collapse in={showAdvanced}>
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
          p: 1.5, borderRadius: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.02),
          border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.08),
        }}>
          {/* 커스텀 날짜 범위 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CalendarIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <TextField
              type="date"
              size="small"
              value={filters.dateFrom}
              onChange={(e) => handleDateChange('dateFrom', e.target.value)}
              sx={{ width: 140, '& .MuiInputBase-root': { height: 32, fontSize: '0.8rem' } }}
              InputLabelProps={{ shrink: true }}
            />
            <Box sx={{ color: 'text.secondary', fontSize: '0.75rem', px: 0.5 }}>~</Box>
            <TextField
              type="date"
              size="small"
              value={filters.dateTo}
              onChange={(e) => handleDateChange('dateTo', e.target.value)}
              sx={{ width: 140, '& .MuiInputBase-root': { height: 32, fontSize: '0.8rem' } }}
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          {/* 상태 필터 */}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map((opt) => {
              const active = filters.statuses.length === 0 || filters.statuses.includes(opt.key);
              return (
                <Chip
                  key={opt.key}
                  label={opt.label}
                  size="small"
                  variant={active ? 'filled' : 'outlined'}
                  color={active ? opt.color : 'default'}
                  onClick={() => handleStatusToggle(opt.key)}
                  sx={{
                    fontWeight: active ? 600 : 400,
                    opacity: active ? 1 : 0.6,
                    transition: 'all 0.15s',
                  }}
                />
              );
            })}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
