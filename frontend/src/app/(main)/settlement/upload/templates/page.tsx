'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, Chip, Alert,
  MenuItem, Select, FormControl, InputLabel, alpha, useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

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
  const theme = useTheme();
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

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>업로드 템플릿 관리</Typography>
          <Typography variant="body2" color="text.secondary">
            Excel 파일의 컬럼과 시스템 필드를 매핑하는 템플릿을 관리합니다.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          템플릿 추가
        </Button>
      </Stack>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.info.main, 0.04) }}>
              <TableCell sx={{ fontWeight: 700 }}>기본</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>이름</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>타입</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>설명</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>수정일</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>관리</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 8 }}>로딩 중...</TableCell></TableRow>
            ) : templates.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 8 }}>등록된 템플릿이 없습니다</TableCell></TableRow>
            ) : (
              templates.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell>
                    {t.is_default ? <StarIcon fontSize="small" color="warning" /> : <StarBorderIcon fontSize="small" color="disabled" />}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                  <TableCell>
                    <Chip label={t.voucher_type === 'sales' ? '판매' : '매입'} size="small" color={t.voucher_type === 'sales' ? 'primary' : 'secondary'} variant="outlined" />
                  </TableCell>
                  <TableCell>{t.description || '-'}</TableCell>
                  <TableCell>{new Date(t.updated_at).toLocaleDateString('ko-KR')}</TableCell>
                  <TableCell align="center">
                    <Tooltip title="수정"><IconButton size="small" onClick={() => openEdit(t)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="삭제"><IconButton size="small" color="error" onClick={() => handleDelete(t.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

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
    </Box>
  );
}
