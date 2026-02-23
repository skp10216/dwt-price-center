'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, TextField, InputAdornment,
  Table, TableBody, TableCell, TableHead, TableRow,
  Checkbox, Chip, Stack, ToggleButtonGroup, ToggleButton,
  CircularProgress, TablePagination, alpha, IconButton,
} from '@mui/material';
import {
  Search as SearchIcon,
  Close as CloseIcon,
  AccountBalance as BranchIcon,
  Star as StarIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

interface Branch {
  id: string;
  name: string;
  region: string | null;
}

interface CounterpartyRow {
  id: string;
  name: string;
  counterparty_type: string;
  is_favorite: boolean;
  branch_id: string | null;
  branch_name: string | null;
}

interface BranchAssignDialogProps {
  open: boolean;
  branch: Branch | null;
  onClose: () => void;
  onSaved: () => void;
}

type FilterMode = 'all' | 'unassigned' | 'current';

const TYPE_LABELS: Record<string, string> = {
  seller: '매입처',
  buyer: '매출처',
  both: '매입/매출',
};

export default function BranchAssignDialog({ open, branch, onClose, onSaved }: BranchAssignDialogProps) {
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [counterparties, setCounterparties] = useState<CounterpartyRow[]>([]);
  const [total, setTotal] = useState(0);

  // UI state
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Selection tracking
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [initialAssignedIds, setInitialAssignedIds] = useState<Set<string>>(new Set());

  const fetchCounterparties = useCallback(async () => {
    if (!branch) return;
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: page + 1,
        page_size: pageSize,
      };
      if (search) params.search = search;
      if (filter === 'unassigned') params.branch_id = 'unassigned';
      else if (filter === 'current') params.branch_id = branch.id;

      const res = await settlementApi.listCounterparties(params);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = res.data as any;
      const items: CounterpartyRow[] = (data.data?.counterparties || data.counterparties || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => ({
          id: c.id,
          name: c.name,
          counterparty_type: c.counterparty_type,
          is_favorite: c.is_favorite || false,
          branch_id: c.branch_id || null,
          branch_name: c.branch_name || null,
        }),
      );
      setCounterparties(items);
      setTotal(data.data?.total ?? data.total ?? 0);
    } catch {
      enqueueSnackbar('거래처 목록 조회에 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [branch, page, pageSize, search, filter, enqueueSnackbar]);

  // Initial load: fetch all and set initialAssignedIds
  useEffect(() => {
    if (!open || !branch) return;
    // Reset state on open
    setSearch('');
    setSearchInput('');
    setFilter('all');
    setPage(0);
    setPageSize(50);
    setCheckedIds(new Set());
    setInitialAssignedIds(new Set());

    // Fetch current branch's counterparties to build initial set
    (async () => {
      try {
        const res = await settlementApi.listCounterparties({
          branch_id: branch.id,
          page_size: 200,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = res.data as any;
        const items = data.data?.counterparties || data.counterparties || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids = new Set<string>(items.map((c: any) => c.id));
        setInitialAssignedIds(ids);
        setCheckedIds(new Set(ids));
      } catch {
        // ignore
      }
    })();
  }, [open, branch]);

  // Refetch when page/filter/search changes
  useEffect(() => {
    if (open && branch) {
      fetchCounterparties();
    }
  }, [open, branch, fetchCounterparties]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setSearch(searchInput);
      setPage(0);
    }
  };

  const handleFilterChange = (_: unknown, val: FilterMode | null) => {
    if (val) {
      setFilter(val);
      setPage(0);
    }
  };

  const handleToggle = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Compute diff
  const diff = useMemo(() => {
    const addIds: string[] = [];
    const removeIds: string[] = [];
    // newly checked (not in initial) → add
    checkedIds.forEach((id) => {
      if (!initialAssignedIds.has(id)) addIds.push(id);
    });
    // initially assigned but now unchecked → remove
    initialAssignedIds.forEach((id) => {
      if (!checkedIds.has(id)) removeIds.push(id);
    });
    return { addIds, removeIds };
  }, [checkedIds, initialAssignedIds]);

  const hasChanges = diff.addIds.length > 0 || diff.removeIds.length > 0;

  const handleSave = async () => {
    if (!branch || !hasChanges) return;
    setSaving(true);
    try {
      const res = await settlementApi.batchAssignBranch({
        branch_id: branch.id,
        add_ids: diff.addIds,
        remove_ids: diff.removeIds,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (res.data as any).data || res.data;
      const msgs: string[] = [];
      if (result.added_count > 0) msgs.push(`${result.added_count}건 배정`);
      if (result.removed_count > 0) msgs.push(`${result.removed_count}건 해제`);
      enqueueSnackbar(msgs.join(', ') || '변경사항 없음', { variant: 'success' });
      onSaved();
      onClose();
    } catch {
      enqueueSnackbar('배정 저장에 실패했습니다', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const getRowState = (cp: CounterpartyRow): 'current' | 'unassigned' | 'other' => {
    if (branch && cp.branch_id === branch.id) return 'current';
    if (!cp.branch_id) return 'unassigned';
    return 'other';
  };

  const assignedAfterSave = initialAssignedIds.size + diff.addIds.length - diff.removeIds.length;

  if (!branch) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <BranchIcon color="primary" />
            <Box>
              <Typography variant="h6" fontWeight={700} component="span">
                {branch.name}
              </Typography>
              <Typography variant="h6" fontWeight={400} component="span" color="text.secondary">
                {' '}— 거래처 배정
              </Typography>
            </Box>
          </Stack>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
          {branch.region && (
            <Typography variant="body2" color="text.secondary">
              지역: {branch.region}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            소속 거래처: <strong>{assignedAfterSave}개</strong>
            {hasChanges && (
              <Typography component="span" variant="body2" color="primary.main" sx={{ ml: 0.5 }}>
                ({diff.addIds.length > 0 ? `+${diff.addIds.length}` : ''}
                {diff.addIds.length > 0 && diff.removeIds.length > 0 ? ' / ' : ''}
                {diff.removeIds.length > 0 ? `-${diff.removeIds.length}` : ''})
              </Typography>
            )}
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* Toolbar */}
        <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 2, py: 1.5, bgcolor: 'background.default' }}>
          <TextField
            size="small"
            placeholder="거래처명 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{ width: 240 }}
          />
          <ToggleButtonGroup
            size="small"
            value={filter}
            exclusive
            onChange={handleFilterChange}
            sx={{
              '& .MuiToggleButton-root': {
                px: 1.5, py: 0.25, fontSize: '0.75rem', textTransform: 'none',
              },
            }}
          >
            <ToggleButton value="all">전체</ToggleButton>
            <ToggleButton value="unassigned">미배정</ToggleButton>
            <ToggleButton value="current">현재 지사</ToggleButton>
          </ToggleButtonGroup>
          <Box flex={1} />
          {loading && <CircularProgress size={18} />}
        </Stack>

        {/* Table */}
        <Box sx={{ overflow: 'auto', maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: 48 }} />
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>거래처명</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 100 }}>유형</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 140 }}>소속 지사</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && counterparties.length === 0 ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell padding="checkbox"><Box sx={{ width: 20, height: 20, bgcolor: 'action.hover', borderRadius: 0.5 }} /></TableCell>
                    <TableCell><Box sx={{ width: '60%', height: 16, bgcolor: 'action.hover', borderRadius: 0.5 }} /></TableCell>
                    <TableCell><Box sx={{ width: 50, height: 16, bgcolor: 'action.hover', borderRadius: 0.5 }} /></TableCell>
                    <TableCell><Box sx={{ width: 70, height: 16, bgcolor: 'action.hover', borderRadius: 0.5 }} /></TableCell>
                  </TableRow>
                ))
              ) : counterparties.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" color="text.disabled">
                      조건에 맞는 거래처가 없습니다
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                counterparties.map((cp) => {
                  const rowState = getRowState(cp);
                  const isOther = rowState === 'other';
                  const isChecked = checkedIds.has(cp.id);

                  return (
                    <TableRow
                      key={cp.id}
                      hover={!isOther}
                      onClick={() => !isOther && handleToggle(cp.id)}
                      sx={{
                        cursor: isOther ? 'default' : 'pointer',
                        transition: 'background 0.15s',
                        ...(isOther
                          ? { opacity: 0.5 }
                          : isChecked
                            ? {
                                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
                                '&:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1) },
                              }
                            : {}),
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={isOther ? false : isChecked}
                          disabled={isOther}
                          onChange={() => handleToggle(cp.id)}
                          onClick={(e) => e.stopPropagation()}
                          sx={isOther ? { opacity: 0.4 } : {}}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.75, px: 1.5 }}>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                          {cp.is_favorite && (
                            <StarIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                          )}
                          <Typography variant="body2" fontWeight={isChecked && !isOther ? 600 : 400}>
                            {cp.name}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ py: 0.75, px: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {TYPE_LABELS[cp.counterparty_type] || cp.counterparty_type}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.75, px: 1.5 }}>
                        {isChecked && !isOther ? (
                          <Chip
                            label={`${branch.name}`}
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                        ) : isOther ? (
                          <Chip
                            label={cp.branch_name || '다른 지사'}
                            size="small"
                            color="default"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.disabled">— 미배정</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Box>

        {/* Pagination */}
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage="페이지 크기"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} / 총 ${count}건`}
          sx={{ borderTop: 1, borderColor: 'divider' }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">취소</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {hasChanges
            ? [
                diff.addIds.length > 0 ? `${diff.addIds.length}건 배정` : '',
                diff.removeIds.length > 0 ? `${diff.removeIds.length}건 해제` : '',
              ].filter(Boolean).join(' / ')
            : '변경 없음'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
