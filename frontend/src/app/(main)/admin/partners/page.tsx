/**
 * 단가표 통합 관리 시스템 - 거래처 관리 페이지 (관리자)
 */

'use client';

import { useState, useEffect } from 'react';
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
} from '@mui/material';
import { Search as SearchIcon, Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import { partnersApi } from '@/lib/api';

interface Partner {
  id: string;
  name: string;
  region: string | null;
  contact_info: string | null;
  memo: string | null;
  is_active: boolean;
}

export default function PartnersPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    region: '',
    contact_info: '',
    memo: '',
  });

  // 거래처 목록 조회
  const fetchPartners = async () => {
    setLoading(true);
    try {
      const response = await partnersApi.list({ search: search || undefined });
      setPartners(response.data.data.partners as Partner[]);
    } catch (error) {
      enqueueSnackbar('거래처 목록을 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [search]);

  // 다이얼로그 열기
  const openDialog = (partner?: Partner) => {
    if (partner) {
      setEditingPartner(partner);
      setFormData({
        name: partner.name,
        region: partner.region || '',
        contact_info: partner.contact_info || '',
        memo: partner.memo || '',
      });
    } else {
      setEditingPartner(null);
      setFormData({ name: '', region: '', contact_info: '', memo: '' });
    }
    setDialogOpen(true);
  };

  // 저장
  const handleSave = async () => {
    try {
      const data = {
        ...formData,
        region: formData.region || null,
        contact_info: formData.contact_info || null,
        memo: formData.memo || null,
      };

      if (editingPartner) {
        await partnersApi.update(editingPartner.id, data);
        enqueueSnackbar('거래처가 수정되었습니다', { variant: 'success' });
      } else {
        await partnersApi.create(data);
        enqueueSnackbar('거래처가 생성되었습니다', { variant: 'success' });
      }
      setDialogOpen(false);
      fetchPartners();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '저장에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };

  // 활성/비활성 토글
  const handleToggleActive = async (partner: Partner) => {
    try {
      await partnersApi.update(partner.id, { is_active: !partner.is_active });
      enqueueSnackbar(
        partner.is_active ? '거래처가 비활성화되었습니다' : '거래처가 활성화되었습니다',
        { variant: 'success' }
      );
      fetchPartners();
    } catch (error) {
      enqueueSnackbar('상태 변경에 실패했습니다', { variant: 'error' });
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'is_active',
      headerName: '상태',
      width: 80,
      renderCell: (params) => (
        <Chip
          label={params.row.is_active ? '활성' : '비활성'}
          color={params.row.is_active ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    { field: 'name', headerName: '거래처명', width: 150, flex: 1 },
    { field: 'region', headerName: '지역', width: 120 },
    { field: 'contact_info', headerName: '연락처', width: 150 },
    {
      field: 'actions',
      type: 'actions',
      headerName: '',
      width: 100,
      getActions: (params) => [
        <GridActionsCellItem
          key="edit"
          icon={<EditIcon />}
          label="수정"
          onClick={() => openDialog(params.row as Partner)}
        />,
      ],
    },
  ];

  return (
    <Box>
      <PageHeader
        title="거래처 관리"
        description="거래처를 등록하고 관리합니다"
        action={{
          label: '거래처 등록',
          onClick: () => openDialog(),
        }}
      />

      {/* 검색 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
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
    </Box>
  );
}
