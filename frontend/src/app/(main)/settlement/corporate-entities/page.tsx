'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, IconButton, Button, TextField, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, Grid, InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Business as EntityIcon,
} from '@mui/icons-material';
import { settlementApi, getErrorMessage } from '@/lib/api';
import { useSnackbar } from 'notistack';
import {
  AppPageContainer,
  AppPageHeader,
  AppPageToolbar,
  AppTableShell,
} from '@/components/ui';

// ─── 타입 ──────────────────────────────────────────────────────────

interface CorporateEntity {
  id: string;
  name: string;
  code: string | null;
  business_number: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 법인 관리 페이지
 * 법인(CorporateEntity) CRUD - 은행 임포트 시 어느 법인 계좌인지 선택하는 데 사용
 */
export default function CorporateEntitiesPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [entities, setEntities] = useState<CorporateEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 다이얼로그
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CorporateEntity | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    business_number: '',
    memo: '',
    is_active: true,
  });

  // ─── 데이터 로드 ──────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = { page_size: 100 };
      if (search) params.search = search;

      const res = await settlementApi.listCorporateEntities(params);
      const data = res.data as unknown as { corporate_entities: CorporateEntity[]; total: number };
      setEntities(data.corporate_entities || []);
      setTotal(data.total || 0);
    } catch {
      enqueueSnackbar('법인 목록 조회에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [search, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── 다이얼로그 ────────────────────────────────────────────────

  const openDialog = (entity?: CorporateEntity) => {
    if (entity) {
      setEditing(entity);
      setFormData({
        name: entity.name,
        code: entity.code || '',
        business_number: entity.business_number || '',
        memo: entity.memo || '',
        is_active: entity.is_active,
      });
    } else {
      setEditing(null);
      setFormData({ name: '', code: '', business_number: '', memo: '', is_active: true });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (saving || !formData.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim() || null,
        business_number: formData.business_number.trim() || null,
        memo: formData.memo.trim() || null,
        is_active: formData.is_active,
      };

      if (editing) {
        await settlementApi.updateCorporateEntity(editing.id, payload);
        enqueueSnackbar('법인이 수정되었습니다.', { variant: 'success' });
      } else {
        await settlementApi.createCorporateEntity(payload);
        enqueueSnackbar('법인이 등록되었습니다.', { variant: 'success' });
      }
      setDialogOpen(false);
      loadData();
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, '저장에 실패했습니다.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ─── 삭제 ──────────────────────────────────────────────────────

  const handleDelete = async (entity: CorporateEntity) => {
    if (!confirm(`법인 "${entity.name}"을(를) 삭제하시겠습니까?`)) return;
    try {
      await settlementApi.deleteCorporateEntity(entity.id);
      enqueueSnackbar('법인이 삭제되었습니다.', { variant: 'success' });
      loadData();
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, '삭제에 실패했습니다.'), { variant: 'error' });
    }
  };

  // ─── 렌더 ──────────────────────────────────────────────────────

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<EntityIcon />}
        title="법인 관리"
        description="은행 임포트 시 입출금이 어느 법인을 통해 이루어졌는지 추적하기 위한 법인 마스터"
        color="info"
        count={total}
        actions={[{
          label: '법인 등록',
          onClick: () => openDialog(),
          variant: 'contained' as const,
          icon: <AddIcon />,
        }]}
      />

      <AppPageToolbar
        left={
          <TextField
            size="small"
            placeholder="법인명/코드/사업자번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 250 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
              ),
            }}
          />
        }
      />

      <AppTableShell
        loading={loading}
        isEmpty={entities.length === 0}
        emptyMessage="등록된 법인이 없습니다. '법인 등록' 버튼으로 추가하세요."
        hidePagination
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>법인명</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>코드</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>사업자등록번호</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>메모</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>상태</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>액션</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entities.map((entity) => (
              <TableRow key={entity.id} hover sx={{ opacity: entity.is_active ? 1 : 0.5 }}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{entity.name}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{entity.code || '-'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{entity.business_number || '-'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                    {entity.memo || '-'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={entity.is_active ? '활성' : '비활성'}
                    color={entity.is_active ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    <Tooltip title="수정">
                      <IconButton size="small" color="primary" onClick={() => openDialog(entity)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="삭제">
                      <IconButton size="small" color="error" onClick={() => handleDelete(entity)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AppTableShell>

      {/* 생성/수정 Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? '법인 수정' : '법인 등록'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="법인명"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="예: 다원트레이드(주)"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="법인 코드"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="예: DWT-01"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="사업자등록번호"
                value={formData.business_number}
                onChange={(e) => setFormData({ ...formData, business_number: e.target.value })}
                placeholder="예: 123-45-67890"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="메모"
                value={formData.memo}
                onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!formData.name.trim() || saving}
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
