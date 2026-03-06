'use client';

import { useState, useEffect } from 'react';
import {
  Box, TextField, MenuItem, Select, InputLabel, FormControl,
  InputAdornment, Button, Tooltip,
} from '@mui/material';
import { Search as SearchIcon, Download as DownloadIcon } from '@mui/icons-material';
import { AppPageToolbar } from '@/components/ui';
import { settlementApi } from '@/lib/api';
import { exportToExcel, type ExcelColumn } from '@/lib/excel-export';
import { useCashEvent, type TransactionRow } from './CashEventProvider';
import { STATUS_LABELS, TYPE_LABELS, SOURCE_LABELS } from './constants';
import DatePresetBar from './DatePresetBar';
import ViewToggle from './ViewToggle';

interface CorporateEntityOption { id: string; name: string; }

export default function CashEventToolbar() {
  const { filters, setFilter, transactions } = useCashEvent();

  const handleExcelDownload = async () => {
    const cols: ExcelColumn<TransactionRow>[] = [
      { header: '일자', field: 'transaction_date', width: 12 },
      { header: '유형', field: (r) => TYPE_LABELS[r.transaction_type]?.label ?? r.transaction_type, width: 8 },
      { header: '거래처', field: 'counterparty_name', width: 20 },
      { header: '법인', field: (r) => r.corporate_entity_name || '', width: 15 },
      { header: '금액', field: 'amount', width: 15, format: 'currency' },
      { header: '배분액', field: 'allocated_amount', width: 15, format: 'currency' },
      { header: '미배분', field: 'unallocated_amount', width: 15, format: 'currency' },
      { header: '출처', field: (r) => SOURCE_LABELS[r.source]?.label ?? r.source, width: 8 },
      { header: '상태', field: (r) => STATUS_LABELS[r.status]?.label ?? r.status, width: 10 },
      { header: '메모', field: (r) => r.memo || '', width: 20 },
    ];
    await exportToExcel({ filename: '입출금내역', sheetName: '입출금', columns: cols, rows: transactions });
  };

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
            <Tooltip title="엑셀 다운로드">
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleExcelDownload}
                disabled={transactions.length === 0}
                sx={{ fontWeight: 600 }}
              >
                엑셀
              </Button>
            </Tooltip>
          </Box>
        }
      />
    </>
  );
}
