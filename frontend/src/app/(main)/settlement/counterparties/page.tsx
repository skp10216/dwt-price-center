'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip,
  MenuItem, Select, FormControl, InputLabel, InputAdornment, alpha,
  useTheme, Divider, Checkbox, Alert, AlertTitle, CircularProgress,
  Collapse,
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
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

interface CounterpartyRow {
  id: string;
  name: string;
  registration_number: string | null;
  type: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  aliases: Array<{ id: string; alias_name: string }>;
  total_sales: number;
  total_purchases: number;
  outstanding_receivable: number;
  outstanding_payable: number;
}

const typeLabels: Record<string, string> = { seller: '매입처', buyer: '매출처', both: '매입/매출' };

/**
 * 거래처 관리 페이지
 * - 목록 / 검색
 * - 등록 / 수정
 * - 별칭 관리
 * - 개별 삭제 / 멀티 선택 삭제
 */
export default function CounterpartiesPage() {
  const theme = useTheme();
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();

  const [counterparties, setCounterparties] = useState<CounterpartyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CounterpartyRow | null>(null);
  const [formName, setFormName] = useState('');
  const [formRegNo, setFormRegNo] = useState('');
  const [formType, setFormType] = useState<string>('both');
  const [formContact, setFormContact] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');

  // 별칭 다이얼로그
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [aliasTarget, setAliasTarget] = useState<CounterpartyRow | null>(null);
  const [newAlias, setNewAlias] = useState('');

  // 삭제 관련
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

  const loadCounterparties = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = { page: page + 1, page_size: pageSize };
      if (search) params.search = search;
      const res = await settlementApi.listCounterparties(params);
      const data = res.data as unknown as { counterparties: CounterpartyRow[]; total: number };
      setCounterparties(data.counterparties || []);
      setTotal(data.total || 0);
    } catch {
      // handle
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { loadCounterparties(); }, [loadCounterparties]);

  const openCreate = () => {
    setEditing(null);
    setFormName(''); setFormRegNo(''); setFormType('both');
    setFormContact(''); setFormEmail(''); setFormPhone('');
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
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        name: formName,
        registration_number: formRegNo || null,
        type: formType,
        contact_person: formContact || null,
        contact_email: formEmail || null,
        contact_phone: formPhone || null,
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

  // ─── 체크박스 핸들러 ───
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

  // ─── 삭제 실행 ───
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
      if (result.deleted_count > 0) {
        enqueueSnackbar(`${result.deleted_count}건 삭제 완료`, { variant: 'success' });
      }
      if (result.skipped_count > 0) {
        enqueueSnackbar(`${result.skipped_count}건은 전표 연결로 삭제 불가`, { variant: 'warning' });
      }
      setSelected(new Set());
      loadCounterparties();
    } catch {
      enqueueSnackbar('삭제에 실패했습니다', { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const selectedCounterparties = counterparties.filter((cp) => selected.has(cp.id));

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('ko-KR').format(amount);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>거래처 관리</Typography>
          <Typography variant="body2" color="text.secondary">
            거래처 목록, 별칭 관리, 미수/미지급 요약을 확인합니다.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {selected.size > 0 && (
            <Button variant="contained" color="error" size="small" startIcon={<DeleteIcon />}
              onClick={handleDeleteConfirm}>
              {selected.size}건 삭제
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            거래처 등록
          </Button>
        </Stack>
      </Stack>

      {/* 검색 */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            size="small"
            placeholder="거래처명/사업자번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadCounterparties()}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 280 }}
          />
          <Button variant="contained" size="small" onClick={loadCounterparties}>조회</Button>
        </Stack>
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.info.main, 0.04) }}>
              <TableCell padding="checkbox" sx={{ width: 42 }}>
                <Checkbox size="small" indeterminate={isSomeSelected} checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)} />
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>거래처명</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>사업자번호</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>유형</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>별칭</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>미수</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>미지급</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>담당자</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>관리</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              // Skeleton 로딩 상태
              [...Array(5)].map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell padding="checkbox"><Box sx={{ width: 18, height: 18, bgcolor: 'action.hover', borderRadius: 0.5 }} /></TableCell>
                  <TableCell><Box sx={{ width: '70%', height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                  <TableCell><Box sx={{ width: 80, height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                  <TableCell><Box sx={{ width: 50, height: 22, bgcolor: 'action.hover', borderRadius: 2 }} /></TableCell>
                  <TableCell><Box sx={{ width: 60, height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                  <TableCell align="right"><Box sx={{ width: 60, height: 20, bgcolor: 'action.hover', borderRadius: 1, ml: 'auto' }} /></TableCell>
                  <TableCell align="right"><Box sx={{ width: 60, height: 20, bgcolor: 'action.hover', borderRadius: 1, ml: 'auto' }} /></TableCell>
                  <TableCell><Box sx={{ width: 50, height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                  <TableCell><Box sx={{ width: 80, height: 24, bgcolor: 'action.hover', borderRadius: 1, mx: 'auto' }} /></TableCell>
                </TableRow>
              ))
            ) : counterparties.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 10 }}>
                  <Box sx={{
                    width: 72, height: 72, borderRadius: '50%', mx: 'auto', mb: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <BusinessIcon sx={{ fontSize: 36, color: 'primary.main' }} />
                  </Box>
                  <Typography variant="h6" fontWeight={600} gutterBottom>등록된 거래처가 없습니다</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    새 거래처를 등록하여 시작하세요
                  </Typography>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => openDialog()}
                    sx={{ borderRadius: 2, fontWeight: 600 }}>
                    거래처 등록
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              counterparties.map((cp) => {
                const isChecked = selected.has(cp.id);
                return (
                  <TableRow key={cp.id} hover selected={isChecked}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={isChecked}
                        onChange={(e) => handleSelectOne(cp.id, e.target.checked)} />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <BusinessIcon fontSize="small" color="action" />
                        <span>{cp.name}</span>
                        {!cp.is_active && <Chip label="비활성" size="small" color="default" />}
                      </Stack>
                    </TableCell>
                    <TableCell>{cp.registration_number || '-'}</TableCell>
                    <TableCell>
                      <Chip label={typeLabels[cp.type] || cp.type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {cp.aliases.slice(0, 3).map((a) => (
                          <Chip key={a.id} label={a.alias_name} size="small" variant="outlined" color="info" />
                        ))}
                        {cp.aliases.length > 3 && <Chip label={`+${cp.aliases.length - 3}`} size="small" />}
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ color: cp.outstanding_receivable > 0 ? 'error.main' : 'text.secondary', fontWeight: 600 }}>
                      {formatAmount(cp.outstanding_receivable)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: cp.outstanding_payable > 0 ? 'warning.main' : 'text.secondary', fontWeight: 600 }}>
                      {formatAmount(cp.outstanding_payable)}
                    </TableCell>
                    <TableCell>{cp.contact_person || '-'}</TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="상세/요약"><IconButton size="small" color="primary" onClick={() => router.push(`/settlement/counterparties/${cp.id}`)}><ViewIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="수정"><IconButton size="small" onClick={() => openEdit(cp)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="별칭 관리"><IconButton size="small" color="info" onClick={() => openAlias(cp)}><AliasIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="삭제"><IconButton size="small" color="error" onClick={() => { setSelected(new Set([cp.id])); setDeleteResult(null); setDeleteDialogOpen(true); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="페이지당 행:"
        />
      </TableContainer>

      {/* ═══════════════════════════════════════════════════════════════════════
          거래처 편집 다이얼로그
          ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? '거래처 수정' : '새 거래처 등록'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="거래처명" value={formName} onChange={(e) => setFormName(e.target.value)} fullWidth required />
            <TextField label="사업자등록번호" value={formRegNo} onChange={(e) => setFormRegNo(e.target.value)} fullWidth />
            <FormControl fullWidth>
              <InputLabel>유형</InputLabel>
              <Select label="유형" value={formType} onChange={(e) => setFormType(e.target.value)}>
                <MenuItem value="seller">매입처</MenuItem>
                <MenuItem value="buyer">매출처</MenuItem>
                <MenuItem value="both">매입/매출</MenuItem>
              </Select>
            </FormControl>
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

      {/* ═══════════════════════════════════════════════════════════════════════
          별칭 관리 다이얼로그
          ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={aliasDialogOpen} onClose={() => setAliasDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          별칭 관리 - {aliasTarget?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              UPM에서 동일 거래처가 다른 이름으로 표기될 경우 별칭을 등록하면 자동 매칭됩니다.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <TextField
                size="small"
                placeholder="새 별칭 입력"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
                fullWidth
              />
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

      {/* ═══════════════════════════════════════════════════════════════════════
          삭제 확인 다이얼로그 (리스크 안내 포함)
          ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !deleting && setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        {/* 상단 경고 색상 바 */}
        <Box sx={{ height: 4, bgcolor: 'error.main' }} />
        <DialogTitle sx={{ pt: 2.5, pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: 40, height: 40, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(theme.palette.error.main, 0.1) }}>
              <WarningIcon color="error" />
            </Box>
            <Typography variant="h6" fontWeight={700}>
              거래처 삭제 확인 ({selected.size}건)
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ pt: 1 }}>
          {/* 삭제 결과가 있으면 결과 표시 */}
          {deleteResult ? (
            <Box>
              <Alert severity={deleteResult.deleted_count > 0 ? 'success' : 'warning'} sx={{ mb: 2, borderRadius: 2 }}>
                <AlertTitle sx={{ fontWeight: 700 }}>삭제 결과</AlertTitle>
                <Typography variant="body2">
                  ✅ {deleteResult.deleted_count}건 삭제 완료
                  {deleteResult.skipped_count > 0 && ` / ⚠ ${deleteResult.skipped_count}건 삭제 불가`}
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
                          • <strong>{s.name}</strong>: {s.reason}
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

              {/* 리스크 안내 */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.02), borderColor: alpha(theme.palette.error.main, 0.2), mb: 2 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
                  <WarningIcon sx={{ fontSize: 16, color: 'error.main', mt: 0.2 }} />
                  <Typography variant="caption" fontWeight={700} color="error.dark">삭제 시 주의사항</Typography>
                </Stack>
                <Stack spacing={0.5} sx={{ ml: 3 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    •  삭제된 거래처는 <strong>복구할 수 없습니다.</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    •  해당 거래처에 등록된 <strong>별칭도 함께 삭제</strong>됩니다.
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    •  <strong>연결된 전표가 있는 거래처</strong>는 삭제할 수 없습니다 (자동으로 건너뜀).
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    •  이후 엑셀 업로드 시 해당 거래처명은 <strong>미매칭으로 처리</strong>됩니다.
                  </Typography>
                </Stack>
              </Paper>

              {/* 삭제 대상 목록 */}
              <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 200, overflow: 'auto', borderRadius: 1 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  삭제 대상 목록:
                </Typography>
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
            <Button
              onClick={executeDelete}
              color="error"
              variant="contained"
              disabled={deleting}
              startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
              sx={{ fontWeight: 700, px: 3, borderRadius: 2 }}
            >
              {deleting ? '삭제 중...' : `${selected.size}건 삭제`}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
