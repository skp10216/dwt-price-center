'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, Stack, Table, TableBody, TableCell, TableFooter,
  TableHead, TableRow, Tooltip, IconButton, Chip, useTheme,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  InputAdornment, FormControlLabel, Switch, Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Delete as DeleteIcon,
  RestoreFromTrash as RestoreIcon,
  AccountBalance as BranchIcon,
  Lock as LockIcon,
  AssignmentInd as AssignIcon,
} from '@mui/icons-material';
import { branchesApi } from '@/lib/api';
import BranchAssignDialog from './BranchAssignDialog';
import { useSnackbar } from 'notistack';
import {
  AppPageHeader,
  AppPageToolbar,
  AppTableShell,
  AppIconActionButton,
} from '@/components/ui';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';

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
  counterparty_count: number;
  created_at: string;
  updated_at: string;
}

export default function BranchTab() {
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

  const [saving, setSaving] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningBranch, setAssigningBranch] = useState<Branch | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<{
    partner_count: number;
    affected_partners: { id: string; name: string }[];
    counterparty_count: number;
    affected_counterparties: { id: string; name: string }[];
  } | null>(null);

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const response = await branchesApi.list({
        search: search || undefined,
        include_deleted: includeDeleted || undefined,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = response.data as any;
      setBranches((data.data?.branches || data.branches || []) as Branch[]);
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
    if (saving) return;
    setSaving(true);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.response?.status === 409) {
        enqueueSnackbar('다른 사용자가 수정했습니다. 새로고침합니다.', { variant: 'warning' });
        fetchBranches();
        setDialogOpen(false);
      } else {
        const detail = error.response?.data?.detail;
        const message = (typeof detail === 'object' ? detail?.message : detail) || '저장에 실패했습니다';
        enqueueSnackbar(message, { variant: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = async (branch: Branch) => {
    setDeletingBranch(branch);
    try {
      const res = await branchesApi.impact(branch.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDeleteImpact((res.data as any).data || res.data);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const openAssignDialog = (branch: Branch) => {
    setAssigningBranch(branch);
    setAssignDialogOpen(true);
  };

  const activeBranches = branches.filter((b) => !b.deleted_at);

  const theme = useTheme();
  const branchSums = useMemo(() => ({
    counterparty_count: branches.reduce((s, b) => s + (b.counterparty_count ?? 0), 0),
  }), [branches]);

  return (
    <>
      <AppPageHeader
        icon={<BranchIcon />}
        title="지사 관리"
        description="지사를 등록하고 관리합니다"
        color="info"
        count={loading ? null : activeBranches.length}
        onRefresh={fetchBranches}
        loading={loading}
        actions={[{
          label: '지사 등록',
          onClick: () => openDialog(),
          variant: 'contained' as const,
          color: 'primary' as const,
          icon: <AddIcon />,
        }]}
      />

      <AppPageToolbar
        left={
          <>
            <TextField
              size="small"
              placeholder="지사명/지역 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchBranches()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 250 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={includeDeleted}
                  onChange={(e) => setIncludeDeleted(e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">삭제된 지사 포함</Typography>}
            />
          </>
        }
        right={
          <Button variant="outlined" size="small" onClick={fetchBranches}>
            조회
          </Button>
        }
      />

      <AppTableShell
        loading={loading}
        isEmpty={!loading && branches.length === 0}
        emptyMessage="등록된 지사가 없습니다"
        count={branches.length}
        page={0}
        rowsPerPage={branches.length || 25}
        onPageChange={() => {}}
        onRowsPerPageChange={() => {}}
        rowsPerPageOptions={[]}
        stickyHeader
        hidePagination
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              {['상태', '지사명', '지역', '연락처', '소속 거래처', '관리'].map((label, i) => (
                <TableCell
                  key={label}
                  align={label === '소속 거래처' ? 'center' : label === '관리' ? 'center' : 'left'}
                  sx={i === 0 ? { width: 90 } : label === '관리' ? { width: 150 } : label === '소속 거래처' ? { width: 100 } : {}}
                >
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {[90, '25%', 100, 150, 100, 120].map((w, j) => (
                    <TableCell key={j} sx={{ py: 1.5, px: 1.5 }}>
                      <Box sx={{ width: w, height: 16, bgcolor: 'action.hover', borderRadius: 0.5 }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : branches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                  <BranchIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="h6" fontWeight={600} color="text.secondary" gutterBottom>
                    등록된 지사가 없습니다
                  </Typography>
                  <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
                    새 지사를 등록하여 거래처를 조직별로 관리하세요
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              branches.map((branch) => (
                <TableRow
                  key={branch.id}
                  hover
                  sx={{
                    transition: 'background 0.15s',
                    ...(branch.deleted_at ? { opacity: 0.6, bgcolor: 'action.hover' } : {}),
                  }}
                >
                  <TableCell>
                    {branch.deleted_at ? (
                      <Chip icon={<LockIcon sx={{ fontSize: 14 }} />} label="삭제됨" size="small" color="default" />
                    ) : (
                      <Chip
                        label={branch.is_active ? '활성' : '비활성'}
                        color={branch.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <BranchIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                      <span>{branch.name}</span>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>
                    {branch.region || '—'}
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>
                    {branch.contact_info || '—'}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>
                    {branch.counterparty_count > 0 ? (
                      <Chip
                        label={`${branch.counterparty_count}개`}
                        size="small"
                        variant="outlined"
                        color="info"
                        onClick={() => !branch.deleted_at && openAssignDialog(branch)}
                        sx={{ cursor: branch.deleted_at ? 'default' : 'pointer' }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">0</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {branch.deleted_at ? (
                      <AppIconActionButton icon={<RestoreIcon />} tooltip="복구" color="success"
                        onClick={() => handleRestore(branch)} />
                    ) : (
                      <Stack direction="row" spacing={0.25} justifyContent="center">
                        <AppIconActionButton icon={<AssignIcon />} tooltip="거래처 배정" color="primary"
                          onClick={() => openAssignDialog(branch)} />
                        <AppIconActionButton icon={<EditIcon />} tooltip="수정"
                          onClick={() => openDialog(branch)} />
                        <AppIconActionButton icon={<DeleteIcon />} tooltip="삭제" color="error"
                          onClick={() => handleDeleteClick(branch)} />
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {branches.length > 0 && (
            <TableFooter>
              <TableRow sx={{
                '& td': {
                  borderBottom: 'none',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  bgcolor: theme.palette.mode === 'light' ? 'grey.50' : 'grey.900',
                  borderTop: '2px solid',
                  borderColor: 'divider',
                },
              }}>
                <TableCell colSpan={4} sx={{ fontWeight: 700 }}>합계</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>{branchSums.counterparty_count}개</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </AppTableShell>

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
          <Button onClick={handleSave} variant="contained" disabled={!formData.name.trim() || saving}>
            {saving ? '저장 중...' : '저장'}
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
        affectedCount={deleteImpact?.counterparty_count}
        affectedItems={deleteImpact?.affected_counterparties}
      />

      {/* 거래처 배정 Dialog */}
      <BranchAssignDialog
        open={assignDialogOpen}
        branch={assigningBranch}
        onClose={() => { setAssignDialogOpen(false); setAssigningBranch(null); }}
        onSaved={fetchBranches}
      />
    </>
  );
}
