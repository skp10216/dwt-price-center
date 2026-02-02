/**
 * 단가표 통합 관리 시스템 - 사용자 관리 페이지 (관리자)
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
  IconButton,
  Typography,
  Stack,
  TextField,
  InputAdornment,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { Search as SearchIcon, Edit as EditIcon, PersonAdd as PersonAddIcon } from '@mui/icons-material';
import { DataGrid, GridColDef, GridActionsCellItem, GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import PageHeader from '@/components/ui/PageHeader';
import { usersApi } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'viewer';
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export default function UsersPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'viewer' as 'admin' | 'viewer',
  });

  // 사용자 목록 조회
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await usersApi.list({
        page: page + 1,
        page_size: pageSize,
        search: search || undefined,
      });
      const data = response.data.data;
      setUsers(data.users as User[]);
      setTotal(data.total);
    } catch (error) {
      enqueueSnackbar('사용자 목록을 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, pageSize, search]);

  // 다이얼로그 열기
  const openDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        password: '',
        name: user.name,
        role: user.role,
      });
    } else {
      setEditingUser(null);
      setFormData({ email: '', password: '', name: '', role: 'viewer' });
    }
    setDialogOpen(true);
  };

  // 저장
  const handleSave = async () => {
    try {
      if (editingUser) {
        await usersApi.update(editingUser.id, {
          name: formData.name,
          role: formData.role,
        });
        enqueueSnackbar('사용자가 수정되었습니다', { variant: 'success' });
      } else {
        await usersApi.create(formData);
        enqueueSnackbar('사용자가 생성되었습니다', { variant: 'success' });
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '저장에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };

  // 활성/비활성 토글
  const handleToggleActive = async (user: User) => {
    try {
      await usersApi.update(user.id, { is_active: !user.is_active });
      enqueueSnackbar(
        user.is_active ? '사용자가 비활성화되었습니다' : '사용자가 활성화되었습니다',
        { variant: 'success' }
      );
      fetchUsers();
    } catch (error) {
      enqueueSnackbar('상태 변경에 실패했습니다', { variant: 'error' });
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'is_active',
      headerName: '상태',
      width: 80,
      renderCell: (params: GridRenderCellParams<User>) => (
        <Chip
          label={params.row.is_active ? '활성' : '비활성'}
          color={params.row.is_active ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    { field: 'email', headerName: '이메일', width: 200, flex: 1 },
    { field: 'name', headerName: '이름', width: 120 },
    {
      field: 'role',
      headerName: '역할',
      width: 100,
      renderCell: (params: GridRenderCellParams<User>) => (
        <Chip
          label={params.row.role === 'admin' ? '관리자' : '조회자'}
          color={params.row.role === 'admin' ? 'primary' : 'default'}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'last_login_at',
      headerName: '최근 로그인',
      width: 160,
      renderCell: (params: GridRenderCellParams<User>) =>
        params.row.last_login_at
          ? format(new Date(params.row.last_login_at), 'yyyy-MM-dd HH:mm')
          : '-',
    },
    {
      field: 'created_at',
      headerName: '가입일',
      width: 120,
      renderCell: (params: GridRenderCellParams<User>) =>
        format(new Date(params.row.created_at), 'yyyy-MM-dd'),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: '',
      width: 100,
      getActions: (params) => [
        <GridActionsCellItem
          key="edit"
          icon={<EditIcon />}
          label="수정"
          onClick={() => openDialog(params.row as User)}
        />,
      ],
    },
  ];

  return (
    <Box>
      <PageHeader
        title="사용자 관리"
        description="사용자 계정을 생성하고 권한을 관리합니다"
        action={{
          label: '사용자 추가',
          onClick: () => openDialog(),
        }}
      />

      {/* 검색 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            size="small"
            placeholder="이메일/이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 250 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
        </CardContent>
      </Card>

      {/* 테이블 */}
      <Card>
        <DataGrid
          rows={users}
          columns={columns}
          rowCount={total}
          loading={loading}
          pageSizeOptions={[25, 50]}
          paginationModel={{ page, pageSize }}
          paginationMode="server"
          onPaginationModelChange={(model) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          disableRowSelectionOnClick
          autoHeight
        />
      </Card>

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingUser ? '사용자 수정' : '사용자 추가'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="이메일"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                disabled={!!editingUser}
              />
            </Grid>
            {!editingUser && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="비밀번호"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  helperText="8자 이상"
                />
              </Grid>
            )}
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="이름"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>역할</InputLabel>
                <Select
                  value={formData.role}
                  label="역할"
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as 'admin' | 'viewer' })
                  }
                >
                  <MenuItem value="viewer">조회자</MenuItem>
                  <MenuItem value="admin">관리자</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={
              !formData.name.trim() ||
              !formData.email.trim() ||
              (!editingUser && !formData.password)
            }
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
