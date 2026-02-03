/**
 * 모델 등록 모달 (고도화 버전)
 * 
 * 기능:
 * - 모델 등록: 다중 스토리지 지원 통합 폼
 * - JSON 일괄 등록: JSON 붙여넣기/업로드 → 파싱 → 검증 → 커밋
 * 
 * 원본: 781cded 커밋 (SSOT 모델 등록 고도화)
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Typography,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Tabs,
  Tab,
  Alert,
  AlertTitle,
  CircularProgress,
  Paper,
  IconButton,
  Tooltip,
  Fade,
  Collapse,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Upload as UploadIcon,
  Storage as StorageIcon,
  Smartphone as SmartphoneIcon,
  Tablet as TabletIcon,
  Watch as WatchIcon,
  Apple as AppleIcon,
  PhoneAndroid as SamsungIcon,
  AutoAwesome as AutoAwesomeIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Info as InfoIcon,
  Memory as MemoryIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  ssotModelsApi,
  BulkValidateResponse,
  ValidateRowResult,
} from '@/lib/api';
import { DeviceType, Manufacturer, deviceTypeLabels, manufacturerLabels } from './types';

// ============================================================================
// 타입 정의
// ============================================================================

// 통합 모델 등록 폼 타입
interface ModelRegistrationForm {
  device_type: string;
  manufacturer: string;
  series: string;
  model_name: string;
  connectivity: string;
  storage_list: number[];
}

interface ModelRegisterModalProps {
  open: boolean;
  onClose: () => void;
  deviceType: DeviceType;
  manufacturer: Manufacturer;
  onSuccess: () => void;
}

// ============================================================================
// 상수 정의
// ============================================================================

const deviceTypes = [
  { value: 'smartphone', label: '스마트폰', icon: <SmartphoneIcon fontSize="small" /> },
  { value: 'tablet', label: '태블릿', icon: <TabletIcon fontSize="small" /> },
  { value: 'wearable', label: '웨어러블', icon: <WatchIcon fontSize="small" /> },
];

// 제조사 (Apple, Samsung만)
const manufacturers = [
  { value: 'apple', label: 'Apple', icon: <AppleIcon fontSize="small" /> },
  { value: 'samsung', label: 'Samsung', icon: <SamsungIcon fontSize="small" /> },
];

const connectivityOptions: Record<string, { value: string; label: string }[]> = {
  smartphone: [{ value: 'lte', label: 'LTE' }],
  tablet: [
    { value: 'wifi', label: 'WiFi Only' },
    { value: 'wifi_cellular', label: 'WiFi + Cellular' },
  ],
  wearable: [{ value: 'standard', label: 'Standard' }],
};

// 제조사별 시리즈 옵션
const seriesOptions: Record<string, Record<string, string[]>> = {
  smartphone: {
    apple: [
      'iPhone 16 Pro',
      'iPhone 16',
      'iPhone 15 Pro',
      'iPhone 15',
      'iPhone 14 Pro',
      'iPhone 14',
      'iPhone 13 Pro',
      'iPhone 13',
      'iPhone 12 Pro',
      'iPhone 12',
      'iPhone 11 Pro',
      'iPhone 11',
      'iPhone SE',
      'iPhone XS',
      'iPhone XR',
      'iPhone X',
    ],
    samsung: [
      'Galaxy S24',
      'Galaxy S23',
      'Galaxy S22',
      'Galaxy S21',
      'Galaxy S20',
      'Galaxy Z Fold6',
      'Galaxy Z Fold5',
      'Galaxy Z Fold4',
      'Galaxy Z Flip6',
      'Galaxy Z Flip5',
      'Galaxy Z Flip4',
      'Galaxy A55',
      'Galaxy A54',
      'Galaxy A53',
      'Galaxy Note 20',
    ],
  },
  tablet: {
    apple: [
      'iPad Pro 13',
      'iPad Pro 12.9',
      'iPad Pro 11',
      'iPad Air',
      'iPad mini',
      'iPad',
    ],
    samsung: [
      'Galaxy Tab S9',
      'Galaxy Tab S8',
      'Galaxy Tab S7',
      'Galaxy Tab A9',
      'Galaxy Tab A8',
    ],
  },
  wearable: {
    apple: [
      'Apple Watch Ultra 2',
      'Apple Watch Ultra',
      'Apple Watch Series 9',
      'Apple Watch Series 8',
      'Apple Watch SE',
    ],
    samsung: [
      'Galaxy Watch 7',
      'Galaxy Watch 6',
      'Galaxy Watch 5',
      'Galaxy Watch FE',
      'Galaxy Fit 3',
    ],
  },
};

// 스토리지 옵션
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
    "device_type": "smartphone",
    "manufacturer": "apple",
    "series": "iPhone 16 Pro",
    "model_name": "iPhone 16 Pro Max",
    "storage_gb": [256, 512, 1024],
    "connectivity": "lte"
  }
]`;

// 검증 결과 프리뷰 컬럼
const previewColumns: GridColDef[] = [
  {
    field: 'status',
    headerName: '상태',
    width: 90,
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
  { 
    field: 'model_code', 
    headerName: '모델코드', 
    width: 220,
    renderCell: (params) => (
      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
        {params.value}
      </Typography>
    ),
  },
  { field: 'full_name', headerName: '전체 모델명', width: 200, flex: 1 },
  {
    field: 'error_message',
    headerName: '오류 메시지',
    width: 200,
    renderCell: (params) => (
      <Typography variant="body2" color="error.main">
        {params.value || '-'}
      </Typography>
    ),
  },
];

// ============================================================================
// 메인 컴포넌트
// ============================================================================

export function ModelRegisterModal({
  open,
  onClose,
  deviceType,
  manufacturer,
  onSuccess,
}: ModelRegisterModalProps) {
  const { enqueueSnackbar } = useSnackbar();
  
  // 탭 상태
  const [activeTab, setActiveTab] = useState(0);
  
  // 일괄 등록 상태
  const [validationResult, setValidationResult] = useState<BulkValidateResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  
  // 통합 모델 등록 폼
  const [modelForm, setModelForm] = useState<ModelRegistrationForm>({
    device_type: deviceType,
    manufacturer: manufacturer,
    series: '',
    model_name: '',
    connectivity: connectivityOptions[deviceType]?.[0]?.value || 'lte',
    storage_list: [],
  });
  
  // JSON 일괄 등록 상태
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  
  // 현재 선택 가능한 시리즈 목록
  const availableSeries = useMemo(() => {
    return seriesOptions[modelForm.device_type]?.[modelForm.manufacturer] || [];
  }, [modelForm.device_type, modelForm.manufacturer]);
  
  // 모달 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setModelForm({
        device_type: deviceType,
        manufacturer: manufacturer,
        series: '',
        model_name: '',
        connectivity: connectivityOptions[deviceType]?.[0]?.value || 'lte',
        storage_list: [],
      });
      setJsonInput('');
      setJsonError(null);
      setValidationResult(null);
      setActiveTab(0);
    }
  }, [open, deviceType, manufacturer]);
  
  // device_type 또는 manufacturer 변경 시 connectivity 및 series 초기화
  useEffect(() => {
    const defaultConnectivity = connectivityOptions[modelForm.device_type]?.[0]?.value || 'lte';
    setModelForm(prev => ({ 
      ...prev, 
      connectivity: defaultConnectivity,
      series: '', // 시리즈 초기화
    }));
  }, [modelForm.device_type, modelForm.manufacturer]);
  
  // ============================================================================
  // 스토리지 선택 핸들러
  // ============================================================================
  
  const handleStorageToggle = (storage: number) => {
    setModelForm(prev => {
      const newList = prev.storage_list.includes(storage)
        ? prev.storage_list.filter(s => s !== storage)
        : [...prev.storage_list, storage].sort((a, b) => a - b);
      return { ...prev, storage_list: newList };
    });
    setValidationResult(null);
  };
  
  const handleSelectAllStorages = () => {
    setModelForm(prev => ({
      ...prev,
      storage_list: storageOptions.map(o => o.value),
    }));
    setValidationResult(null);
  };
  
  const handleClearStorages = () => {
    setModelForm(prev => ({ ...prev, storage_list: [] }));
    setValidationResult(null);
  };
  
  // ============================================================================
  // 모델 등록 검증 및 저장
  // ============================================================================
  
  const handleValidate = async () => {
    if (!modelForm.series || !modelForm.model_name) {
      enqueueSnackbar('시리즈와 모델명을 입력하세요', { variant: 'warning' });
      return;
    }
    if (modelForm.storage_list.length === 0) {
      enqueueSnackbar('스토리지를 최소 1개 이상 선택하세요', { variant: 'warning' });
      return;
    }
    
    setValidating(true);
    try {
      const response = await ssotModelsApi.validateBulkJson({
        models: [{
          device_type: modelForm.device_type,
          manufacturer: modelForm.manufacturer,
          series: modelForm.series,
          model_name: modelForm.model_name,
          storage_gb: modelForm.storage_list,
          connectivity: modelForm.connectivity,
        }],
      });
      setValidationResult(response.data.data);
      
      if (response.data.data.valid_count === 0) {
        enqueueSnackbar('유효한 모델이 없습니다. 오류를 확인하세요.', { variant: 'warning' });
      } else {
        enqueueSnackbar(`검증 완료: ${response.data.data.valid_count}개 모델 생성 가능`, { variant: 'success' });
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
      const response = await ssotModelsApi.validateBulkJson({ models: parsedModels });
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
    event.target.value = '';
  };
  
  // ============================================================================
  // 일괄 등록 커밋
  // ============================================================================
  
  const handleCommit = async () => {
    if (!validationResult) return;
    
    setCommitting(true);
    try {
      const response = await ssotModelsApi.commitBulk(validationResult.validation_id);
      enqueueSnackbar(`${response.data.data.created_count}개 모델이 생성되었습니다`, { variant: 'success' });
      setConfirmDialogOpen(false);
      onClose();
      onSuccess();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '커밋에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setCommitting(false);
    }
  };
  
  // ============================================================================
  // 렌더링
  // ============================================================================
  
  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { minHeight: '70vh' } }}
      >
        <DialogTitle sx={{ 
          bgcolor: 'primary.main',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AutoAwesomeIcon />
            <span>{manufacturerLabels[manufacturer]} {deviceTypeLabels[deviceType]} 모델 등록</span>
          </Stack>
          <IconButton onClick={onClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ p: 0 }}>
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => {
              setActiveTab(newValue);
              setValidationResult(null);
            }}
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              px: 3,
              pt: 2,
              '& .MuiTab-root': {
                fontWeight: 600,
                textTransform: 'none',
              },
            }}
          >
            <Tab icon={<SmartphoneIcon />} iconPosition="start" label="모델 등록" />
            <Tab icon={<UploadIcon />} iconPosition="start" label="JSON 일괄" />
          </Tabs>
          
          <Box sx={{ p: 3 }}>
            {activeTab === 0 && (
              <ModelRegistrationFormContent
                form={modelForm}
                setForm={setModelForm}
                availableSeries={availableSeries}
                onStorageToggle={handleStorageToggle}
                onSelectAll={handleSelectAllStorages}
                onClearAll={handleClearStorages}
                validationResult={validationResult}
              />
            )}
            
            {activeTab === 1 && (
              <JsonBulkFormContent
                jsonInput={jsonInput}
                jsonError={jsonError}
                onJsonChange={handleJsonChange}
                onFileUpload={handleFileUpload}
                validationResult={validationResult}
                validating={validating}
                onValidate={handleValidateJson}
              />
            )}
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button onClick={onClose} variant="outlined">
            취소
          </Button>
          
          {activeTab === 0 && !validationResult && (
            <Button
              variant="contained"
              onClick={handleValidate}
              disabled={validating || modelForm.storage_list.length === 0}
              startIcon={validating ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
            >
              {validating ? '검증 중...' : '검증하기'}
            </Button>
          )}
          
          {validationResult && validationResult.valid_count > 0 && (
            <Button
              variant="contained"
              color="success"
              onClick={() => setConfirmDialogOpen(true)}
            >
              저장 ({validationResult.valid_count}개 모델)
            </Button>
          )}
        </DialogActions>
      </Dialog>
      
      {/* 일괄 등록 확정 다이얼로그 */}
      <ConfirmDialog
        open={confirmDialogOpen}
        title="모델 등록 확정"
        maxWidth="sm"
        confirmLabel="확정 저장"
        confirmColor="primary"
        loading={committing}
        onConfirm={handleCommit}
        onCancel={() => setConfirmDialogOpen(false)}
      >
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>생성될 모델 정보</AlertTitle>
            <Typography variant="h5" fontWeight="bold" color="primary">
              {validationResult?.valid_count ?? 0}개
            </Typography>
          </Alert>
          
          {validationResult?.summary.by_series && Object.keys(validationResult.summary.by_series).length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                시리즈별 분류
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {Object.entries(validationResult.summary.by_series).map(([key, count]) => (
                  <Chip key={key} label={`${key} (${count})`} size="small" variant="outlined" />
                ))}
              </Stack>
            </Box>
          )}
          
          <Alert severity="warning" icon={<WarningIcon />}>
            이 작업은 되돌릴 수 없습니다.
          </Alert>
        </Box>
      </ConfirmDialog>
    </>
  );
}

// ============================================================================
// 서브 컴포넌트: 통합 모델 등록 폼
// ============================================================================

interface ModelRegistrationFormContentProps {
  form: ModelRegistrationForm;
  setForm: React.Dispatch<React.SetStateAction<ModelRegistrationForm>>;
  availableSeries: string[];
  onStorageToggle: (storage: number) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  validationResult: BulkValidateResponse | null;
}

function ModelRegistrationFormContent({
  form,
  setForm,
  availableSeries,
  onStorageToggle,
  onSelectAll,
  onClearAll,
  validationResult,
}: ModelRegistrationFormContentProps) {
  return (
    <Box>
      {/* 자동 생성 안내 */}
      <Alert severity="info" icon={<AutoAwesomeIcon />} sx={{ mb: 3 }}>
        <AlertTitle>자동 생성 필드</AlertTitle>
        <Typography variant="body2">
          <strong>model_key</strong>와 <strong>model_code</strong>는 서버에서 자동 생성됩니다.
          스토리지를 여러 개 선택하면 각각의 모델이 생성됩니다.
        </Typography>
      </Alert>
      
      <Grid container spacing={3}>
        {/* 좌측: 기본 정보 */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 3, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <InfoIcon color="primary" fontSize="small" />
              기본 정보
            </Typography>
            
            <Stack spacing={2.5} sx={{ mt: 2 }}>
              {/* 기기 타입 */}
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  기기 타입
                </Typography>
                <ToggleButtonGroup
                  value={form.device_type}
                  exclusive
                  onChange={(_, value) => value && setForm(prev => ({ ...prev, device_type: value }))}
                  fullWidth
                  size="small"
                >
                  {deviceTypes.map((d) => (
                    <ToggleButton key={d.value} value={d.value} sx={{ textTransform: 'none' }}>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        {d.icon}
                        <span>{d.label}</span>
                      </Stack>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
              
              {/* 제조사 */}
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  제조사
                </Typography>
                <ToggleButtonGroup
                  value={form.manufacturer}
                  exclusive
                  onChange={(_, value) => value && setForm(prev => ({ ...prev, manufacturer: value }))}
                  fullWidth
                  size="small"
                >
                  {manufacturers.map((m) => (
                    <ToggleButton key={m.value} value={m.value} sx={{ textTransform: 'none' }}>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        {m.icon}
                        <span>{m.label}</span>
                      </Stack>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
              
              {/* 시리즈 - SELECT */}
              <FormControl fullWidth size="small">
                <InputLabel>시리즈</InputLabel>
                <Select
                  value={form.series}
                  label="시리즈"
                  onChange={(e) => setForm(prev => ({ ...prev, series: e.target.value }))}
                >
                  {availableSeries.map((series) => (
                    <MenuItem key={series} value={series}>{series}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              {/* 모델명 */}
              <TextField
                fullWidth
                size="small"
                label="모델명"
                placeholder="예: iPhone 16 Pro Max, Galaxy S24 Ultra"
                value={form.model_name}
                onChange={(e) => setForm(prev => ({ ...prev, model_name: e.target.value }))}
              />
              
              {/* 연결성 */}
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
            </Stack>
          </Paper>
        </Grid>
        
        {/* 우측: 스토리지 선택 */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MemoryIcon color="primary" fontSize="small" />
                스토리지 선택
              </Typography>
              
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="전체 선택">
                  <IconButton size="small" onClick={onSelectAll}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="전체 해제">
                  <IconButton size="small" onClick={onClearAll}>
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
            
            <Grid container spacing={1}>
              {storageOptions.map((option) => {
                const isSelected = form.storage_list.includes(option.value);
                
                return (
                  <Grid item xs={4} key={option.value}>
                    <Paper
                      onClick={() => onStorageToggle(option.value)}
                      variant={isSelected ? 'elevation' : 'outlined'}
                      sx={{
                        p: 1.5,
                        cursor: 'pointer',
                        textAlign: 'center',
                        bgcolor: isSelected ? 'primary.main' : 'background.paper',
                        color: isSelected ? 'white' : 'text.primary',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          bgcolor: isSelected ? 'primary.dark' : 'grey.100',
                        },
                      }}
                    >
                      <StorageIcon sx={{ fontSize: 20, mb: 0.5 }} />
                      <Typography variant="body2" fontWeight={600}>
                        {option.label}
                      </Typography>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
            
            {/* 선택 요약 */}
            <Collapse in={form.storage_list.length > 0}>
              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'success.50', borderRadius: 1, border: '1px solid', borderColor: 'success.200' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="success.dark">
                    선택된 스토리지
                  </Typography>
                  <Chip 
                    label={`${form.storage_list.length}개 모델 생성`} 
                    color="success" 
                    size="small"
                  />
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                  {form.storage_list.sort((a, b) => a - b).map((storage) => {
                    const option = storageOptions.find(o => o.value === storage);
                    return (
                      <Chip
                        key={storage}
                        label={option?.label || `${storage}GB`}
                        size="small"
                        variant="outlined"
                        color="success"
                      />
                    );
                  })}
                </Stack>
              </Box>
            </Collapse>
          </Paper>
        </Grid>
      </Grid>
      
      {/* 검증 결과 프리뷰 */}
      {validationResult && (
        <Fade in>
          <Paper variant="outlined" sx={{ mt: 3, p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                검증 결과
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip icon={<CheckCircleIcon />} label={`유효 ${validationResult.valid_count}`} color="success" size="small" />
                {validationResult.error_count > 0 && (
                  <Chip icon={<ErrorIcon />} label={`오류 ${validationResult.error_count}`} color="error" size="small" />
                )}
                {validationResult.duplicate_count > 0 && (
                  <Chip icon={<WarningIcon />} label={`중복 ${validationResult.duplicate_count}`} color="warning" size="small" />
                )}
              </Stack>
            </Stack>
            
            <DataGrid
              rows={validationResult.preview.map((row, idx) => ({ ...row, id: idx }))}
              columns={previewColumns}
              autoHeight
              disableRowSelectionOnClick
              hideFooter={validationResult.preview.length <= 5}
              initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
              pageSizeOptions={[5]}
              sx={{ border: 'none' }}
            />
          </Paper>
        </Fade>
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
}

function JsonBulkFormContent({
  jsonInput,
  jsonError,
  onJsonChange,
  onFileUpload,
  validationResult,
  validating,
  onValidate,
}: JsonBulkFormContentProps) {
  return (
    <Box>
      <Alert severity="info" icon={<AutoAwesomeIcon />} sx={{ mb: 3 }}>
        <AlertTitle>자동 생성 필드 안내</AlertTitle>
        <Typography variant="body2" component="div">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>model_key</strong>: 시리즈+모델명 기반으로 서버에서 자동 생성</li>
            <li><strong>model_code</strong>: model_key + 스토리지 조합으로 자동 생성</li>
            <li><strong>storage_gb</strong>를 배열로 입력하면 각 스토리지별로 개별 모델 생성</li>
          </ul>
        </Typography>
      </Alert>
      
      <Paper variant="outlined" sx={{ p: 3 }}>
        <TextField
          fullWidth
          multiline
          rows={12}
          label="JSON 입력"
          placeholder={jsonTemplate}
          value={jsonInput}
          onChange={(e) => onJsonChange(e.target.value)}
          error={!!jsonError}
          helperText={jsonError}
          InputProps={{
            sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
          }}
        />
        
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
            파일 업로드
            <input type="file" hidden accept=".json" onChange={onFileUpload} />
          </Button>
          <Button
            variant="contained"
            onClick={onValidate}
            disabled={validating || !jsonInput.trim()}
            startIcon={validating ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
          >
            {validating ? '검증 중...' : '검증하기'}
          </Button>
        </Stack>
      </Paper>
      
      {/* 검증 결과 프리뷰 */}
      {validationResult && (
        <Fade in>
          <Paper variant="outlined" sx={{ mt: 3, p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                검증 결과: 총 {validationResult.total_count}개
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip icon={<CheckCircleIcon />} label={`유효 ${validationResult.valid_count}`} color="success" size="small" />
                {validationResult.error_count > 0 && (
                  <Chip icon={<ErrorIcon />} label={`오류 ${validationResult.error_count}`} color="error" size="small" />
                )}
                {validationResult.duplicate_count > 0 && (
                  <Chip icon={<WarningIcon />} label={`중복 ${validationResult.duplicate_count}`} color="warning" size="small" />
                )}
              </Stack>
            </Stack>
            
            <DataGrid
              rows={validationResult.preview.map((row, idx) => ({ ...row, id: idx }))}
              columns={previewColumns}
              autoHeight
              disableRowSelectionOnClick
              hideFooter={validationResult.preview.length <= 10}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              pageSizeOptions={[10]}
              sx={{ border: 'none' }}
            />
          </Paper>
        </Fade>
      )}
    </Box>
  );
}
