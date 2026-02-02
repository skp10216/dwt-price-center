/**
 * 단가표 통합 관리 시스템 - SSOT 모델 관리 페이지 (관리자)
 * 
 * 기능:
 * - 단건 등록: 기존 폼으로 1개 모델 등록
 * - 다중 스토리지 일괄 생성: 공통 정보 + 여러 스토리지 선택 → N개 모델 생성
 * - JSON 일괄 등록: JSON 붙여넣기/업로드 → 파싱 → 검증 → 커밋
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Typography,
  Stack,
  InputAdornment,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Tabs,
  Tab,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  Search as SearchIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams, GridActionsCellItem } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { useForm, Controller } from 'react-hook-form';
import PageHeader from '@/components/ui/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  ssotModelsApi,
  gradesApi,
  BulkValidateResponse,
  ValidateRowResult,
} from '@/lib/api';

// ============================================================================
// 타입 정의
// ============================================================================

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

// 단건 등록 폼 타입
interface SingleModelForm {
  model_code: string;
  device_type: string;
  manufacturer: string;
  series: string;
  model_name: string;
  storage_gb: number;
  connectivity: string;
}

// 다중 스토리지 등록 폼 타입
interface MultiStorageForm {
  device_type: string;
  manufacturer: string;
  series: string;
  model_name: string;
  connectivity: string;
  model_code_prefix: string;
  storage_list: number[];
}

// ============================================================================
// 상수 정의
// ============================================================================

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

// 스토리지 옵션 (GB 단위)
const storageOptions = [
  { value: 32, label: '32GB' },
  { value: 64, label: '64GB' },
  { value: 128, label: '128GB' },
  { value: 256, label: '256GB' },
  { value: 512, label: '512GB' },
  { value: 1024, label: '1TB' },
  { value: 2048, label: '2TB' },
];

// JSON 예시 템플릿
const jsonTemplate = `[
  {
    "model_code": "IP16PM-256",
    "device_type": "smartphone",
    "manufacturer": "apple",
    "series": "iPhone 16",
    "model_name": "iPhone 16 Pro Max",
    "storage_gb": 256,
    "connectivity": "lte"
  }
]`;

// ============================================================================
// 메인 컴포넌트
// ============================================================================

export default function ModelsPage() {
  const { enqueueSnackbar } = useSnackbar();
  
  // 목록 상태
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<Model[]>([]);
  const [total, setTotal] = useState(0);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  
  // 다이얼로그 상태
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  
  // 비활성화 다이얼로그
  const [deactivateDialog, setDeactivateDialog] = useState<{
    open: boolean;
    model: Model | null;
  }>({ open: false, model: null });
  
  // 일괄 등록 상태
  const [validationResult, setValidationResult] = useState<BulkValidateResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  
  // 다중 스토리지 폼
  const [multiStorageForm, setMultiStorageForm] = useState<MultiStorageForm>({
    device_type: 'smartphone',
    manufacturer: 'apple',
    series: '',
    model_name: '',
    connectivity: 'lte',
    model_code_prefix: '',
    storage_list: [],
  });
  
  // JSON 일괄 등록 상태
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  
  // 단건 등록 폼 (react-hook-form)
  const { control, handleSubmit, reset, watch, setValue } = useForm<SingleModelForm>({
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
  
  // 목록 새로고침 함수
  const refreshModels = useCallback(async () => {
    setLoading(true);
    try {
      const response = await ssotModelsApi.list({
        page: page + 1,
        page_size: pageSize,
        search: search || undefined,
        device_type: deviceTypeFilter || undefined,
        manufacturer: manufacturerFilter || undefined,
      });
      const data = response.data.data;
      setModels(data.models as Model[]);
      setTotal(data.total);
    } catch (error) {
      enqueueSnackbar('모델 목록을 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, deviceTypeFilter, manufacturerFilter, enqueueSnackbar]);
  
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
    refreshModels();
  }, [refreshModels]);
  
  // device_type 변경 시 connectivity 자동 설정 (단건 등록)
  useEffect(() => {
    const defaultConnectivity = connectivityOptions[watchDeviceType]?.[0]?.value || 'lte';
    setValue('connectivity', defaultConnectivity);
  }, [watchDeviceType, setValue]);
  
  // 다중 스토리지 폼의 device_type 변경 시 connectivity 자동 설정
  useEffect(() => {
    const defaultConnectivity = connectivityOptions[multiStorageForm.device_type]?.[0]?.value || 'lte';
    setMultiStorageForm(prev => ({ ...prev, connectivity: defaultConnectivity }));
  }, [multiStorageForm.device_type]);
  
  // ============================================================================
  // 다이얼로그 핸들러
  // ============================================================================
  
  const handleOpenDialog = (model?: Model) => {
    if (model) {
      // 수정 모드 (단건 등록 탭으로)
      setEditingModel(model);
      setActiveTab(0);
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
      // 신규 등록 모드
      setEditingModel(null);
      setActiveTab(0);
      reset({
        model_code: '',
        device_type: 'smartphone',
        manufacturer: 'apple',
        series: '',
        model_name: '',
        storage_gb: 128,
        connectivity: 'lte',
      });
      // 다중 스토리지 폼 초기화
      setMultiStorageForm({
        device_type: 'smartphone',
        manufacturer: 'apple',
        series: '',
        model_name: '',
        connectivity: 'lte',
        model_code_prefix: '',
        storage_list: [],
      });
      // JSON 입력 초기화
      setJsonInput('');
      setJsonError(null);
    }
    // 검증 결과 초기화
    setValidationResult(null);
    setDialogOpen(true);
  };
  
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingModel(null);
    setValidationResult(null);
    setJsonError(null);
  };
  
  // ============================================================================
  // 단건 등록/수정
  // ============================================================================
  
  const onSubmitSingle = async (data: SingleModelForm) => {
    try {
      if (editingModel) {
        await ssotModelsApi.update(editingModel.id, data);
        enqueueSnackbar('모델이 수정되었습니다', { variant: 'success' });
      } else {
        await ssotModelsApi.create(data);
        enqueueSnackbar('모델이 생성되었습니다', { variant: 'success' });
      }
      handleCloseDialog();
      refreshModels();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '저장에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };
  
  // ============================================================================
  // 다중 스토리지 일괄 등록
  // ============================================================================
  
  const handleStorageToggle = (storage: number) => {
    setMultiStorageForm(prev => {
      const newList = prev.storage_list.includes(storage)
        ? prev.storage_list.filter(s => s !== storage)
        : [...prev.storage_list, storage];
      return { ...prev, storage_list: newList };
    });
    // 검증 결과 초기화 (스토리지 변경 시)
    setValidationResult(null);
  };
  
  const handleValidateMultiStorage = async () => {
    if (!multiStorageForm.series || !multiStorageForm.model_name || !multiStorageForm.model_code_prefix) {
      enqueueSnackbar('시리즈, 모델명, 모델코드 접두어를 입력하세요', { variant: 'warning' });
      return;
    }
    if (multiStorageForm.storage_list.length === 0) {
      enqueueSnackbar('스토리지를 최소 1개 이상 선택하세요', { variant: 'warning' });
      return;
    }
    
    setValidating(true);
    try {
      const response = await ssotModelsApi.validateBulkStorage({
        device_type: multiStorageForm.device_type,
        manufacturer: multiStorageForm.manufacturer,
        series: multiStorageForm.series,
        model_name: multiStorageForm.model_name,
        connectivity: multiStorageForm.connectivity,
        storage_list: multiStorageForm.storage_list,
        model_code_prefix: multiStorageForm.model_code_prefix,
      });
      setValidationResult(response.data.data);
      
      if (response.data.data.valid_count === 0) {
        enqueueSnackbar('유효한 모델이 없습니다. 오류를 확인하세요.', { variant: 'warning' });
      } else {
        enqueueSnackbar(`검증 완료: ${response.data.data.valid_count}개 유효`, { variant: 'success' });
      }
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '검증에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setValidating(false);
    }
  };
  
  // ============================================================================
  // JSON 일괄 등록
  // ============================================================================
  
  const handleJsonChange = (value: string) => {
    setJsonInput(value);
    setJsonError(null);
    setValidationResult(null);
  };
  
  const handleValidateJson = async () => {
    if (!jsonInput.trim()) {
      enqueueSnackbar('JSON을 입력하세요', { variant: 'warning' });
      return;
    }
    
    // JSON 파싱 검사
    let parsedModels;
    try {
      parsedModels = JSON.parse(jsonInput);
      if (!Array.isArray(parsedModels)) {
        throw new Error('JSON 배열 형식이어야 합니다');
      }
      if (parsedModels.length === 0) {
        throw new Error('모델이 최소 1개 이상 필요합니다');
      }
    } catch (e: any) {
      setJsonError(e.message);
      enqueueSnackbar(`JSON 파싱 오류: ${e.message}`, { variant: 'error' });
      return;
    }
    
    setValidating(true);
    try {
      const response = await ssotModelsApi.validateBulkJson({
        models: parsedModels,
      });
      setValidationResult(response.data.data);
      
      if (response.data.data.valid_count === 0) {
        enqueueSnackbar('유효한 모델이 없습니다. 오류를 확인하세요.', { variant: 'warning' });
      } else {
        enqueueSnackbar(`검증 완료: ${response.data.data.valid_count}개 유효`, { variant: 'success' });
      }
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '검증에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setValidating(false);
    }
  };
  
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      handleJsonChange(content);
    };
    reader.onerror = () => {
      enqueueSnackbar('파일 읽기에 실패했습니다', { variant: 'error' });
    };
    reader.readAsText(file);
    
    // 파일 입력 초기화 (같은 파일 재선택 가능하도록)
    event.target.value = '';
  };
  
  // ============================================================================
  // 일괄 등록 커밋
  // ============================================================================
  
  const handleOpenCommitConfirm = () => {
    if (!validationResult || validationResult.valid_count === 0) {
      enqueueSnackbar('커밋할 유효한 모델이 없습니다', { variant: 'warning' });
      return;
    }
    setConfirmDialogOpen(true);
  };
  
  const handleCommit = async () => {
    if (!validationResult) return;
    
    setCommitting(true);
    try {
      const response = await ssotModelsApi.commitBulk(validationResult.validation_id);
      enqueueSnackbar(`${response.data.data.created_count}개 모델이 생성되었습니다`, { variant: 'success' });
      setConfirmDialogOpen(false);
      handleCloseDialog();
      refreshModels();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '커밋에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setCommitting(false);
    }
  };
  
  // ============================================================================
  // 비활성화 토글
  // ============================================================================
  
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
      refreshModels();
    } catch (error) {
      enqueueSnackbar('상태 변경에 실패했습니다', { variant: 'error' });
    }
  };
  
  // ============================================================================
  // DataGrid 컬럼 정의
  // ============================================================================
  
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
  
  // 검증 결과 프리뷰 컬럼
  const previewColumns: GridColDef[] = [
    {
      field: 'status',
      headerName: '상태',
      width: 80,
      renderCell: (params: GridRenderCellParams<ValidateRowResult>) => {
        const status = params.value as string;
        if (status === 'valid') {
          return <Chip icon={<CheckCircleIcon />} label="유효" color="success" size="small" />;
        } else if (status === 'duplicate') {
          return <Chip icon={<WarningIcon />} label="중복" color="warning" size="small" />;
        } else {
          return <Chip icon={<ErrorIcon />} label="오류" color="error" size="small" />;
        }
      },
    },
    { field: 'model_code', headerName: '모델코드', width: 130 },
    { field: 'full_name', headerName: '전체 모델명', width: 250, flex: 1 },
    {
      field: 'error_message',
      headerName: '오류 메시지',
      width: 200,
      renderCell: (params) => params.value || '-',
    },
  ];
  
  // ============================================================================
  // 렌더링
  // ============================================================================
  
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
              <Select value={deviceTypeFilter} label="타입" onChange={(e) => setDeviceTypeFilter(e.target.value)}>
                <MenuItem value="">전체</MenuItem>
                {deviceTypes.map((d) => (
                  <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>제조사</InputLabel>
              <Select value={manufacturerFilter} label="제조사" onChange={(e) => setManufacturerFilter(e.target.value)}>
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
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { minHeight: '70vh' } }}
      >
        <DialogTitle>
          {editingModel ? '모델 수정' : '모델 등록'}
        </DialogTitle>
        
        <DialogContent>
          {/* 수정 모드일 때는 탭 없이 단건 폼만 표시 */}
          {editingModel ? (
            <SingleModelFormContent
              control={control}
              watchDeviceType={watchDeviceType}
            />
          ) : (
            <>
              <Tabs
                value={activeTab}
                onChange={(_, newValue) => {
                  setActiveTab(newValue);
                  setValidationResult(null);
                }}
                sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
              >
                <Tab label="단건 등록" />
                <Tab label="다중 스토리지" />
                <Tab label="JSON 일괄" />
              </Tabs>
              
              {/* 탭 0: 단건 등록 */}
              {activeTab === 0 && (
                <SingleModelFormContent
                  control={control}
                  watchDeviceType={watchDeviceType}
                />
              )}
              
              {/* 탭 1: 다중 스토리지 일괄 생성 */}
              {activeTab === 1 && (
                <MultiStorageFormContent
                  form={multiStorageForm}
                  setForm={setMultiStorageForm}
                  onStorageToggle={handleStorageToggle}
                  validationResult={validationResult}
                  validating={validating}
                  onValidate={handleValidateMultiStorage}
                  previewColumns={previewColumns}
                />
              )}
              
              {/* 탭 2: JSON 일괄 등록 */}
              {activeTab === 2 && (
                <JsonBulkFormContent
                  jsonInput={jsonInput}
                  jsonError={jsonError}
                  onJsonChange={handleJsonChange}
                  onFileUpload={handleFileUpload}
                  validationResult={validationResult}
                  validating={validating}
                  onValidate={handleValidateJson}
                  previewColumns={previewColumns}
                />
              )}
            </>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleCloseDialog}>취소</Button>
          
          {/* 단건 등록/수정 버튼 */}
          {(editingModel || activeTab === 0) && (
            <Button
              variant="contained"
              onClick={handleSubmit(onSubmitSingle)}
            >
              {editingModel ? '수정' : '저장'}
            </Button>
          )}
          
          {/* 일괄 등록 커밋 버튼 */}
          {!editingModel && (activeTab === 1 || activeTab === 2) && validationResult && validationResult.valid_count > 0 && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleOpenCommitConfirm}
            >
              저장 ({validationResult.valid_count}개)
            </Button>
          )}
        </DialogActions>
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
      
      {/* 일괄 등록 확정 다이얼로그 */}
      <ConfirmDialog
        open={confirmDialogOpen}
        title="일괄 등록 확정"
        maxWidth="sm"
        confirmLabel="확정 저장"
        confirmColor="primary"
        loading={committing}
        onConfirm={handleCommit}
        onCancel={() => setConfirmDialogOpen(false)}
      >
        <Box>
          <Typography variant="body1" gutterBottom>
            다음 모델을 생성합니다:
          </Typography>
          
          <List dense>
            <ListItem>
              <ListItemText
                primary={`총 생성 개수: ${validationResult?.valid_count ?? 0}개`}
                primaryTypographyProps={{ fontWeight: 'bold' }}
              />
            </ListItem>
            
            {validationResult?.summary.by_manufacturer && Object.keys(validationResult.summary.by_manufacturer).length > 0 && (
              <ListItem>
                <ListItemText
                  primary="제조사별"
                  secondary={Object.entries(validationResult.summary.by_manufacturer)
                    .map(([key, count]) => `${manufacturers.find(m => m.value === key)?.label || key} (${count})`)
                    .join(', ')}
                />
              </ListItem>
            )}
            
            {validationResult?.summary.by_series && Object.keys(validationResult.summary.by_series).length > 0 && (
              <ListItem>
                <ListItemText
                  primary="시리즈별"
                  secondary={Object.entries(validationResult.summary.by_series)
                    .map(([key, count]) => `${key} (${count})`)
                    .join(', ')}
                />
              </ListItem>
            )}
          </List>
          
          <Alert severity="warning" sx={{ mt: 2 }}>
            이 작업은 되돌릴 수 없습니다.
          </Alert>
        </Box>
      </ConfirmDialog>
    </Box>
  );
}

// ============================================================================
// 서브 컴포넌트: 단건 등록 폼
// ============================================================================

interface SingleModelFormContentProps {
  control: any;
  watchDeviceType: string;
}

function SingleModelFormContent({ control, watchDeviceType }: SingleModelFormContentProps) {
  return (
    <Grid container spacing={2} sx={{ mt: 1 }}>
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
  );
}

// ============================================================================
// 서브 컴포넌트: 다중 스토리지 폼
// ============================================================================

interface MultiStorageFormContentProps {
  form: MultiStorageForm;
  setForm: React.Dispatch<React.SetStateAction<MultiStorageForm>>;
  onStorageToggle: (storage: number) => void;
  validationResult: BulkValidateResponse | null;
  validating: boolean;
  onValidate: () => void;
  previewColumns: GridColDef[];
}

function MultiStorageFormContent({
  form,
  setForm,
  onStorageToggle,
  validationResult,
  validating,
  onValidate,
  previewColumns,
}: MultiStorageFormContentProps) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        공통 정보를 입력하고 스토리지를 여러 개 선택하면, 선택한 스토리지 개수만큼 모델이 생성됩니다.
      </Typography>
      
      <Grid container spacing={2}>
        <Grid item xs={6}>
          <FormControl fullWidth size="small">
            <InputLabel>타입</InputLabel>
            <Select
              value={form.device_type}
              label="타입"
              onChange={(e) => setForm(prev => ({ ...prev, device_type: e.target.value }))}
            >
              {deviceTypes.map((d) => (
                <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6}>
          <FormControl fullWidth size="small">
            <InputLabel>제조사</InputLabel>
            <Select
              value={form.manufacturer}
              label="제조사"
              onChange={(e) => setForm(prev => ({ ...prev, manufacturer: e.target.value }))}
            >
              {manufacturers.map((m) => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            size="small"
            label="시리즈"
            placeholder="예: iPhone 16 Pro"
            value={form.series}
            onChange={(e) => setForm(prev => ({ ...prev, series: e.target.value }))}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            size="small"
            label="모델명"
            placeholder="예: iPhone 16 Pro Max"
            value={form.model_name}
            onChange={(e) => setForm(prev => ({ ...prev, model_name: e.target.value }))}
          />
        </Grid>
        <Grid item xs={6}>
          <FormControl fullWidth size="small">
            <InputLabel>연결성</InputLabel>
            <Select
              value={form.connectivity}
              label="연결성"
              onChange={(e) => setForm(prev => ({ ...prev, connectivity: e.target.value }))}
            >
              {connectivityOptions[form.device_type]?.map((c) => (
                <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6}>
          <TextField
            fullWidth
            size="small"
            label="모델코드 접두어"
            placeholder="예: IP16PM-"
            value={form.model_code_prefix}
            onChange={(e) => setForm(prev => ({ ...prev, model_code_prefix: e.target.value }))}
            helperText="모델코드: {접두어}{스토리지}"
          />
        </Grid>
      </Grid>
      
      <Divider sx={{ my: 2 }} />
      
      <Typography variant="subtitle2" gutterBottom>
        스토리지 선택 (복수)
      </Typography>
      <FormGroup row>
        {storageOptions.map((option) => (
          <FormControlLabel
            key={option.value}
            control={
              <Checkbox
                checked={form.storage_list.includes(option.value)}
                onChange={() => onStorageToggle(option.value)}
              />
            }
            label={option.label}
          />
        ))}
      </FormGroup>
      
      <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button
          variant="outlined"
          onClick={onValidate}
          disabled={validating || form.storage_list.length === 0}
          startIcon={validating ? <CircularProgress size={16} /> : undefined}
        >
          {validating ? '검증 중...' : '검증하기'}
        </Button>
        {form.storage_list.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            선택: {form.storage_list.length}개
          </Typography>
        )}
      </Box>
      
      {/* 검증 결과 프리뷰 */}
      {validationResult && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            생성될 모델 {validationResult.total_count}개
            {validationResult.error_count > 0 && (
              <Chip label={`오류 ${validationResult.error_count}`} color="error" size="small" sx={{ ml: 1 }} />
            )}
            {validationResult.duplicate_count > 0 && (
              <Chip label={`중복 ${validationResult.duplicate_count}`} color="warning" size="small" sx={{ ml: 1 }} />
            )}
          </Typography>
          
          <DataGrid
            rows={validationResult.preview.map((row, idx) => ({ ...row, id: idx }))}
            columns={previewColumns}
            autoHeight
            disableRowSelectionOnClick
            hideFooter={validationResult.preview.length <= 10}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
            }}
            pageSizeOptions={[10]}
            sx={{ mt: 1 }}
          />
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// 서브 컴포넌트: JSON 일괄 폼
// ============================================================================

interface JsonBulkFormContentProps {
  jsonInput: string;
  jsonError: string | null;
  onJsonChange: (value: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  validationResult: BulkValidateResponse | null;
  validating: boolean;
  onValidate: () => void;
  previewColumns: GridColDef[];
}

function JsonBulkFormContent({
  jsonInput,
  jsonError,
  onJsonChange,
  onFileUpload,
  validationResult,
  validating,
  onValidate,
  previewColumns,
}: JsonBulkFormContentProps) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        JSON 배열 형식으로 여러 모델을 한 번에 등록할 수 있습니다.
      </Typography>
      
      <TextField
        fullWidth
        multiline
        rows={10}
        label="JSON 입력"
        placeholder={jsonTemplate}
        value={jsonInput}
        onChange={(e) => onJsonChange(e.target.value)}
        error={!!jsonError}
        helperText={jsonError}
        sx={{ fontFamily: 'monospace' }}
        InputProps={{
          sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
        }}
      />
      
      <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button
          variant="outlined"
          component="label"
          startIcon={<UploadIcon />}
        >
          파일 업로드
          <input
            type="file"
            hidden
            accept=".json"
            onChange={onFileUpload}
          />
        </Button>
        <Button
          variant="outlined"
          onClick={onValidate}
          disabled={validating || !jsonInput.trim()}
          startIcon={validating ? <CircularProgress size={16} /> : undefined}
        >
          {validating ? '검증 중...' : '검증하기'}
        </Button>
      </Box>
      
      {/* 검증 결과 프리뷰 */}
      {validationResult && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            검증 결과: 총 {validationResult.total_count}개
            <Chip label={`유효 ${validationResult.valid_count}`} color="success" size="small" sx={{ ml: 1 }} />
            {validationResult.error_count > 0 && (
              <Chip label={`오류 ${validationResult.error_count}`} color="error" size="small" sx={{ ml: 1 }} />
            )}
            {validationResult.duplicate_count > 0 && (
              <Chip label={`중복 ${validationResult.duplicate_count}`} color="warning" size="small" sx={{ ml: 1 }} />
            )}
          </Typography>
          
          <DataGrid
            rows={validationResult.preview.map((row, idx) => ({ ...row, id: idx }))}
            columns={previewColumns}
            autoHeight
            disableRowSelectionOnClick
            hideFooter={validationResult.preview.length <= 10}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
            }}
            pageSizeOptions={[10]}
            sx={{ mt: 1 }}
          />
        </Box>
      )}
    </Box>
  );
}
