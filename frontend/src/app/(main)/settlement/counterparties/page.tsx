'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip,
  MenuItem, Select, FormControl, InputLabel, InputAdornment, alpha,
  useTheme, Divider, Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Business as BusinessIcon,
  Visibility as ViewIcon,
  LocalOffer as AliasIcon,
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

  const loadCounterparties = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = { page: page + 1, page_size: pageSize };
      if (search) params.search = search;
      const res = await settlementApi.listCounterparties(params);
      const data = res.data as { counterparties: CounterpartyRow[]; total: number };
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
      // Refresh alias target
      const res = await settlementApi.getCounterparty(aliasTarget.id);
      setAliasTarget(res.data as CounterpartyRow);
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
      setAliasTarget(res.data as CounterpartyRow);
    } catch {
      enqueueSnackbar('별칭 삭제에 실패했습니다', { variant: 'error' });
    }
  };

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
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          거래처 등록
        </Button>
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
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 8 }}>로딩 중...</TableCell></TableRow>
            ) : counterparties.length === 0 ? (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                <BusinessIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">등록된 거래처가 없습니다</Typography>
              </TableCell></TableRow>
            ) : (
              counterparties.map((cp) => (
                <TableRow key={cp.id} hover>
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
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
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

      {/* 거래처 편집 다이얼로그 */}
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

      {/* 별칭 관리 다이얼로그 */}
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
    </Box>
  );
}
