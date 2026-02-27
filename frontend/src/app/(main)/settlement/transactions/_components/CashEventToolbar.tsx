'use client';

import {
  Box, TextField, MenuItem, Select, InputLabel, FormControl,
  InputAdornment,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { AppPageToolbar } from '@/components/ui';
import { useCashEvent } from './CashEventProvider';
import DatePresetBar from './DatePresetBar';
import ViewToggle from './ViewToggle';

export default function CashEventToolbar() {
  const { filters, setFilter } = useCashEvent();

  return (
    <>
      {/* 기간 프리셋 바 */}
      <AppPageToolbar
        left={<DatePresetBar />}
        right={<ViewToggle />}
      />

      {/* 검색/필터 바 */}
      <AppPageToolbar
        left={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="거래처명/메모 검색"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              sx={{ minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>유형</InputLabel>
              <Select
                value={filters.transactionType}
                label="유형"
                onChange={(e) => setFilter('transactionType', e.target.value)}
              >
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="deposit">입금</MenuItem>
                <MenuItem value="withdrawal">출금</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>상태</InputLabel>
              <Select
                value={filters.status}
                label="상태"
                onChange={(e) => setFilter('status', e.target.value)}
              >
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="pending">미배분</MenuItem>
                <MenuItem value="partial">부분배분</MenuItem>
                <MenuItem value="allocated">전액배분</MenuItem>
                <MenuItem value="on_hold">보류</MenuItem>
                <MenuItem value="hidden">숨김</MenuItem>
                <MenuItem value="cancelled">취소</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>출처</InputLabel>
              <Select
                value={filters.source}
                label="출처"
                onChange={(e) => setFilter('source', e.target.value)}
              >
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="MANUAL">수동</MenuItem>
                <MenuItem value="BANK_IMPORT">은행</MenuItem>
                <MenuItem value="NETTING">상계</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="최소 금액"
              type="number"
              value={filters.amountMin}
              onChange={(e) => setFilter('amountMin', e.target.value)}
              sx={{ width: 120 }}
            />
            <TextField
              size="small"
              placeholder="최대 금액"
              type="number"
              value={filters.amountMax}
              onChange={(e) => setFilter('amountMax', e.target.value)}
              sx={{ width: 120 }}
            />
          </Box>
        }
      />
    </>
  );
}
