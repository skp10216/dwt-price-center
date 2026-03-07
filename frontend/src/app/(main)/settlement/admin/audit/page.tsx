'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Chip, Button, useTheme,
  TextField, FormControl, InputLabel, Select, MenuItem, Dialog,
  DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import SecurityIcon from '@mui/icons-material/Security';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LinkIcon from '@mui/icons-material/Link';
import { AppPageContainer, AppPageHeader, AppStatusChip } from '@/components/ui';
import { auditApi } from '@/lib/api';

// 정산 도메인 액션 그룹
const ACTION_GROUPS: Record<string, { label: string; color: string; actions: string[] }> = {
  voucher: {
    label: '전표',
    color: '#1976d2',
    actions: ['VOUCHER_CREATE', 'VOUCHER_UPDATE', 'VOUCHER_DELETE', 'VOUCHER_BATCH_DELETE',
      'ADJUSTMENT_VOUCHER_CREATE', 'VOUCHER_LOCK', 'VOUCHER_UNLOCK'],
  },
  transaction: {
    label: '입출금',
    color: '#0097a7',
    actions: ['TRANSACTION_CREATE', 'TRANSACTION_UPDATE', 'TRANSACTION_CANCEL', 'TRANSACTION_BATCH_CANCEL',
      'TRANSACTION_HOLD', 'TRANSACTION_UNHOLD', 'TRANSACTION_HIDE', 'TRANSACTION_UNHIDE'],
  },
  allocation: {
    label: '배분',
    color: '#7b1fa2',
    actions: ['ALLOCATION_CREATE', 'ALLOCATION_AUTO', 'ALLOCATION_DELETE'],
  },
  netting: {
    label: '상계',
    color: '#388e3c',
    actions: ['NETTING_CREATE', 'NETTING_CONFIRM', 'NETTING_CANCEL', 'NETTING_BATCH_DELETE'],
  },
  counterparty: {
    label: '거래처',
    color: '#f57c00',
    actions: ['COUNTERPARTY_CREATE', 'COUNTERPARTY_UPDATE', 'COUNTERPARTY_DELETE', 'COUNTERPARTY_BATCH_DELETE',
      'COUNTERPARTY_BATCH_CREATE', 'COUNTERPARTY_ALIAS_CREATE', 'COUNTERPARTY_ALIAS_DELETE'],
  },
  lock: {
    label: '마감',
    color: '#d32f2f',
    actions: ['PERIOD_LOCK', 'PERIOD_UNLOCK', 'PERIOD_ADJUST'],
  },
  upload: {
    label: '업로드',
    color: '#5d4037',
    actions: ['UPLOAD_START', 'UPLOAD_COMPLETE', 'UPLOAD_CONFIRM', 'UPLOAD_DELETE'],
  },
  auth: {
    label: '인증',
    color: '#455a64',
    actions: ['USER_LOGIN', 'USER_LOGOUT', 'USER_CREATE', 'USER_UPDATE'],
  },
};

function getActionGroup(action: string): { label: string; color: string } {
  for (const group of Object.values(ACTION_GROUPS)) {
    if (group.actions.includes(action)) return group;
  }
  return { label: '기타', color: '#9e9e9e' };
}

function getActionSemantic(action: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (action.includes('CREATE') || action.includes('CONFIRM')) return 'success';
  if (action.includes('UPDATE') || action.includes('HOLD')) return 'warning';
  if (action.includes('DELETE') || action.includes('CANCEL')) return 'error';
  if (action.includes('LOGIN') || action.includes('LOCK')) return 'info';
  return 'neutral';
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

// --- JSON diff 뷰어 ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function JsonDiff({ before, after }: { before: any; after: any }) {
  const theme = useTheme();
  if (!before && !after) return <Typography variant="caption" color="text.secondary">변경 데이터 없음</Typography>;

  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  return (
    <Box sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
      {Array.from(allKeys).map((key) => {
        const bv = before?.[key];
        const av = after?.[key];
        const changed = JSON.stringify(bv) !== JSON.stringify(av);
        return (
          <Box key={key} sx={{
            py: 0.5, px: 1, borderRadius: 1,
            bgcolor: changed ? alpha(theme.palette.warning.main, 0.06) : 'transparent',
          }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">
              {key}:
            </Typography>
            {changed ? (
              <Stack direction="row" spacing={1} sx={{ mt: 0.25 }}>
                <Typography variant="caption" sx={{ color: 'error.main', textDecoration: 'line-through' }}>
                  {JSON.stringify(bv) ?? 'null'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'success.main' }}>
                  {JSON.stringify(av) ?? 'null'}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {JSON.stringify(bv)}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

// --- 메인 ---
export default function AdminAuditPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  // 필터
  const [search, setSearch] = useState('');
  const [actionGroup, setActionGroup] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // 상세 모달
  const [detailOpen, setDetailOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: page + 1,
        page_size: pageSize,
      };
      if (search) params.search = search;
      if (dateFrom) params.start_date = dateFrom;
      if (dateTo) params.end_date = dateTo;
      if (actionGroup) {
        const group = ACTION_GROUPS[actionGroup];
        if (group) params.actions = group.actions.join(',');
      }
      const res = await auditApi.list(params);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res.data as any)?.data ?? res.data;
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {
      enqueueSnackbar('감사로그 로딩 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, actionGroup, dateFrom, dateTo, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'created_at',
      headerName: '시간',
      width: 140,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" sx={{ fontFeatureSettings: '"tnum" on', fontSize: '0.72rem' }}>
          {formatDate(params.value)}
        </Typography>
      ),
    },
    {
      field: 'action',
      headerName: '액션',
      width: 180,
      renderCell: (params: GridRenderCellParams) => {
        const group = getActionGroup(params.value);
        return (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: group.color, flexShrink: 0 }} />
            <AppStatusChip semantic={getActionSemantic(params.value)} label={params.value} />
          </Stack>
        );
      },
    },
    {
      field: 'user_email',
      headerName: '사용자',
      width: 150,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" fontWeight={600}>{params.value || '-'}</Typography>
      ),
    },
    {
      field: 'description',
      headerName: '설명',
      flex: 1,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'target_type',
      headerName: '대상',
      width: 100,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'ip_address',
      headerName: 'IP',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'detail_action',
      headerName: '',
      width: 60,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Tooltip title="상세 보기">
          <IconButton size="small" onClick={() => { setSelectedLog(params.row); setDetailOpen(true); }}>
            <VisibilityIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      ),
    },
  ], []);

  const c = theme.palette;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<SecurityIcon />}
        title="감사로그"
        description="정산 시스템의 모든 변경 이력을 추적합니다"
        color="error"
        count={total}
        onRefresh={loadData}
        loading={loading}
      />

      {/* 필터 */}
      <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small" placeholder="설명, trace_id 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData()}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 0.5, fontSize: 18, color: 'text.disabled' }} /> }}
            sx={{ width: 240 }}
          />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>액션 그룹</InputLabel>
            <Select value={actionGroup} onChange={(e) => setActionGroup(e.target.value)} label="액션 그룹">
              <MenuItem value="">전체</MenuItem>
              {Object.entries(ACTION_GROUPS).map(([key, { label }]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small" type="date" label="시작일"
            value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
          />
          <TextField
            size="small" type="date" label="종료일"
            value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
          />
        </Stack>
      </Paper>

      {/* 테이블 */}
      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <DataGrid
          rows={logs}
          columns={columns}
          loading={loading}
          rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(m) => { setPage(m.page); setPageSize(m.pageSize); }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          autoHeight
          getRowId={(row) => row.id}
          sx={{
            border: 0,
            '& .MuiDataGrid-columnHeaders': { bgcolor: alpha(c.error.main, 0.03) },
            '& .MuiDataGrid-cell': { py: 0.5 },
            '& .MuiDataGrid-row:hover': { bgcolor: alpha(c.error.main, 0.02) },
          }}
        />
      </Paper>

      {/* 상세 다이얼로그 */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon sx={{ fontSize: 20 }} />
          감사로그 상세
        </DialogTitle>
        {selectedLog && (
          <DialogContent>
            <Stack spacing={2}>
              {/* 기본 정보 */}
              <Paper sx={{ p: 2, borderRadius: 2, bgcolor: alpha(c.grey[500], 0.04) }}>
                <Stack spacing={1}>
                  {[
                    ['시간', formatDate(selectedLog.created_at)],
                    ['액션', selectedLog.action],
                    ['사용자', `${selectedLog.user_name || '-'} (${selectedLog.user_email || '-'})`],
                    ['대상', `${selectedLog.target_type || '-'} / ${selectedLog.target_id?.slice(0, 12) || '-'}`],
                    ['설명', selectedLog.description || '-'],
                    ['IP', selectedLog.ip_address || '-'],
                    ['Trace ID', selectedLog.trace_id || '-'],
                  ].map(([label, value]) => (
                    <Stack key={label} direction="row" spacing={2}>
                      <Typography variant="caption" color="text.secondary" sx={{ width: 80, flexShrink: 0, fontWeight: 600 }}>
                        {label}
                      </Typography>
                      <Typography variant="caption" sx={{ fontFamily: label === 'Trace ID' ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
                        {value}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Paper>

              {/* JSON Diff */}
              {(selectedLog.before_data || selectedLog.after_data) && (
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>변경 내용 (Before → After)</Typography>
                  <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', maxHeight: 400, overflow: 'auto' }}>
                    <JsonDiff before={selectedLog.before_data} after={selectedLog.after_data} />
                  </Paper>
                </Box>
              )}
            </Stack>
          </DialogContent>
        )}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {selectedLog?.trace_id && (
            <Button
              startIcon={<LinkIcon />}
              size="small"
              onClick={async () => {
                try {
                  const res = await auditApi.getByTrace(selectedLog.trace_id);
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const data = (res.data as any)?.data ?? res.data;
                  enqueueSnackbar(`동일 trace 로그 ${data.total || 0}건 발견`, { variant: 'info' });
                } catch { /* */ }
              }}
            >
              Trace 조회
            </Button>
          )}
          <Button onClick={() => setDetailOpen(false)} variant="contained" sx={{ borderRadius: 2 }}>닫기</Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
