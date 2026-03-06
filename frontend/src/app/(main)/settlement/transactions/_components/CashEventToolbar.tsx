'use client';

import { useState, useEffect } from 'react';
import {
  Box, TextField, MenuItem, Select, InputLabel, FormControl,
  InputAdornment,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { AppPageToolbar } from '@/components/ui';
import { settlementApi } from '@/lib/api';
import { useCashEvent } from './CashEventProvider';
import DatePresetBar from './DatePresetBar';
import ViewToggle from './ViewToggle';

interface CorporateEntityOption { id: string; name: string; }

export default function CashEventToolbar() {
  const { filters, setFilter } = useCashEvent();

  const [corporateEntities, setCorporateEntities] = useState<CorporateEntityOption[]>([]);
  useEffect(() => {
    settlementApi.listCorporateEntities({ page_size: 100, is_active: true })
      .then(res => {
        const data = res.data as unknown as { corporate_entities: CorporateEntityOption[] };
        setCorporateEntities(data.corporate_entities || []);
      })
      .catch(() => {});
  }, []);

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
              sx={{ minWidth: { xs: 0, sm: 200 }, flex: { xs: 1, sm: 'none' } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 100 }, flex: { xs: 1, sm: 'none' } }}>
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
            <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 110 }, flex: { xs: 1, sm: 'none' } }}>
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
            <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 100 }, flex: { xs: 1, sm: 'none' } }}>
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
            {corporateEntities.length > 0 && (
              <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 120 }, flex: { xs: 1, sm: 'none' } }}>
                <InputLabel>법인</InputLabel>
                <Select
                  value={filters.corporateEntityId}
                  label="법인"
                  onChange={(e) => setFilter('corporateEntityId', e.target.value)}
                >
                  <MenuItem value="">전체</MenuItem>
                  {corporateEntities.map((ce) => (
                    <MenuItem key={ce.id} value={ce.id}>{ce.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              size="small"
              placeholder="최소 금액"
              type="number"
              value={filters.amountMin}
              onChange={(e) => setFilter('amountMin', e.target.value)}
              sx={{ width: { xs: '100%', sm: 120 } }}
            />
            <TextField
              size="small"
              placeholder="최대 금액"
              type="number"
              value={filters.amountMax}
              onChange={(e) => setFilter('amountMax', e.target.value)}
              sx={{ width: { xs: '100%', sm: 120 } }}
            />
          </Box>
        }
      />
    </>
  );
}
