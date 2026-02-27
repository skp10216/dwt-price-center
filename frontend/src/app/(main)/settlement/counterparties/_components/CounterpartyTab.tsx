'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, Stack, Table, TableBody, TableCell, TableFooter,
  TableHead, TableRow, Tooltip, IconButton, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip,
  MenuItem, Select, FormControl, InputLabel, InputAdornment, alpha,
  useTheme, Divider, Checkbox, Alert, AlertTitle, CircularProgress,
  Collapse, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Business as BusinessIcon,
  Visibility as ViewIcon,
  LocalOffer as AliasIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { settlementApi, branchesApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import {
  AppPageHeader,
  AppPageToolbar,
  AppTableShell,
  AppIconActionButton,
} from '@/components/ui';

interface CounterpartyRow {
  id: string;
  name: string;
  registration_number: string | null;
  type: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  is_favorite: boolean;
  branch_id: string | null;
  branch_name: string | null;
  aliases: Array<{ id: string; alias_name: string }>;
  total_sales: number;
  total_purchases: number;
  outstanding_receivable: number;
  outstanding_payable: number;
}

interface BranchOption {
  id: string;
  name: string;
}

const typeLabels: Record<string, string> = { seller: '매입처', buyer: '매출처', both: '매입/매출' };

const formatAmount = (amount: number | null | undefined) =>
  new Intl.NumberFormat('ko-KR').format(amount ?? 0);

export default function CounterpartyTab() {
  const theme = useTheme();
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();

  const [counterparties, setCounterparties] = useState<CounterpartyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [branchFilter, setBranchFilter] = useState('');

  // 지사 목록 (필터/드롭다운용)
  const [branches, setBranches] = useState<BranchOption[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CounterpartyRow | null>(null);
  const [formName, setFormName] = useState('');
  const [formRegNo, setFormRegNo] = useState('');
  const [formType, setFormType] = useState<string>('both');
  const [formContact, setFormContact] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formBranchId, setFormBranchId] = useState('');

  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [aliasTarget, setAliasTarget] = useState<CounterpartyRow | null>(null);
  const [newAlias, setNewAlias] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{
    deleted_count: number;
    skipped_count: number;
    deleted: { id: string; name: string }[];
    skipped: { id: string; name: string; reason: string }[];
  } | null>(null);
  const [showSkippedDetails, setShowSkippedDetails] = useState(false);

  // 지사 목록 로드
  const loadBranches = useCallback(async () => {
    try {
      const res = await branchesApi.list();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = res.data as any;
      const list = (data.data?.branches || data.branches || []) as BranchOption[];
      setBranches(list.filter((b: any) => !b.deleted_at));
    } catch { /* silent */ }
  }, []);

  const loadCounterparties = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = { page: page + 1, page_size: pageSize };
      if (search) params.search = search;
      if (favoritesOnly) params.favorites_only = true;
      if (branchFilter) params.branch_id = branchFilter;
      const res = await settlementApi.listCounterparties(params);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = res.data as any;
      setCounterparties(data.counterparties || []);
      setTotal(data.total || 0);
    } catch {
      enqueueSnackbar('거래처 목록을 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, favoritesOnly, branchFilter, enqueueSnackbar]);

  const loadFavoriteCount = useCallback(async () => {
    try {
      const res = await settlementApi.listCounterparties({ favorites_only: true, page_size: 1 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFavoriteCount((res.data as any).total || 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadBranches(); }, [loadBranches]);
  useEffect(() => { loadCounterparties(); }, [loadCounterparties]);
  useEffect(() => { loadFavoriteCount(); }, [loadFavoriteCount]);

  // ─── 즐겨찾기 토글 ───
  const handleToggleFavorite = async (cp: CounterpartyRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !cp.is_favorite;
    setCounterparties((prev) =>
      prev.map((c) => (c.id === cp.id ? { ...c, is_favorite: next } : c))
    );
    setFavoriteCount((prev) => prev + (next ? 1 : -1));

    try {
      await settlementApi.toggleCounterpartyFavorite(cp.id);
      enqueueSnackbar(
        next ? `"${cp.name}" 즐겨찾기 추가` : `"${cp.name}" 즐겨찾기 해제`,
        { variant: 'success', autoHideDuration: 1500 }
      );
      if (favoritesOnly && !next) {
        setCounterparties((prev) => prev.filter((c) => c.id !== cp.id));
        setTotal((prev) => prev - 1);
      }
    } catch {
      setCounterparties((prev) =>
        prev.map((c) => (c.id === cp.id ? { ...c, is_favorite: cp.is_favorite } : c))
      );
      setFavoriteCount((prev) => prev + (next ? -1 : 1));
      enqueueSnackbar('즐겨찾기 변경에 실패했습니다', { variant: 'error' });
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormName(''); setFormRegNo(''); setFormType('both');
    setFormContact(''); setFormEmail(''); setFormPhone('');
    setFormBranchId('');
    setDialogOpen(true);
  };

  const openEdit = (cp: CounterpartyRow) => {
    setEditing(cp);
    setFormName(cp.name);
    setFormRegNo(cp.registration_number || '');
    setFormType(cp.type);
    setFormContact(cp.contact_person || '');
    setFormEmail(cp.contact_email || '');
    setFormPhone(cp.contact_phone || '');
    setFormBranchId(cp.branch_id || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const data: Record<string, unknown> = {
        name: formName,
        registration_number: formRegNo || null,
        type: formType,
        contact_person: formContact || null,
        contact_email: formEmail || null,
        contact_phone: formPhone || null,
        branch_id: formBranchId || null,
      };
      if (editing) {
        await settlementApi.updateCounterparty(editing.id, data);
        enqueueSnackbar('거래처가 수정되었습니다', { variant: 'success' });
      } else {
        await settlementApi.createCounterparty(data);
        enqueueSnackbar('거래처가 등록되었습니다', { variant: 'success' });
      }
      setDialogOpen(false);
      loadCounterparties();
    } catch {
      enqueueSnackbar('저장에 실패했습니다', { variant: 'error' });
    }
  };

  const openAlias = (cp: CounterpartyRow) => {
    setAliasTarget(cp);
    setNewAlias('');
    setAliasDialogOpen(true);
  };

  const handleAddAlias = async () => {
    if (!aliasTarget || !newAlias) return;
    try {
      await settlementApi.createCounterpartyAlias(aliasTarget.id, newAlias);
      enqueueSnackbar('별칭이 추가되었습니다', { variant: 'success' });
      setNewAlias('');
      loadCounterparties();
      const res = await settlementApi.getCounterparty(aliasTarget.id);
      setAliasTarget(res.data as unknown as CounterpartyRow);
    } catch {
      enqueueSnackbar('별칭 추가에 실패했습니다', { variant: 'error' });
    }
  };

  const handleDeleteAlias = async (aliasId: string) => {
    if (!aliasTarget) return;
    try {
      await settlementApi.deleteCounterpartyAlias(aliasTarget.id, aliasId);
      enqueueSnackbar('별칭이 삭제되었습니다', { variant: 'success' });
      loadCounterparties();
      const res = await settlementApi.getCounterparty(aliasTarget.id);
      setAliasTarget(res.data as unknown as CounterpartyRow);
    } catch {
      enqueueSnackbar('별칭 삭제에 실패했습니다', { variant: 'error' });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelected(checked ? new Set(counterparties.map((cp) => cp.id)) : new Set());
  };
  const handleSelectOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };
  const isAllSelected = counterparties.length > 0 && counterparties.every((cp) => selected.has(cp.id));
  const isSomeSelected = selected.size > 0 && !isAllSelected;

  const handleDeleteConfirm = () => {
    if (selected.size === 0) return;
    setDeleteResult(null);
    setShowSkippedDetails(false);
    setDeleteDialogOpen(true);
  };

  const executeDelete = async () => {
    if (selected.size === 0) return;
    try {
      setDeleting(true);
      const ids = Array.from(selected);
      const res = await settlementApi.batchDeleteCounterparties(ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (res.data as any)?.data ?? res.data;
      setDeleteResult(result);
      if (result.deleted_count > 0) enqueueSnackbar(`${result.deleted_count}건 삭제 완료`, { variant: 'success' });
      if (result.skipped_count > 0) enqueueSnackbar(`${result.skipped_count}건은 전표 연결로 삭제 불가`, { variant: 'warning' });
      setSelected(new Set());
      loadCounterparties();
      loadFavoriteCount();
    } catch {
      enqueueSnackbar('삭제에 실패했습니다', { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  // ─── 전체 삭제 (테스트) ────────────────────────────────────────────────────
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const batchSize = 200;
      let totalDeleted = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await settlementApi.listCounterparties({ page: 1, page_size: batchSize });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = res.data as any;
        const ids = (data.counterparties || []).map((c: CounterpartyRow) => c.id);
        if (ids.length === 0) break;

        const delRes = await settlementApi.batchDeleteCounterparties(ids);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (delRes.data as any)?.data ?? delRes.data;
        totalDeleted += result.deleted_count ?? 0;

        if ((result.deleted_count ?? 0) === 0) break;
      }

      enqueueSnackbar(
        totalDeleted > 0 ? `전체 ${totalDeleted}건 삭제 완료` : '삭제할 거래처가 없습니다',
        { variant: totalDeleted > 0 ? 'success' : 'info' },
      );
      setDeleteAllDialogOpen(false);
      setSelected(new Set());
      loadCounterparties();
      loadFavoriteCount();
    } catch {
      enqueueSnackbar('전체 삭제에 실패했습니다', { variant: 'error' });
    } finally {
      setDeletingAll(false);
    }
  };

  const selectedCounterparties = counterparties.filter((cp) => selected.has(cp.id));

  const sums = useMemo(() => ({
    outstanding_receivable: counterparties.reduce((s, c) => s + (c.outstanding_receivable ?? 0), 0),
    outstanding_payable: counterparties.reduce((s, c) => s + (c.outstanding_payable ?? 0), 0),
  }), [counterparties]);

  const headerActions = [
    ...(selected.size > 0 ? [{
      label: `${selected.size}건 삭제`,
      onClick: handleDeleteConfirm,
      variant: 'outlined' as const,
      color: 'error' as const,
      icon: <DeleteIcon />,
    }] : []),
    {
      label: '전체 삭제 (테스트)',
      onClick: () => setDeleteAllDialogOpen(true),
      variant: 'outlined' as const,
      color: 'error' as const,
      icon: <DeleteIcon />,
    },
    {
      label: '거래처 등록',
      onClick: openCreate,
      variant: 'contained' as const,
      color: 'primary' as const,
      icon: <AddIcon />,
    },
  ];

  return (
    <>
      <AppPageHeader
        icon={<BusinessIcon />}
        title="거래처 관리"
        description="거래처 목록, 별칭 관리, 즐겨찾기를 통합 관리합니다"
        color="primary"
        count={loading ? null : total}
        onRefresh={loadCounterparties}
        loading={loading}
        chips={favoritesOnly ? [
          <Chip
            key="fav"
            icon={<StarIcon sx={{ fontSize: '14px !important' }} />}
            label={`즐겨찾기 ${total}개`}
            color="warning"
            size="small"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        ] : []}
        actions={headerActions}
      />

      <AppPageToolbar
        left={
          <>
            <ToggleButtonGroup
              value={favoritesOnly ? 'favorites' : 'all'}
              exclusive
              size="small"
              onChange={(_, v) => {
                if (v !== null) { setFavoritesOnly(v === 'favorites'); setPage(0); }
              }}
            >
              <ToggleButton value="all" sx={{ px: 1.5, fontWeight: 600, fontSize: '0.8rem' }}>
                전체
              </ToggleButton>
              <ToggleButton value="favorites" sx={{ px: 1.5, fontWeight: 600, fontSize: '0.8rem', gap: 0.5 }}>
                <StarIcon sx={{ fontSize: 14, color: favoritesOnly ? 'warning.main' : 'inherit' }} />
                즐겨찾기
                {favoriteCount > 0 && (
                  <Chip
                    label={favoriteCount}
                    size="small"
                    color="warning"
                    sx={{ ml: 0.5, height: 16, fontSize: '0.6rem', fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }}
                  />
                )}
              </ToggleButton>
            </ToggleButtonGroup>
            <Divider orientation="vertical" flexItem sx={{ height: 20, alignSelf: 'center' }} />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>지사</InputLabel>
              <Select
                label="지사"
                value={branchFilter}
                onChange={(e) => { setBranchFilter(e.target.value); setPage(0); }}
              >
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="unassigned">미배정</MenuItem>
                {branches.length > 0 && <Divider />}
                {branches.map((b) => (
                  <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Divider orientation="vertical" flexItem sx={{ height: 20, alignSelf: 'center' }} />
            <TextField
              size="small"
              placeholder="거래처명/사업자번호 검색"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              onKeyDown={(e) => e.key === 'Enter' && loadCounterparties()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 260 }}
            />
          </>
        }
        right={
          <Button variant="outlined" size="small" onClick={loadCounterparties}>
            조회
          </Button>
        }
      />

      <AppTableShell
        loading={loading}
        isEmpty={!loading && counterparties.length === 0}
        emptyMessage={favoritesOnly ? '즐겨찾기한 거래처가 없습니다' : '등록된 거래처가 없습니다'}
        count={total}
        page={page}
        rowsPerPage={pageSize}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[25, 50, 100]}
        stickyHeader
      >
        <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: 42 }}>
                  <Checkbox size="small" indeterminate={isSomeSelected} checked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)} />
                </TableCell>
                <TableCell sx={{ width: 48 }}>
                  <Tooltip title="즐겨찾기">
                    <StarBorderIcon sx={{ fontSize: 16, color: 'text.secondary', verticalAlign: 'middle' }} />
                  </Tooltip>
                </TableCell>
                {['거래처명', '사업자번호', '유형', '지사', '별칭'].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
                {['미수', '미지급'].map((label) => (
                  <TableCell key={label} align="right">{label}</TableCell>
                ))}
                <TableCell>담당자</TableCell>
                <TableCell align="center">관리</TableCell>
              </TableRow>
            </TableHead>
          <TableBody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {[42, 48, '22%', 100, 70, 80, 100, 70, 70, 60, 100].map((w, j) => (
                    <TableCell key={j} sx={{ py: 1, px: 1.5 }}>
                      <Box sx={{ width: w, height: 16, bgcolor: 'action.hover', borderRadius: 0.5 }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : counterparties.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 8 }}>
                  {favoritesOnly
                    ? <StarBorderIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
                    : <BusinessIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
                  }
                  <Typography variant="h6" fontWeight={600} color="text.secondary" gutterBottom>
                    {favoritesOnly ? '즐겨찾기한 거래처가 없습니다' : '등록된 거래처가 없습니다'}
                  </Typography>
                  <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
                    {favoritesOnly
                      ? '거래처 목록에서 ☆ 아이콘을 클릭하여 즐겨찾기를 추가하세요'
                      : '새 거래처를 등록하여 시작하세요'}
                  </Typography>
                  {favoritesOnly && (
                    <Button variant="outlined" size="small" onClick={() => { setFavoritesOnly(false); setPage(0); }}>
                      전체 거래처 보기
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              counterparties.map((cp) => {
                const isChecked = selected.has(cp.id);
                return (
                  <TableRow
                    key={cp.id}
                    hover
                    selected={isChecked}
                    sx={{ transition: 'background 0.15s' }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={isChecked}
                        onChange={(e) => handleSelectOne(cp.id, e.target.checked)} />
                    </TableCell>
                    <TableCell>
                      <Tooltip title={cp.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} placement="right">
                        <IconButton
                          size="small"
                          onClick={(e) => handleToggleFavorite(cp, e)}
                          sx={{
                            color: cp.is_favorite ? 'warning.main' : 'text.disabled',
                            transition: 'color 0.2s',
                            p: 0.5,
                          }}
                        >
                          {cp.is_favorite ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <BusinessIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <span>{cp.name}</span>
                        {!cp.is_active && <Chip label="비활성" size="small" />}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      {cp.registration_number || '—'}
                    </TableCell>
                    <TableCell>
                      <Chip label={typeLabels[cp.type] || cp.type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {cp.branch_name ? (
                        <Chip label={cp.branch_name} size="small" variant="outlined" color="success" />
                      ) : (
                        <Typography variant="caption" color="text.disabled">미배정</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {cp.aliases.slice(0, 3).map((a) => (
                          <Chip key={a.id} label={a.alias_name} size="small" variant="outlined" color="info" />
                        ))}
                        {cp.aliases.length > 3 && (
                          <Chip label={`+${cp.aliases.length - 3}`} size="small" />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{
                      fontWeight: 700,
                      fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums',
                      color: cp.outstanding_receivable > 0 ? 'error.main' : 'text.secondary',
                    }}>
                      {formatAmount(cp.outstanding_receivable)}
                    </TableCell>
                    <TableCell align="right" sx={{
                      fontWeight: 700,
                      fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums',
                      color: cp.outstanding_payable > 0 ? 'warning.main' : 'text.secondary',
                    }}>
                      {formatAmount(cp.outstanding_payable)}
                    </TableCell>
                    <TableCell>
                      {cp.contact_person || '—'}
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.25} justifyContent="center">
                        <AppIconActionButton icon={<ViewIcon />} tooltip="상세/요약" color="primary"
                          onClick={() => router.push(`/settlement/counterparties/${cp.id}?from=counterparties`)} />
                        <AppIconActionButton icon={<EditIcon />} tooltip="수정"
                          onClick={() => openEdit(cp)} />
                        <AppIconActionButton icon={<AliasIcon />} tooltip="별칭 관리" color="info"
                          onClick={() => openAlias(cp)} />
                        <AppIconActionButton icon={<DeleteIcon />} tooltip="삭제" color="error"
                          onClick={() => { setSelected(new Set([cp.id])); setDeleteResult(null); setDeleteDialogOpen(true); }} />
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {counterparties.length > 0 && (
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
                <TableCell colSpan={7} sx={{ fontWeight: 700 }}>합계</TableCell>
                <TableCell align="right" sx={{
                  fontWeight: 700,
                  fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums',
                  color: sums.outstanding_receivable > 0 ? 'error.main' : 'text.secondary',
                }}>
                  {formatAmount(sums.outstanding_receivable)}
                </TableCell>
                <TableCell align="right" sx={{
                  fontWeight: 700,
                  fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums',
                  color: sums.outstanding_payable > 0 ? 'warning.main' : 'text.secondary',
                }}>
                  {formatAmount(sums.outstanding_payable)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </AppTableShell>

      {/* ═══ 거래처 편집 다이얼로그 ═══ */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? '거래처 수정' : '새 거래처 등록'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="거래처명" value={formName} onChange={(e) => setFormName(e.target.value)} fullWidth required />
            <TextField label="사업자등록번호" value={formRegNo} onChange={(e) => setFormRegNo(e.target.value)} fullWidth />
            <Stack direction="row" spacing={2}>
              <FormControl fullWidth>
                <InputLabel>유형</InputLabel>
                <Select label="유형" value={formType} onChange={(e) => setFormType(e.target.value)}>
                  <MenuItem value="seller">매입처</MenuItem>
                  <MenuItem value="buyer">매출처</MenuItem>
                  <MenuItem value="both">매입/매출</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>소속 지사</InputLabel>
                <Select
                  label="소속 지사"
                  value={formBranchId}
                  onChange={(e) => setFormBranchId(e.target.value)}
                >
                  <MenuItem value="">미배정</MenuItem>
                  {branches.map((b) => (
                    <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <TextField label="담당자" value={formContact} onChange={(e) => setFormContact(e.target.value)} fullWidth />
            <TextField label="이메일" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} fullWidth type="email" />
            <TextField label="연락처" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button variant="contained" onClick={handleSave} disabled={!formName}>저장</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ 별칭 관리 다이얼로그 ═══ */}
      <Dialog open={aliasDialogOpen} onClose={() => setAliasDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>별칭 관리 - {aliasTarget?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              UPM에서 동일 거래처가 다른 이름으로 표기될 경우 별칭을 등록하면 자동 매칭됩니다.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <TextField size="small" placeholder="새 별칭 입력" value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()} fullWidth />
              <Button variant="contained" size="small" onClick={handleAddAlias} disabled={!newAlias}>추가</Button>
            </Stack>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1}>
              {aliasTarget?.aliases.map((a) => (
                <Stack key={a.id} direction="row" alignItems="center" justifyContent="space-between">
                  <Chip label={a.alias_name} variant="outlined" color="info" />
                  <Button size="small" color="error" onClick={() => handleDeleteAlias(a.id)}>삭제</Button>
                </Stack>
              ))}
              {aliasTarget?.aliases.length === 0 && (
                <Typography variant="body2" color="text.secondary">등록된 별칭이 없습니다.</Typography>
              )}
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAliasDialogOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ 삭제 확인 다이얼로그 ═══ */}
      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
        <Box sx={{ height: 4, bgcolor: 'error.main' }} />
        <DialogTitle sx={{ pt: 2.5, pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: 40, height: 40, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(theme.palette.error.main, 0.1) }}>
              <WarningIcon color="error" />
            </Box>
            <Typography variant="h6" fontWeight={700}>거래처 삭제 확인 ({selected.size}건)</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {deleteResult ? (
            <Box>
              <Alert severity={deleteResult.deleted_count > 0 ? 'success' : 'warning'} sx={{ mb: 2, borderRadius: 2 }}>
                <AlertTitle sx={{ fontWeight: 700 }}>삭제 결과</AlertTitle>
                <Typography variant="body2">
                  {deleteResult.deleted_count}건 삭제 완료
                  {deleteResult.skipped_count > 0 && ` / ${deleteResult.skipped_count}건 삭제 불가`}
                </Typography>
              </Alert>
              {deleteResult.deleted.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="success.main">삭제된 거래처:</Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    {deleteResult.deleted.map((d) => (
                      <Chip key={d.id} label={d.name} size="small" color="success" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                    ))}
                  </Stack>
                </Box>
              )}
              {deleteResult.skipped.length > 0 && (
                <Box>
                  <Button size="small" variant="text" color="warning"
                    onClick={() => setShowSkippedDetails((v) => !v)}
                    endIcon={showSkippedDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    sx={{ fontSize: '0.75rem', p: 0, mb: 0.5 }}>
                    삭제 불가 항목 {deleteResult.skipped.length}건
                  </Button>
                  <Collapse in={showSkippedDetails}>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                      {deleteResult.skipped.map((s, i) => (
                        <Typography key={i} variant="caption" display="block" color="text.secondary" sx={{ py: 0.2 }}>
                          &bull; <strong>{s.name}</strong>: {s.reason}
                        </Typography>
                      ))}
                    </Paper>
                  </Collapse>
                </Box>
              )}
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                선택한 {selected.size}건의 거래처를 삭제합니다.
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.02), borderColor: alpha(theme.palette.error.main, 0.2), mb: 2 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
                  <WarningIcon sx={{ fontSize: 16, color: 'error.main', mt: 0.2 }} />
                  <Typography variant="caption" fontWeight={700} color="error.dark">삭제 시 주의사항</Typography>
                </Stack>
                <Stack spacing={0.5} sx={{ ml: 3 }}>
                  {['삭제된 거래처는 복구할 수 없습니다.', '해당 거래처에 등록된 별칭도 함께 삭제됩니다.', '연결된 전표가 있는 거래처는 삭제할 수 없습니다 (자동으로 건너뜀).', '이후 엑셀 업로드 시 해당 거래처명은 미매칭으로 처리됩니다.'].map((text, i) => (
                    <Typography key={i} variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      &bull; {text}
                    </Typography>
                  ))}
                </Stack>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 200, overflow: 'auto', borderRadius: 1 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 1, display: 'block' }}>삭제 대상 목록:</Typography>
                {selectedCounterparties.map((cp) => (
                  <Stack key={cp.id} direction="row" spacing={1} alignItems="center" sx={{ py: 0.3 }}>
                    <BusinessIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                    <Typography variant="caption" sx={{ flex: 1 }}>{cp.name}</Typography>
                    <Chip label={typeLabels[cp.type] || cp.type} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
                    {cp.aliases.length > 0 && (
                      <Chip label={`별칭 ${cp.aliases.length}`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
                    )}
                  </Stack>
                ))}
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
          <Button onClick={() => { setDeleteDialogOpen(false); setDeleteResult(null); }} color="inherit" sx={{ fontWeight: 600 }}>
            {deleteResult ? '닫기' : '취소'}
          </Button>
          {!deleteResult && (
            <Button onClick={executeDelete} color="error" variant="contained" disabled={deleting}
              startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
              sx={{ fontWeight: 700, px: 3, borderRadius: 2 }}>
              {deleting ? '삭제 중...' : `${selected.size}건 삭제`}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ═══ 전체 삭제 확인 다이얼로그 ═══ */}
      <Dialog open={deleteAllDialogOpen} onClose={() => setDeleteAllDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="error" />
          테스트용 전체 삭제
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>경고</AlertTitle>
            모든 거래처 <strong>{total}건</strong>을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
          </Alert>
          <Typography variant="body2" color="text.secondary">• 전표가 연결된 거래처는 건너뛰어질 수 있습니다.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteAllDialogOpen(false)} disabled={deletingAll}>취소</Button>
          <Button variant="contained" color="error" onClick={handleDeleteAll} disabled={deletingAll}>
            {deletingAll ? '삭제 중...' : '전체 삭제'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
