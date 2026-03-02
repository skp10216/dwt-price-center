'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, Stack, Table, TableBody, TableCell, TableFooter,
  TableHead, TableRow, Tooltip, Chip, useTheme, Grid, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  InputAdornment, FormControlLabel, Switch, CircularProgress,
  List, ListItemButton, ListItemIcon, ListItemText, Divider,
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
  Star as StarIcon,
  Business as BusinessIcon,
  TouchApp as TouchAppIcon,
} from '@mui/icons-material';
import { branchesApi, settlementApi } from '@/lib/api';
import BranchAssignDialog from './BranchAssignDialog';
import { useSnackbar } from 'notistack';
import {
  AppPageHeader,
  AppPageToolbar,
  AppIconActionButton,
} from '@/components/ui';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import { useRouter } from 'next/navigation';

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

interface Counterparty {
  id: string;
  name: string;
  counterparty_type: string | null;
  is_favorite?: boolean;
  branch_name?: string | null;
}

const CP_TYPE_LABELS: Record<string, string> = {
  buyer: '매입처',
  seller: '매출처',
  both: '매입/매출',
};

export default function BranchTab() {
  const { enqueueSnackbar } = useSnackbar();
  const router = useRouter();
  const theme = useTheme();

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

  // 마스터-디테일: 선택된 지사 & 소속 거래처
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [cpLoading, setCpLoading] = useState(false);

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

  // 지사 선택 시 소속 거래처 로드
  const fetchCounterparties = useCallback(async (branchId: string) => {
    setCpLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await settlementApi.listCounterparties({ branch_id: branchId, page_size: 100 }) as any;
      const data = res.data?.data || res.data;
      setCounterparties((data.counterparties || []) as Counterparty[]);
    } catch {
      enqueueSnackbar('소속 거래처를 불러오는데 실패했습니다', { variant: 'error' });
      setCounterparties([]);
    } finally {
      setCpLoading(false);
    }
  }, [enqueueSnackbar]);

  const handleSelectBranch = (branch: Branch) => {
    setSelectedBranch(branch);
    if (!branch.deleted_at) {
      fetchCounterparties(branch.id);
    } else {
      setCounterparties([]);
    }
  };

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
      if (selectedBranch?.id === deletingBranch.id) {
        setSelectedBranch(null);
        setCounterparties([]);
      }
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

  const handleAssignSaved = () => {
    fetchBranches();
    // 현재 선택된 지사의 거래처 목록도 갱신
    if (selectedBranch) {
      fetchCounterparties(selectedBranch.id);
    }
  };

  const activeBranches = branches.filter((b) => !b.deleted_at);

  const branchSums = useMemo(() => ({
    counterparty_count: branches.reduce((s, b) => s + (b.counterparty_count ?? 0), 0),
  }), [branches]);

  return (
    <>
      <AppPageHeader
        icon={<BranchIcon />}
        title="지사 관리"
        description="지사를 등록하고 소속 거래처를 관리합니다"
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

      <Grid container spacing={2} sx={{ mt: 0 }}>
        {/* ── 왼쪽: 지사 목록 ── */}
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 검색 바 */}
            <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" spacing={1} alignItems="center">
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
                  sx={{ flex: 1 }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={includeDeleted}
                      onChange={(e) => setIncludeDeleted(e.target.checked)}
                      size="small"
                    />
                  }
                  label={<Typography variant="caption">삭제 포함</Typography>}
                  sx={{ mr: 0 }}
                />
              </Stack>
            </Box>

            {/* 지사 리스트 */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : branches.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <BranchIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="body2" color="text.disabled">등록된 지사가 없습니다</Typography>
                </Box>
              ) : (
                <List disablePadding dense>
                  {branches.map((branch, idx) => (
                    <Box key={branch.id}>
                      {idx > 0 && <Divider />}
                      <ListItemButton
                        selected={selectedBranch?.id === branch.id}
                        onClick={() => handleSelectBranch(branch)}
                        sx={{
                          py: 1,
                          ...(branch.deleted_at ? { opacity: 0.5 } : {}),
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <BranchIcon sx={{ fontSize: 18, color: branch.deleted_at ? 'text.disabled' : 'primary.main' }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <Typography variant="body2" fontWeight={600} noWrap>
                                {branch.name}
                              </Typography>
                              {branch.deleted_at && (
                                <Chip icon={<LockIcon sx={{ fontSize: 12 }} />} label="삭제" size="small" color="default" sx={{ height: 18, '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem' } }} />
                              )}
                            </Stack>
                          }
                          secondary={branch.region || undefined}
                          secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                        />
                        <Chip
                          label={branch.counterparty_count}
                          size="small"
                          variant={selectedBranch?.id === branch.id ? 'filled' : 'outlined'}
                          color={branch.counterparty_count > 0 ? 'info' : 'default'}
                          sx={{ height: 22, minWidth: 28, '& .MuiChip-label': { px: 0.75 } }}
                        />
                        {/* 관리 버튼 */}
                        <Stack direction="row" spacing={0} sx={{ ml: 0.5 }}>
                          {branch.deleted_at ? (
                            <AppIconActionButton icon={<RestoreIcon sx={{ fontSize: 16 }} />} tooltip="복구" color="success"
                              onClick={(e) => { e.stopPropagation(); handleRestore(branch); }} size="small" />
                          ) : (
                            <>
                              <AppIconActionButton icon={<EditIcon sx={{ fontSize: 16 }} />} tooltip="수정"
                                onClick={(e) => { e.stopPropagation(); openDialog(branch); }} size="small" />
                              <AppIconActionButton icon={<DeleteIcon sx={{ fontSize: 16 }} />} tooltip="삭제" color="error"
                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(branch); }} size="small" />
                            </>
                          )}
                        </Stack>
                      </ListItemButton>
                    </Box>
                  ))}
                </List>
              )}
            </Box>

            {/* 합계 */}
            {branches.length > 0 && (
              <Box sx={{
                p: 1.5, borderTop: '2px solid', borderColor: 'divider',
                bgcolor: theme.palette.mode === 'light' ? 'grey.50' : 'grey.900',
              }}>
                <Typography variant="caption" fontWeight={700}>
                  합계: 지사 {activeBranches.length}개 · 거래처 {branchSums.counterparty_count}개
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* ── 오른쪽: 소속 거래처 디테일 ── */}
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ height: '100%', minHeight: 400, display: 'flex', flexDirection: 'column' }}>
            {!selectedBranch ? (
              /* 미선택 상태 */
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, py: 8 }}>
                <TouchAppIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
                <Typography variant="h6" fontWeight={600} color="text.secondary" gutterBottom>
                  지사를 선택하세요
                </Typography>
                <Typography variant="body2" color="text.disabled">
                  왼쪽 목록에서 지사를 클릭하면 소속 거래처가 표시됩니다
                </Typography>
              </Box>
            ) : (
              <>
                {/* 헤더 */}
                <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <BranchIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                      <Typography variant="subtitle1" fontWeight={700}>
                        {selectedBranch.name}
                      </Typography>
                      {selectedBranch.region && (
                        <Typography variant="body2" color="text.secondary">· {selectedBranch.region}</Typography>
                      )}
                      <Chip label={`${counterparties.length}건`} size="small" color="info" variant="outlined" />
                    </Stack>
                    {!selectedBranch.deleted_at && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AssignIcon />}
                        onClick={() => openAssignDialog(selectedBranch)}
                      >
                        거래처 배정
                      </Button>
                    )}
                  </Stack>
                </Box>

                {/* 거래처 테이블 */}
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                  {cpLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                      <CircularProgress size={28} />
                    </Box>
                  ) : selectedBranch.deleted_at ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                      <LockIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                      <Typography variant="body2" color="text.disabled">삭제된 지사입니다</Typography>
                    </Box>
                  ) : counterparties.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                      <BusinessIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                      <Typography variant="body2" color="text.disabled">소속 거래처가 없습니다</Typography>
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<AssignIcon />}
                        onClick={() => openAssignDialog(selectedBranch)}
                        sx={{ mt: 1 }}
                      >
                        거래처 배정하기
                      </Button>
                    </Box>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ width: 36 }} />
                          <TableCell>거래처명</TableCell>
                          <TableCell sx={{ width: 90 }}>유형</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {counterparties.map((cp) => (
                          <TableRow
                            key={cp.id}
                            hover
                            sx={{ cursor: 'pointer' }}
                            onClick={() => router.push(`/settlement/counterparties/${cp.id}`)}
                          >
                            <TableCell sx={{ pr: 0 }}>
                              {cp.is_favorite && (
                                <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={500}>{cp.name}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" color="text.secondary">
                                {CP_TYPE_LABELS[cp.counterparty_type || ''] || cp.counterparty_type || '—'}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Box>
              </>
            )}
          </Paper>
        </Grid>
      </Grid>

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
        onSaved={handleAssignSaved}
      />
    </>
  );
}
