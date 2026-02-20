'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, Stack, FormControl,
  InputLabel, Select, MenuItem, alpha, useTheme, IconButton, Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';

interface AuditLogEntry {
  id: string;
  action: string;
  year_month: string;
  target_type: string;
  target_id: string;
  user_name: string;
  user_email: string;
  description: string | null;
  created_at: string;
  details: Record<string, unknown>;
}

/**
 * 마감 내역/감사 로그 페이지
 */
export default function LockHistoryPage() {
  const theme = useTheme();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.getLockAuditLogs({ year: selectedYear, page: page + 1, page_size: pageSize });
      const data = res.data as unknown as { logs: AuditLogEntry[]; total: number };
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {
      // handle
    } finally {
      setLoading(false);
    }
  }, [selectedYear, page, pageSize]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const getActionChip = (action: string) => {
    if (action.includes('lock') && !action.includes('unlock') && !action.includes('release')) {
      return <Chip icon={<LockIcon />} label="마감" size="small" color="success" />;
    }
    if (action.includes('unlock') || action.includes('release')) {
      return <Chip icon={<LockOpenIcon />} label="해제" size="small" color="warning" />;
    }
    return <Chip label={action} size="small" />;
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>마감 내역 / 감사 로그</Typography>
          <Typography variant="body2" color="text.secondary">
            마감/해제 처리 이력과 관련 감사 로그를 확인합니다. 모든 마감 조작은 기록됩니다.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>연도</InputLabel>
            <Select label="연도" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <Tooltip title="새로고침"><IconButton onClick={loadLogs}><RefreshIcon /></IconButton></Tooltip>
        </Stack>
      </Stack>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.info.main, 0.04) }}>
              <TableCell sx={{ fontWeight: 700 }}>일시</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>대상</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>액션</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>처리자</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>이메일</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>비고</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 8 }}>로딩 중...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                <Typography color="text.secondary">감사 로그가 없습니다</Typography>
              </TableCell></TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell>
                    <Chip label={log.year_month || log.target_id} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="center">{getActionChip(log.action)}</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{log.user_name}</TableCell>
                  <TableCell>{log.user_email}</TableCell>
                  <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.description || '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage="페이지당 행:"
        />
      </TableContainer>
    </Box>
  );
}
