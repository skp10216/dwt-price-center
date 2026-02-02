/**
 * 단가표 통합 관리 시스템 - SSOT 모델 관리 페이지 (관리자)
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  IconButton,
  Typography,
  Stack,
  InputAdornment,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams, GridActionsCellItem } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { useForm, Controller } from 'react-hook-form';
import PageHeader from '@/components/ui/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ssotModelsApi, gradesApi } from '@/lib/api';

interface Model {
  id: string;
  model_code: string;
  device_type: string;
  manufacturer: string;
  series: string;
  model_name: string;
  storage_gb: number;
  storage_display: string;
  full_name: string;
  connectivity: string;
  is_active: boolean;
  grade_prices: { grade_id: string; grade_name: string; price: number }[];
}

interface Grade {
  id: string;
  name: string;
}

const deviceTypes = [
  { value: 'smartphone', label: '스마트폰' },
  { value: 'tablet', label: '태블릿' },
  { value: 'wearable', label: '웨어러블' },
];

const manufacturers = [
  { value: 'apple', label: '애플' },
  { value: 'samsung', label: '삼성' },
  { value: 'other', label: '기타' },
];

const connectivityOptions: Record<string, { value: string; label: string }[]> = {
  smartphone: [{ value: 'lte', label: 'LTE' }],
  tablet: [
    { value: 'wifi', label: 'WiFi' },
    { value: 'wifi_cellular', label: 'WiFi+Cellular' },
  ],
  wearable: [{ value: 'standard', label: 'Standard' }],
};

export default function ModelsPage() {
  const { enqueueSnackbar } = useSnackbar();
  
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<Model[]>([]);
  const [total, setTotal] = useState(0);
  const [grades, setGrades] = useState<Grade[]>([]);
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [deactivateDialog, setDeactivateDialog] = useState<{ open: boolean; model: Model | null }>({
    open: false,
    model: null,
  });
  
  const { control, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      model_code: '',
      device_type: 'smartphone',
      manufacturer: 'apple',
      series: '',
      model_name: '',
      storage_gb: 128,
      connectivity: 'lte',
    },
  });
  
  const watchDeviceType = watch('device_type');
  
  // 등급 목록 조회
  useEffect(() => {
    const fetchGrades = async () => {
      try {
        const response = await gradesApi.list({ is_active: true });
        setGrades(response.data.data.grades as Grade[]);
      } catch (error) {
        // 조용히 실패
      }
    };
    fetchGrades();
  }, []);
  
  // 모델 목록 조회
  useEffect(() => {
    const fetchModels = async () => {
      setLoading(true);
      try {
        const response = await ssotModelsApi.list({
          page: page + 1,
          page_size: pageSize,
          search: search || undefined,
          device_type: deviceType || undefined,
          manufacturer: manufacturer || undefined,
        });
        const data = response.data.data;
        setModels(data.models as Model[]);
        setTotal(data.total);
      } catch (error) {
        enqueueSnackbar('모델 목록을 불러오는데 실패했습니다', { variant: 'error' });
      } finally {
        setLoading(false);
      }
    };
    fetchModels();
  }, [page, pageSize, search, deviceType, manufacturer, enqueueSnackbar]);
  
  // device_type 변경 시 connectivity 자동 설정
  useEffect(() => {
    const defaultConnectivity = connectivityOptions[watchDeviceType]?.[0]?.value || 'lte';
    setValue('connectivity', defaultConnectivity);
  }, [watchDeviceType, setValue]);
  
  const handleOpenDialog = (model?: Model) => {
    if (model) {
      setEditingModel(model);
      reset({
        model_code: model.model_code,
        device_type: model.device_type,
        manufacturer: model.manufacturer,
        series: model.series,
        model_name: model.model_name,
        storage_gb: model.storage_gb,
        connectivity: model.connectivity,
      });
    } else {
      setEditingModel(null);
      reset({
        model_code: '',
        device_type: 'smartphone',
        manufacturer: 'apple',
        series: '',
        model_name: '',
        storage_gb: 128,
        connectivity: 'lte',
      });
    }
    setDialogOpen(true);
  };
  
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingModel(null);
  };
  
  const onSubmit = async (data: any) => {
    try {
      if (editingModel) {
        await ssotModelsApi.update(editingModel.id, data);
        enqueueSnackbar('모델이 수정되었습니다', { variant: 'success' });
      } else {
        await ssotModelsApi.create(data);
        enqueueSnackbar('모델이 생성되었습니다', { variant: 'success' });
      }
      handleCloseDialog();
      // 목록 새로고침
      setPage(0);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '저장에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };
  
  const handleToggleActive = async () => {
    if (!deactivateDialog.model) return;
    
    try {
      await ssotModelsApi.update(deactivateDialog.model.id, {
        is_active: !deactivateDialog.model.is_active,
      });
      enqueueSnackbar(
        deactivateDialog.model.is_active ? '모델이 비활성화되었습니다' : '모델이 활성화되었습니다',
        { variant: 'success' }
      );
      setDeactivateDialog({ open: false, model: null });
      setPage(0);
    } catch (error) {
      enqueueSnackbar('상태 변경에 실패했습니다', { variant: 'error' });
    }
  };
  
  const columns: GridColDef[] = [
    {
      field: 'is_active',
      headerName: '상태',
      width: 80,
      renderCell: (params: GridRenderCellParams<Model>) => (
        <Chip
          label={params.row.is_active ? '활성' : '비활성'}
          color={params.row.is_active ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    { field: 'model_code', headerName: '모델코드', width: 120 },
    {
      field: 'device_type',
      headerName: '타입',
      width: 100,
      renderCell: (params) =>
        deviceTypes.find((d) => d.value === params.value)?.label || params.value,
    },
    {
      field: 'manufacturer',
      headerName: '제조사',
      width: 80,
      renderCell: (params) =>
        manufacturers.find((m) => m.value === params.value)?.label || params.value,
    },
    { field: 'series', headerName: '시리즈', width: 130 },
    { field: 'full_name', headerName: '모델명', width: 250, flex: 1 },
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
          onClick={() => handleOpenDialog(params.row as Model)}
        />,
        <GridActionsCellItem
          key="toggle"
          icon={params.row.is_active ? <VisibilityOffIcon /> : <VisibilityIcon />}
          label={params.row.is_active ? '비활성화' : '활성화'}
          onClick={() => setDeactivateDialog({ open: true, model: params.row as Model })}
        />,
      ],
    },
  ];
  
  return (
    <Box>
      <PageHeader
        title="SSOT 모델 관리"
        description="모델 등록/편집/비활성화 및 등급별 기본가 관리"
        action={{
          label: '모델 등록',
          onClick: () => handleOpenDialog(),
        }}
      />
      
      {/* 필터 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              placeholder="모델명/모델코드 검색"
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
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>타입</InputLabel>
              <Select value={deviceType} label="타입" onChange={(e) => setDeviceType(e.target.value)}>
                <MenuItem value="">전체</MenuItem>
                {deviceTypes.map((d) => (
                  <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>제조사</InputLabel>
              <Select value={manufacturer} label="제조사" onChange={(e) => setManufacturer(e.target.value)}>
                <MenuItem value="">전체</MenuItem>
                {manufacturers.map((m) => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>
      
      {/* 테이블 */}
      <Card>
        <DataGrid
          rows={models}
          columns={columns}
          rowCount={total}
          loading={loading}
          pageSizeOptions={[25, 50, 100]}
          paginationModel={{ page, pageSize }}
          paginationMode="server"
          onPaginationModelChange={(model) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          disableRowSelectionOnClick
          autoHeight
        />
      </Card>
      
      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingModel ? '모델 수정' : '모델 등록'}</DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Controller
                  name="model_code"
                  control={control}
                  rules={{ required: '모델코드를 입력하세요' }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="모델코드"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={6}>
                <Controller
                  name="device_type"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel>타입</InputLabel>
                      <Select {...field} label="타입">
                        {deviceTypes.map((d) => (
                          <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>
              <Grid item xs={6}>
                <Controller
                  name="manufacturer"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel>제조사</InputLabel>
                      <Select {...field} label="제조사">
                        {manufacturers.map((m) => (
                          <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="series"
                  control={control}
                  rules={{ required: '시리즈를 입력하세요' }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="시리즈"
                      placeholder="예: iPhone 15, Galaxy S24"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="model_name"
                  control={control}
                  rules={{ required: '모델명을 입력하세요' }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="모델명"
                      placeholder="예: iPhone 15 Pro Max"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={6}>
                <Controller
                  name="storage_gb"
                  control={control}
                  rules={{ required: '스토리지를 입력하세요' }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      type="number"
                      label="스토리지 (GB)"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={6}>
                <Controller
                  name="connectivity"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel>연결성</InputLabel>
                      <Select {...field} label="연결성">
                        {connectivityOptions[watchDeviceType]?.map((c) => (
                          <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>취소</Button>
            <Button type="submit" variant="contained">저장</Button>
          </DialogActions>
        </form>
      </Dialog>
      
      {/* 비활성화 확인 다이얼로그 */}
      <ConfirmDialog
        open={deactivateDialog.open}
        title={deactivateDialog.model?.is_active ? '모델 비활성화' : '모델 활성화'}
        message={
          deactivateDialog.model?.is_active
            ? `"${deactivateDialog.model?.full_name}" 모델을 비활성화하시겠습니까? Viewer 화면에서 숨겨집니다.`
            : `"${deactivateDialog.model?.full_name}" 모델을 활성화하시겠습니까?`
        }
        confirmLabel={deactivateDialog.model?.is_active ? '비활성화' : '활성화'}
        confirmColor={deactivateDialog.model?.is_active ? 'warning' : 'success'}
        onConfirm={handleToggleActive}
        onCancel={() => setDeactivateDialog({ open: false, model: null })}
      />
    </Box>
  );
}
