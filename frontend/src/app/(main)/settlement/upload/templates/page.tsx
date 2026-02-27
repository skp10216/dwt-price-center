'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, Stack, IconButton, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, Chip,
  MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Description as TemplateIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import {
  AppPageContainer,
  AppPageHeader,
  AppDataTable,
  type AppColumnDef,
} from '@/components/ui';

interface UploadTemplate {
  id: string;
  name: string;
  voucher_type: string;
  is_default: boolean;
  description: string | null;
  column_mapping: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/**
 * 업로드 템플릿 관리 페이지
 */
export default function UploadTemplatesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [templates, setTemplates] = useState<UploadTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UploadTemplate | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'sales' | 'purchase'>('sales');
  const [formDesc, setFormDesc] = useState('');
  const [formMapping, setFormMapping] = useState('');
  const [formDefault, setFormDefault] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.listUploadTemplates();
      const data = res.data as unknown as { templates: UploadTemplate[]; total: number };
      setTemplates(data.templates || []);
    } catch {
      // handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormType('sales');
    setFormDesc('');
    setFormMapping(JSON.stringify({
      "거래일": "trade_date",
      "거래처": "counterparty_name",
      "전표번호": "voucher_number",
      "수량": "quantity",
      "금액": "amount"
    }, null, 2));
    setFormDefault(false);
    setDialogOpen(true);
  };

  const openEdit = (t: UploadTemplate) => {
    setEditing(t);
    setFormName(t.name);
    setFormType(t.voucher_type as 'sales' | 'purchase');
    setFormDesc(t.description || '');
    setFormMapping(JSON.stringify(t.column_mapping, null, 2));
    setFormDefault(t.is_default);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      let mapping: Record<string, string>;
      try { mapping = JSON.parse(formMapping); } catch { enqueueSnackbar('컬럼 매핑 JSON 형식이 올바르지 않습니다', { variant: 'error' }); return; }

      const data = { name: formName, voucher_type: formType, description: formDesc || null, column_mapping: mapping, is_default: formDefault };
      if (editing) {
        await settlementApi.updateUploadTemplate(editing.id, data);
        enqueueSnackbar('템플릿이 수정되었습니다', { variant: 'success' });
      } else {
        await settlementApi.createUploadTemplate(data);
        enqueueSnackbar('템플릿이 생성되었습니다', { variant: 'success' });
      }
      setDialogOpen(false);
      loadTemplates();
    } catch {
      enqueueSnackbar('저장에 실패했습니다', { variant: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
    try {
      await settlementApi.deleteUploadTemplate(id);
      enqueueSnackbar('템플릿이 삭제되었습니다', { variant: 'success' });
      loadTemplates();
    } catch {
      enqueueSnackbar('삭제에 실패했습니다', { variant: 'error' });
    }
  };

  // ─── 컬럼 정의 ──────────────────────────────────────────────────

  const columns = useMemo<AppColumnDef<UploadTemplate>[]>(() => [
    {
      field: 'is_default',
      headerName: '기본',
      sortable: false,
      width: 60,
      renderCell: (row) => (
        row.is_default
          ? <StarIcon fontSize="small" color="warning" />
          : <StarBorderIcon fontSize="small" color="disabled" />
      ),
    },
    {
      field: 'name',
      headerName: '이름',
      cellSx: { fontWeight: 600 },
    },
    {
      field: 'voucher_type',
      headerName: '타입',
      sortable: false,
      renderCell: (row) => (
        <Chip
          label={row.voucher_type === 'sales' ? '판매' : '매입'}
          size="small"
          color={row.voucher_type === 'sales' ? 'primary' : 'secondary'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'description',
      headerName: '설명',
      sortable: false,
      renderCell: (row) => (
        <Typography variant="body2" color="text.secondary">
          {row.description || '-'}
        </Typography>
      ),
    },
    {
      field: 'updated_at',
      headerName: '수정일',
      renderCell: (row) => new Date(row.updated_at).toLocaleDateString('ko-KR'),
    },
  ], []);

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<TemplateIcon />}
        title="업로드 템플릿 관리"
        description="Excel 파일의 컬럼과 시스템 필드를 매핑하는 템플릿을 관리합니다"
        color="info"
        count={loading ? null : templates.length}
        onRefresh={loadTemplates}
        loading={loading}
        actions={[
          {
            label: '템플릿 추가',
            onClick: openCreate,
            variant: 'contained' as const,
            icon: <AddIcon />,
          },
        ]}
      />

      <AppDataTable<UploadTemplate>
        columns={columns}
        rows={templates}
        getRowKey={(r) => r.id}
        defaultSortField="updated_at"
        defaultSortOrder="desc"
        loading={loading}
        emptyMessage="등록된 템플릿이 없습니다"
        emptyIcon={<TemplateIcon sx={{ fontSize: 40, opacity: 0.4 }} />}
        renderActions={(t) => (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
            <Tooltip title="수정">
              <IconButton size="small" onClick={() => openEdit(t)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="삭제">
              <IconButton size="small" color="error" onClick={() => handleDelete(t.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      />

      {/* 템플릿 편집 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? '템플릿 수정' : '새 템플릿'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="이름" value={formName} onChange={(e) => setFormName(e.target.value)} fullWidth />
            <FormControl fullWidth>
              <InputLabel>타입</InputLabel>
              <Select label="타입" value={formType} onChange={(e) => setFormType(e.target.value as 'sales' | 'purchase')}>
                <MenuItem value="sales">판매</MenuItem>
                <MenuItem value="purchase">매입</MenuItem>
              </Select>
            </FormControl>
            <TextField label="설명" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} fullWidth multiline rows={2} />
            <TextField
              label="컬럼 매핑 (JSON)"
              value={formMapping}
              onChange={(e) => setFormMapping(e.target.value)}
              fullWidth
              multiline
              rows={6}
              helperText='Excel 컬럼명 → 시스템 필드명 매핑. 예: {"거래일": "trade_date"}'
              sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace', fontSize: '0.85rem' } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button variant="contained" onClick={handleSave} disabled={!formName || !formMapping}>저장</Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}
