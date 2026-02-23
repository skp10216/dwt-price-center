/**
 * 단가표 통합 관리 시스템 - 지사 관리 페이지 (관리자)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  Stack,
  TextField,
  InputAdornment,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  RestoreFromTrash as RestoreIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import { branchesApi } from '@/lib/api';

interface Branch {
  id: string;
  name: string;
  region: string | null;
  contact_info: string | null;
  memo: string | null;
  is_active: boolean;
  deleted_at: string | null;
  delete_reason: string | null;
  partner_count: number;
  created_at: string;
  updated_at: string;
}

export default function BranchesPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    region: '',
    contact_info: '',
    memo: '',
  });

  // 삭제 Dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<{ partner_count: number; affected_partners: { id: string; name: string }[] } | null>(null);

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const response = await branchesApi.list({
        search: search || undefined,
        include_deleted: includeDeleted || undefined,
      });
      setBranches(response.data.data.branches as Branch[]);
    } catch {
      enqueueSnackbar('지사 목록을 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [search, includeDeleted, enqueueSnackbar]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const openDialog = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setFormData({
        name: branch.name,
        region: branch.region || '',
        contact_info: branch.contact_info || '',
        memo: branch.memo || '',
      });
    } else {
      setEditingBranch(null);
      setFormData({ name: '', region: '', contact_info: '', memo: '' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        ...formData,
        region: formData.region || null,
        contact_info: formData.contact_info || null,
        memo: formData.memo || null,
      };

      if (editingBranch) {
        await branchesApi.update(editingBranch.id, {
          ...data,
          version: editingBranch.updated_at,
        });
        enqueueSnackbar('지사가 수정되었습니다', { variant: 'success' });
      } else {
        await branchesApi.create(data);
        enqueueSnackbar('지사가 생성되었습니다', { variant: 'success' });
      }
      setDialogOpen(false);
      fetchBranches();
    } catch (error: any) {
      if (error.response?.status === 409) {
        enqueueSnackbar('다른 사용자가 수정했습니다. 새로고침합니다.', { variant: 'warning' });
        fetchBranches();
        setDialogOpen(false);
      } else {
        const message = error.response?.data?.error?.message || '저장에 실패했습니다';
        enqueueSnackbar(message, { variant: 'error' });
      }
    }
  };

  const handleDeleteClick = async (branch: Branch) => {
    setDeletingBranch(branch);
    try {
      const res = await branchesApi.impact(branch.id);
      setDeleteImpact(res.data.data);
    } catch {
      setDeleteImpact(null);
    }
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async (reason: string) => {
    if (!deletingBranch) return;
    try {
      await branchesApi.delete(deletingBranch.id, {
        reason: reason || undefined,
        version: deletingBranch.updated_at,
      });
      enqueueSnackbar('지사가 삭제되었습니다', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeletingBranch(null);
      fetchBranches();
    } catch (error: any) {
      if (error.response?.status === 409) {
        enqueueSnackbar('다른 사용자가 수정했습니다. 새로고침합니다.', { variant: 'warning' });
        fetchBranches();
        setDeleteDialogOpen(false);
      } else {
        enqueueSnackbar('삭제에 실패했습니다', { variant: 'error' });
      }
    }
  };

  const handleRestore = async (branch: Branch) => {
    try {
      await branchesApi.restore(branch.id);
      enqueueSnackbar('지사가 복구되었습니다', { variant: 'success' });
      fetchBranches();
    } catch {
      enqueueSnackbar('복구에 실패했습니다', { variant: 'error' });
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'is_active',
      headerName: '상태',
      width: 100,
      renderCell: (params) => {
        if (params.row.deleted_at) {
          return <Chip icon={<LockIcon sx={{ fontSize: 14 }} />} label="삭제됨" size="small" color="default" />;
        }
        return (
          <Chip
            label={params.row.is_active ? '활성' : '비활성'}
            color={params.row.is_active ? 'success' : 'default'}
            size="small"
          />
        );
      },
    },
    { field: 'name', headerName: '지사명', width: 150, flex: 1 },
    { field: 'region', headerName: '지역', width: 120 },
    { field: 'contact_info', headerName: '연락처', width: 150 },
    {
      field: 'partner_count',
      headerName: '소속 거래처',
      width: 110,
      align: 'center',
      headerAlign: 'center',
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: '',
      width: 120,
      getActions: (params) => {
        const row = params.row as Branch;
        if (row.deleted_at) {
          return [
            <GridActionsCellItem
              key="restore"
              icon={<RestoreIcon />}
              label="복구"
              onClick={() => handleRestore(row)}
            />,
          ];
        }
        return [
          <GridActionsCellItem
            key="edit"
            icon={<EditIcon />}
            label="수정"
            onClick={() => openDialog(row)}
          />,
          <GridActionsCellItem
            key="delete"
            icon={<DeleteIcon />}
            label="삭제"
            onClick={() => handleDeleteClick(row)}
          />,
        ];
      },
    },
  ];

  return (
    <Box>
      <PageHeader
        title="지사 관리"
        description="지사를 등록하고 관리합니다"
        actions={[{
          label: '지사 등록',
          onClick: () => openDialog(),
        }]}
      />

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              size="small"
              placeholder="지사명/지역 검색"
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
            <FormControlLabel
              control={
                <Switch
                  checked={includeDeleted}
                  onChange={(e) => setIncludeDeleted(e.target.checked)}
                  size="small"
                />
              }
              label="삭제된 지사 포함"
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <DataGrid
          rows={branches}
          columns={columns}
          loading={loading}
          pageSizeOptions={[25, 50]}
          disableRowSelectionOnClick
          autoHeight
          getRowClassName={(params) => (params.row.deleted_at ? 'row-deleted' : '')}
          sx={{
            '& .row-deleted': {
              bgcolor: 'action.hover',
              opacity: 0.6,
            },
          }}
        />
      </Card>

      {/* 생성/수정 Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingBranch ? '지사 수정' : '지사 등록'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="지사명"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="지역"
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="연락처"
                value={formData.contact_info}
                onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="메모"
                value={formData.memo}
                onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button onClick={handleSave} variant="contained" disabled={!formData.name.trim()}>
            저장
          </Button>
        </DialogActions>
      </Dialog>

      {/* 삭제 확인 Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onClose={() => { setDeleteDialogOpen(false); setDeletingBranch(null); }}
        onConfirm={handleDeleteConfirm}
        title="지사 삭제"
        targetName={deletingBranch?.name || ''}
        affectedCount={deleteImpact?.partner_count}
        affectedItems={deleteImpact?.affected_partners}
      />
    </Box>
  );
}
