'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Chip, useTheme,
  Avatar, Tabs, Tab,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import HistoryIcon from '@mui/icons-material/History';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import { AppPageContainer, AppPageHeader, AppStatusChip } from '@/components/ui';
import { settlementAdminApi } from '@/lib/api';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

function getAvatarColor(name: string): string {
  const colors = ['#1976d2', '#388e3c', '#d32f2f', '#7b1fa2', '#f57c00', '#0097a7', '#5d4037', '#455a64'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

export default function SessionsPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sessions, setSessions] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [userStats, setUserStats] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [tab, setTab] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settlementAdminApi.getLoginHistory({
        page: page + 1, page_size: pageSize,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res.data as any)?.data ?? res.data;
      setSessions(data.sessions || []);
      setTotal(data.total || 0);
      setUserStats(data.user_stats || []);
    } catch {
      enqueueSnackbar('로그인 이력 로딩 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  const sessionColumns: GridColDef[] = useMemo(() => [
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
      headerName: '유형',
      width: 100,
      renderCell: (params: GridRenderCellParams) => {
        const isLogin = params.value === 'USER_LOGIN';
        return (
          <Stack direction="row" spacing={0.5} alignItems="center">
            {isLogin ? <LoginIcon sx={{ fontSize: 14, color: 'success.main' }} /> : <LogoutIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
            <AppStatusChip semantic={isLogin ? 'success' : 'neutral'} label={isLogin ? '로그인' : '로그아웃'} />
          </Stack>
        );
      },
    },
    {
      field: 'user_name',
      headerName: '사용자',
      width: 160,
      renderCell: (params: GridRenderCellParams) => (
        <Stack direction="row" spacing={1} alignItems="center">
          <Avatar sx={{
            width: 24, height: 24, fontSize: '0.65rem', fontWeight: 700,
            bgcolor: getAvatarColor(params.value || ''),
          }}>
            {(params.value || 'U')[0]}
          </Avatar>
          <Box>
            <Typography variant="caption" fontWeight={600} sx={{ lineHeight: 1.2, display: 'block' }}>{params.value || '-'}</Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>{params.row.user_email || ''}</Typography>
          </Box>
        </Stack>
      ),
    },
    {
      field: 'ip_address',
      headerName: 'IP',
      width: 130,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
          {params.value || '-'}
        </Typography>
      ),
    },
    {
      field: 'user_agent',
      headerName: 'User Agent',
      flex: 1,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" color="text.secondary" sx={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: '0.7rem',
        }}>
          {params.value || '-'}
        </Typography>
      ),
    },
  ], []);

  const c = theme.palette;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<HistoryIcon />}
        title="로그인 이력"
        description="사용자별 로그인/로그아웃 이력을 추적합니다"
        color="info"
        count={total}
        onRefresh={loadData}
        loading={loading}
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, '& .MuiTab-root': { fontWeight: 700, fontSize: '0.85rem' } }}>
        <Tab label="세션 이력" />
        <Tab label="사용자별 통계" />
      </Tabs>

      {/* 세션 이력 */}
      {tab === 0 && (
        <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <DataGrid
            rows={sessions}
            columns={sessionColumns}
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
              '& .MuiDataGrid-columnHeaders': { bgcolor: alpha(c.info.main, 0.03) },
              '& .MuiDataGrid-cell': { py: 0.5 },
              '& .MuiDataGrid-row:hover': { bgcolor: alpha(c.info.main, 0.02) },
            }}
          />
        </Paper>
      )}

      {/* 사용자별 통계 */}
      {tab === 1 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {userStats.map((user) => (
            <Paper key={user.id} sx={{
              p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider',
              transition: 'all 0.2s',
              '&:hover': { borderColor: alpha(c.info.main, 0.3) },
            }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                <Avatar sx={{
                  width: 36, height: 36, fontSize: '0.85rem', fontWeight: 700,
                  bgcolor: getAvatarColor(user.name || ''),
                }}>
                  {(user.name || 'U')[0]}
                </Avatar>
                <Box>
                  <Typography variant="body2" fontWeight={700}>{user.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{user.email}</Typography>
                </Box>
              </Stack>
              <Stack spacing={0.75}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">최근 로그인</Typography>
                  <Typography variant="caption" fontWeight={600} sx={{ fontFeatureSettings: '"tnum" on' }}>
                    {formatDate(user.last_login_at)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">30일 로그인 횟수</Typography>
                  <Typography variant="caption" fontWeight={700}>{user.login_count_30d}회</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">접속 IP 수</Typography>
                  <Chip
                    label={`${user.ip_count_30d}개`}
                    size="small"
                    color={user.ip_count_30d > 3 ? 'warning' : 'default'}
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                  />
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Box>
      )}
    </AppPageContainer>
  );
}
