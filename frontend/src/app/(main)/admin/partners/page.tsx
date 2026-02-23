/**
 * 단가표 통합 관리 시스템 - 거래처 관리 페이지 (관리자)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Grid,
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Delete as DeleteIcon,
  RestoreFromTrash as RestoreIcon,
  Lock as LockIcon,
  SwapHoriz as SwapHorizIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import { partnersApi, branchesApi } from '@/lib/api';

interface Partner {
  id: string;
  name: string;
  region: string | null;
  contact_info: string | null;
  memo: string | null;
  is_active: boolean;
  is_favorite: boolean;
  branch_id: string | null;
  branch_name: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  updated_at: string;
}

interface Branch {
  id: string;
  name: string;
}

const sortByFavorite = (list: Partner[]) =>
  [...list].sort((a, b) =>
    a.is_favorite === b.is_favorite ? 0 : a.is_favorite ? -1 : 1
  );

export default function PartnersPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    region: '',
    contact_info: '',
    memo: '',
    branch_id: '' as string,
  });

  // 삭제 Dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingPartner, setDeletingPartner] = useState<Partner | null>(null);

  // 지사 이동 Dialog
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingPartner, setMovingPartner] = useState<Partner | null>(null);
  const [moveBranchId, setMoveBranchId] = useState<string>('');
  const [moveReason, setMoveReason] = useState('');

  // 지사 목록 로드
  const fetchBranches = useCallback(async () => {
    try {
      const res = await branchesApi.list();
      setBranches(res.data.data.branches as Branch[]);
    } catch {
      // silent
    }
  }, []);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      const response = await partnersApi.list({
        search: search || undefined,
        favorites_only: favoritesOnly || undefined,
        include_deleted: includeDeleted || undefined,
      });
      const fetched = response.data.data.partners as Partner[];
      setPartners(sortByFavorite(fetched));
    } catch {
      enqueueSnackbar('거래처 목록을 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [search, favoritesOnly, includeDeleted, enqueueSnackbar]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  // 즐겨찾기 토글 (옵티미스틱 업데이트)
  const handleToggleFavorite = async (partner: Partner) => {
    const next = !partner.is_favorite;
    setPartners((prev) =>
      sortByFavorite(prev.map((p) => (p.id === partner.id ? { ...p, is_favorite: next } : p)))
    );

    try {
      await partnersApi.toggleFavorite(partner.id);
      enqueueSnackbar(next ? '즐겨찾기에 추가되었습니다' : '즐겨찾기에서 제거되었습니다', {
        variant: 'success',
      });
    } catch {
      setPartners((prev) =>
        sortByFavorite(
          prev.map((p) => (p.id === partner.id ? { ...p, is_favorite: partner.is_favorite } : p))
        )
      );
      enqueueSnackbar('즐겨찾기 변경에 실패했습니다', { variant: 'error' });
    }
  };

  const openDialog = (partner?: Partner) => {
    if (partner) {
      setEditingPartner(partner);
      setFormData({
        name: partner.name,
        region: partner.region || '',
        contact_info: partner.contact_info || '',
        memo: partner.memo || '',
        branch_id: partner.branch_id || '',
      });
    } else {
      setEditingPartner(null);
      setFormData({ name: '', region: '', contact_info: '', memo: '', branch_id: '' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const data: Record<string, unknown> = {
        name: formData.name,
        region: formData.region || null,
        contact_info: formData.contact_info || null,
        memo: formData.memo || null,
      };

      if (editingPartner) {
        await partnersApi.update(editingPartner.id, data);
        // 지사 변경이 있으면 별도 API
        if ((formData.branch_id || null) !== (editingPartner.branch_id || null)) {
          await partnersApi.moveBranch(editingPartner.id, {
            branch_id: formData.branch_id || null,
            version: editingPartner.updated_at,
          });
        }
        enqueueSnackbar('거래처가 수정되었습니다', { variant: 'success' });
      } else {
        await partnersApi.create(data);
        enqueueSnackbar('거래처가 생성되었습니다', { variant: 'success' });
      }
      setDialogOpen(false);
      fetchPartners();
    } catch (error: any) {
      if (error.response?.status === 409) {
        enqueueSnackbar('다른 사용자가 수정했습니다. 새로고침합니다.', { variant: 'warning' });
        fetchPartners();
        setDialogOpen(false);
      } else {
        const message = error.response?.data?.error?.message || '저장에 실패했습니다';
        enqueueSnackbar(message, { variant: 'error' });
      }
    }
  };

  const handleToggleActive = async (partner: Partner) => {
    try {
      await partnersApi.update(partner.id, { is_active: !partner.is_active });
      enqueueSnackbar(
        partner.is_active ? '거래처가 비활성화되었습니다' : '거래처가 활성화되었습니다',
        { variant: 'success' }
      );
      fetchPartners();
    } catch {
      enqueueSnackbar('상태 변경에 실패했습니다', { variant: 'error' });
    }
  };

  // 삭제
  const handleDeleteClick = (partner: Partner) => {
    setDeletingPartner(partner);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async (reason: string) => {
    if (!deletingPartner) return;
    try {
      await partnersApi.delete(deletingPartner.id, {
        reason: reason || undefined,
        version: deletingPartner.updated_at,
      });
      enqueueSnackbar('거래처가 삭제되었습니다', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeletingPartner(null);
      fetchPartners();
    } catch (error: any) {
      if (error.response?.status === 409) {
        enqueueSnackbar('다른 사용자가 수정했습니다. 새로고침합니다.', { variant: 'warning' });
        fetchPartners();
        setDeleteDialogOpen(false);
      } else {
        enqueueSnackbar('삭제에 실패했습니다', { variant: 'error' });
      }
    }
  };

  const handleRestore = async (partner: Partner) => {
    try {
      await partnersApi.restore(partner.id);
      enqueueSnackbar('거래처가 복구되었습니다', { variant: 'success' });
      fetchPartners();
    } catch {
      enqueueSnackbar('복구에 실패했습니다', { variant: 'error' });
    }
  };

  // 지사 이동
  const handleMoveClick = (partner: Partner) => {
    setMovingPartner(partner);
    setMoveBranchId(partner.branch_id || '');
    setMoveReason('');
    setMoveDialogOpen(true);
  };

  const handleMoveConfirm = async () => {
    if (!movingPartner) return;
    try {
      await partnersApi.moveBranch(movingPartner.id, {
        branch_id: moveBranchId || null,
        reason: moveReason || undefined,
        version: movingPartner.updated_at,
      });
      enqueueSnackbar('지사가 변경되었습니다', { variant: 'success' });
      setMoveDialogOpen(false);
      fetchPartners();
    } catch (error: any) {
      if (error.response?.status === 409) {
        enqueueSnackbar('다른 사용자가 수정했습니다. 새로고침합니다.', { variant: 'warning' });
        fetchPartners();
        setMoveDialogOpen(false);
      } else {
        enqueueSnackbar('지사 변경에 실패했습니다', { variant: 'error' });
      }
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'is_favorite',
      headerName: '',
      width: 50,
      sortable: false,
      renderCell: (params) => {
        if (params.row.deleted_at) return null;
        return (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleFavorite(params.row as Partner);
            }}
            color={params.row.is_favorite ? 'warning' : 'default'}
          >
            {params.row.is_favorite ? (
              <StarIcon fontSize="small" />
            ) : (
              <StarBorderIcon fontSize="small" />
            )}
          </IconButton>
        );
      },
    },
    {
      field: 'is_active',
      headerName: '상태',
      width: 90,
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
    { field: 'name', headerName: '거래처명', width: 150, flex: 1 },
    {
      field: 'branch_name',
      headerName: '소속 지사',
      width: 120,
      renderCell: (params) => params.row.branch_name || '-',
    },
    { field: 'region', headerName: '지역', width: 120 },
    { field: 'contact_info', headerName: '연락처', width: 150 },
    {
      field: 'actions',
      type: 'actions',
      headerName: '',
      width: 150,
      getActions: (params) => {
        const row = params.row as Partner;
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
            key="move"
            icon={<SwapHorizIcon />}
            label="지사 이동"
            onClick={() => handleMoveClick(row)}
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
        title="거래처 관리"
        description="거래처를 등록하고 관리합니다"
        actions={[{
          label: '거래처 등록',
          onClick: () => openDialog(),
        }]}
      />

      {/* 검색 + 필터 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              size="small"
              placeholder="거래처명/지역 검색"
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
            <ToggleButtonGroup
              value={favoritesOnly ? 'favorites' : 'all'}
              exclusive
              onChange={(_, v) => {
                if (v !== null) setFavoritesOnly(v === 'favorites');
              }}
              size="small"
            >
              <ToggleButton value="all">전체</ToggleButton>
              <ToggleButton value="favorites">
                <StarIcon sx={{ mr: 0.5, fontSize: 16 }} />
                즐겨찾기
              </ToggleButton>
            </ToggleButtonGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={includeDeleted}
                  onChange={(e) => setIncludeDeleted(e.target.checked)}
                  size="small"
                />
              }
              label="삭제된 거래처 포함"
            />
          </Stack>
        </CardContent>
      </Card>

      {/* 테이블 */}
      <Card>
        <DataGrid
          rows={partners}
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

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingPartner ? '거래처 수정' : '거래처 등록'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="거래처명"
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
            {editingPartner && (
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>소속 지사</InputLabel>
                  <Select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    label="소속 지사"
                  >
                    <MenuItem value="">미배정</MenuItem>
                    {branches.map((b) => (
                      <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
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
        onClose={() => { setDeleteDialogOpen(false); setDeletingPartner(null); }}
        onConfirm={handleDeleteConfirm}
        title="거래처 삭제"
        targetName={deletingPartner?.name || ''}
      />

      {/* 지사 이동 Dialog */}
      <Dialog open={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>지사 이동</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>{movingPartner?.name}</strong>의 소속 지사를 변경합니다.
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>이동할 지사</InputLabel>
            <Select
              value={moveBranchId}
              onChange={(e) => setMoveBranchId(e.target.value)}
              label="이동할 지사"
            >
              <MenuItem value="">미배정</MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="이동 사유 (선택)"
            value={moveReason}
            onChange={(e) => setMoveReason(e.target.value)}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveDialogOpen(false)}>취소</Button>
          <Button onClick={handleMoveConfirm} variant="contained">이동</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
