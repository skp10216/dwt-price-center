'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Chip, Button, useTheme,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, IconButton, Tooltip,
  Avatar,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import PeopleIcon from '@mui/icons-material/People';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import LockResetIcon from '@mui/icons-material/LockReset';
import { AppPageContainer, AppPageHeader, AppStatusChip } from '@/components/ui';
import { usersApi } from '@/lib/api';

const ROLE_MAP: Record<string, { label: string; semantic: 'success' | 'info' | 'neutral' }> = {
  admin: { label: '관리자', semantic: 'success' },
  settlement: { label: '경영지원', semantic: 'info' },
  viewer: { label: '조회자', semantic: 'neutral' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

function getAvatarColor(name: string): string {
  const colors = ['#1976d2', '#388e3c', '#d32f2f', '#7b1fa2', '#f57c00', '#0097a7', '#5d4037', '#455a64'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

export default function AdminUsersPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  // 다이얼로그
  const [dialogOpen, setDialogOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'settlement', is_active: true });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (roleFilter) params.role = roleFilter;
      if (search) params.search = search;
      const res = await usersApi.list(params);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res.data as any)?.data ?? res.data;
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch {
      enqueueSnackbar('사용자 목록 로딩 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openDialog = (user?: any) => {
    if (user) {
      setEditing(user);
      setForm({ email: user.email, name: user.name, password: '', role: user.role, is_active: user.is_active });
    } else {
      setEditing(null);
      setForm({ email: '', name: '', password: '', role: 'settlement', is_active: true });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload: any = { name: form.name, role: form.role, is_active: form.is_active };
        if (form.password) payload.password = form.password;
        await usersApi.update(editing.id, payload);
        enqueueSnackbar('사용자 정보가 수정되었습니다.', { variant: 'success' });
      } else {
        await usersApi.create({ email: form.email, name: form.name, password: form.password, role: form.role });
        enqueueSnackbar('사용자가 생성되었습니다.', { variant: 'success' });
      }
      setDialogOpen(false);
      await loadData();
    } catch {
      enqueueSnackbar('저장 실패', { variant: 'error' });
    }
  };

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'name',
      headerName: '이름',
      flex: 1,
      minWidth: 140,
      renderCell: (params: GridRenderCellParams) => (
        <Stack direction="row" spacing={1} alignItems="center">
          <Avatar sx={{
            width: 28, height: 28, fontSize: '0.75rem', fontWeight: 700,
            bgcolor: getAvatarColor(params.row.name || ''),
          }}>
            {(params.row.name || 'U')[0]}
          </Avatar>
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>{params.row.name}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{params.row.email}</Typography>
          </Box>
        </Stack>
      ),
    },
    {
      field: 'role',
      headerName: '역할',
      width: 100,
      renderCell: (params: GridRenderCellParams) => {
        const r = ROLE_MAP[params.value] || { label: params.value, semantic: 'neutral' as const };
        return <AppStatusChip semantic={r.semantic} label={r.label} />;
      },
    },
    {
      field: 'is_active',
      headerName: '상태',
      width: 80,
      renderCell: (params: GridRenderCellParams) => (
        <AppStatusChip semantic={params.value ? 'success' : 'neutral'} label={params.value ? '활성' : '비활성'} />
      ),
    },
    {
      field: 'last_login_at',
      headerName: '최근 로그인',
      width: 140,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" sx={{ fontFeatureSettings: '"tnum" on' }}>
          {formatDate(params.value)}
        </Typography>
      ),
    },
    {
      field: 'created_at',
      headerName: '생성일',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" sx={{ fontFeatureSettings: '"tnum" on' }}>
          {formatDate(params.value)}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 80,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="수정">
            <IconButton size="small" onClick={() => openDialog(params.row)}>
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ], []);

  const c = theme.palette;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<PeopleIcon />}
        title="사용자 계정 관리"
        description="시스템 사용자 계정을 관리합니다"
        color="primary"
        count={total}
        onRefresh={loadData}
        loading={loading}
        actions={[{ label: '사용자 추가', onClick: () => openDialog(), icon: <AddIcon /> }]}
      />

      {/* 필터 */}
      <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small" placeholder="이름 또는 이메일 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData()}
            sx={{ width: 240 }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>역할</InputLabel>
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} label="역할">
              <MenuItem value="">전체</MenuItem>
              <MenuItem value="admin">관리자</MenuItem>
              <MenuItem value="settlement">경영지원</MenuItem>
              <MenuItem value="viewer">조회자</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* 테이블 */}
      <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <DataGrid
          rows={users}
          columns={columns}
          loading={loading}
          rowCount={total}
          pageSizeOptions={[25, 50]}
          disableRowSelectionOnClick
          autoHeight
          getRowId={(row) => row.id}
          sx={{
            border: 0,
            '& .MuiDataGrid-columnHeaders': { bgcolor: alpha(c.primary.main, 0.03) },
            '& .MuiDataGrid-cell': { py: 1 },
            '& .MuiDataGrid-row:hover': { bgcolor: alpha(c.primary.main, 0.02) },
          }}
        />
      </Paper>

      {/* 생성/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editing ? '사용자 수정' : '새 사용자 추가'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="이메일" fullWidth size="small"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={!!editing}
            />
            <TextField
              label="이름" fullWidth size="small"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              label={editing ? '새 비밀번호 (변경 시에만)' : '비밀번호'}
              type="password" fullWidth size="small"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>역할</InputLabel>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} label="역할">
                <MenuItem value="admin">관리자</MenuItem>
                <MenuItem value="settlement">경영지원</MenuItem>
                <MenuItem value="viewer">조회자</MenuItem>
              </Select>
            </FormControl>
            {editing && (
              <FormControl size="small" fullWidth>
                <InputLabel>상태</InputLabel>
                <Select
                  value={form.is_active ? 'active' : 'inactive'}
                  onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })}
                  label="상태"
                >
                  <MenuItem value="active">활성</MenuItem>
                  <MenuItem value="inactive">비활성</MenuItem>
                </Select>
              </FormControl>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} color="inherit">취소</Button>
          <Button onClick={handleSave} variant="contained" sx={{ borderRadius: 2 }}>
            {editing ? '수정' : '생성'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
