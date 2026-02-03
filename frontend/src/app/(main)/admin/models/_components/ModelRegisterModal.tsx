/**
 * 모델 등록 모달
 * 
 * 3가지 탭 지원:
 * - 단건 등록: 단일 모델 폼 입력
 * - 다중 스토리지: 공통 정보 + 스토리지 선택으로 여러 모델 일괄 생성
 * - JSON 일괄: JSON 텍스트 또는 파일로 다수 모델 등록
 * 
 * Validate → Preview → Commit 2단계 흐름
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Tabs,
  Tab,
  TextField,
  Button,
  Typography,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Alert,
  AlertTitle,
  Chip,
  IconButton,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  CloudUpload as CloudUploadIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { ssotModelsApi, BulkValidateResponse, ValidateRowResult } from '@/lib/api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { DeviceType, Manufacturer, deviceTypeLabels, manufacturerLabels } from './types';
import { shadows, transitions } from '@/theme/tokens';

interface ModelRegisterModalProps {
  open: boolean;
  onClose: () => void;
  deviceType: DeviceType;
  manufacturer: Manufacturer;
  onSuccess: () => void;
}

// 연결성 옵션
const connectivityOptions = [
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'cellular', label: 'Cellular (LTE/5G)' },
  { value: 'wifi_cellular', label: 'Wi-Fi + Cellular' },
];

// 스토리지 옵션 (GB)
const storageOptions = [32, 64, 128, 256, 512, 1024];

// 탭 패널 컴포넌트
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ py: 2 }}
    >
      {value === index && children}
    </Box>
  );
}

// 검증 결과 행 상태 아이콘
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'valid':
      return <CheckCircleIcon color="success" fontSize="small" />;
    case 'duplicate':
      return <WarningIcon color="warning" fontSize="small" />;
    case 'error':
      return <ErrorIcon color="error" fontSize="small" />;
    default:
      return null;
  }
}

export function ModelRegisterModal({
  open,
  onClose,
  deviceType,
  manufacturer,
  onSuccess,
}: ModelRegisterModalProps) {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  // 탭 상태
  const [tabIndex, setTabIndex] = useState(0);

  // 단건 등록 폼 상태
  const [singleForm, setSingleForm] = useState({
    series: '',
    model_name: '',
    storage_gb: 128,
    connectivity: 'cellular',
  });

  // 다중 스토리지 폼 상태
  const [multiForm, setMultiForm] = useState({
    series: '',
    model_name: '',
    connectivity: 'cellular',
    selectedStorages: new Set<number>([128, 256]),
  });

  // JSON 일괄 폼 상태
  const [jsonInput, setJsonInput] = useState('');

  // 검증 상태
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<BulkValidateResponse | null>(null);

  // 커밋 상태
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [committing, setCommitting] = useState(false);

  // 유효한 항목만 필터링
  const validItems = useMemo(() => {
    if (!validationResult) return [];
    return validationResult.preview.filter((item) => item.status === 'valid');
  }, [validationResult]);

  // 폼 초기화
  const resetForm = useCallback(() => {
    setSingleForm({
      series: '',
      model_name: '',
      storage_gb: 128,
      connectivity: 'cellular',
    });
    setMultiForm({
      series: '',
      model_name: '',
      connectivity: 'cellular',
      selectedStorages: new Set<number>([128, 256]),
    });
    setJsonInput('');
    setValidationResult(null);
  }, []);

  // 모달 닫기
  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // 단건 등록 검증
  const handleSingleValidate = useCallback(async () => {
    if (!singleForm.series || !singleForm.model_name) {
      enqueueSnackbar('시리즈와 모델명을 입력해주세요', { variant: 'warning' });
      return;
    }

    setValidating(true);
    try {
      const response = await ssotModelsApi.validateBulkJson({
        models: [{
          device_type: deviceType,
          manufacturer: manufacturer,
          series: singleForm.series,
          model_name: singleForm.model_name,
          storage_gb: [singleForm.storage_gb],
          connectivity: singleForm.connectivity,
        }],
      });
      setValidationResult(response.data.data);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '검증에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setValidating(false);
    }
  }, [singleForm, deviceType, manufacturer, enqueueSnackbar]);

  // 다중 스토리지 검증
  const handleMultiValidate = useCallback(async () => {
    if (!multiForm.series || !multiForm.model_name) {
      enqueueSnackbar('시리즈와 모델명을 입력해주세요', { variant: 'warning' });
      return;
    }
    if (multiForm.selectedStorages.size === 0) {
      enqueueSnackbar('스토리지를 하나 이상 선택해주세요', { variant: 'warning' });
      return;
    }

    setValidating(true);
    try {
      const response = await ssotModelsApi.validateBulkJson({
        models: [{
          device_type: deviceType,
          manufacturer: manufacturer,
          series: multiForm.series,
          model_name: multiForm.model_name,
          storage_gb: Array.from(multiForm.selectedStorages).sort((a, b) => a - b),
          connectivity: multiForm.connectivity,
        }],
      });
      setValidationResult(response.data.data);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '검증에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setValidating(false);
    }
  }, [multiForm, deviceType, manufacturer, enqueueSnackbar]);

  // JSON 검증
  const handleJsonValidate = useCallback(async () => {
    if (!jsonInput.trim()) {
      enqueueSnackbar('JSON 데이터를 입력해주세요', { variant: 'warning' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) {
        parsed = [parsed];
      }
    } catch {
      enqueueSnackbar('올바른 JSON 형식이 아닙니다', { variant: 'error' });
      return;
    }

    setValidating(true);
    try {
      const response = await ssotModelsApi.validateBulkJson({
        models: parsed.map((item: any) => ({
          device_type: item.device_type || deviceType,
          manufacturer: item.manufacturer || manufacturer,
          series: item.series,
          model_name: item.model_name,
          storage_gb: Array.isArray(item.storage_gb) ? item.storage_gb : [item.storage_gb],
          connectivity: item.connectivity || 'cellular',
        })),
      });
      setValidationResult(response.data.data);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '검증에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setValidating(false);
    }
  }, [jsonInput, deviceType, manufacturer, enqueueSnackbar]);

  // 검증 실행 (탭에 따라)
  const handleValidate = useCallback(() => {
    switch (tabIndex) {
      case 0:
        handleSingleValidate();
        break;
      case 1:
        handleMultiValidate();
        break;
      case 2:
        handleJsonValidate();
        break;
    }
  }, [tabIndex, handleSingleValidate, handleMultiValidate, handleJsonValidate]);

  // 커밋 실행
  const handleCommit = useCallback(async () => {
    if (!validationResult?.validation_id) return;

    setCommitting(true);
    try {
      const response = await ssotModelsApi.commitBulk(validationResult.validation_id);
      const createdCount = response.data.data.created_count;
      enqueueSnackbar(`${createdCount}개 모델이 등록되었습니다`, { variant: 'success' });
      setConfirmDialogOpen(false);
      handleClose();
      onSuccess();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '등록에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setCommitting(false);
    }
  }, [validationResult, enqueueSnackbar, handleClose, onSuccess]);

  // 스토리지 토글
  const handleStorageToggle = (storage: number) => {
    setMultiForm((prev) => {
      const newSet = new Set(prev.selectedStorages);
      if (newSet.has(storage)) {
        newSet.delete(storage);
      } else {
        newSet.add(storage);
      }
      return { ...prev, selectedStorages: newSet };
    });
  };

  // JSON 파일 업로드
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setJsonInput(content);
    };
    reader.readAsText(file);
  };

  // 탭 변경 시 검증 결과 초기화
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
    setValidationResult(null);
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
          },
        }}
      >
        {/* 헤더 */}
        <DialogTitle
          sx={{
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 2,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <AddIcon />
            <Typography variant="h6" fontWeight={700}>
              {manufacturerLabels[manufacturer]} {deviceTypeLabels[deviceType]} 모델 등록
            </Typography>
          </Stack>
          <IconButton onClick={handleClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        {/* 탭 */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={tabIndex} onChange={handleTabChange}>
            <Tab label="단건 등록" />
            <Tab label="다중 스토리지" />
            <Tab label="JSON 일괄" />
          </Tabs>
        </Box>

        <DialogContent sx={{ minHeight: 400 }}>
          {/* 탭 1: 단건 등록 */}
          <TabPanel value={tabIndex} index={0}>
            <Stack spacing={2.5}>
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                단일 모델을 등록합니다. 같은 기종의 다른 스토리지는 "다중 스토리지" 탭을 이용하세요.
              </Alert>
              <TextField
                label="시리즈"
                placeholder="예: iPhone 16 Pro"
                value={singleForm.series}
                onChange={(e) => setSingleForm({ ...singleForm, series: e.target.value })}
                fullWidth
                required
              />
              <TextField
                label="모델명"
                placeholder="예: iPhone 16 Pro Max"
                value={singleForm.model_name}
                onChange={(e) => setSingleForm({ ...singleForm, model_name: e.target.value })}
                fullWidth
                required
              />
              <Stack direction="row" spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>스토리지</InputLabel>
                  <Select
                    value={singleForm.storage_gb}
                    label="스토리지"
                    onChange={(e) => setSingleForm({ ...singleForm, storage_gb: e.target.value as number })}
                  >
                    {storageOptions.map((size) => (
                      <MenuItem key={size} value={size}>
                        {size >= 1024 ? `${size / 1024}TB` : `${size}GB`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel>연결성</InputLabel>
                  <Select
                    value={singleForm.connectivity}
                    label="연결성"
                    onChange={(e) => setSingleForm({ ...singleForm, connectivity: e.target.value })}
                  >
                    {connectivityOptions.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Stack>
          </TabPanel>

          {/* 탭 2: 다중 스토리지 */}
          <TabPanel value={tabIndex} index={1}>
            <Stack spacing={2.5}>
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                공통 정보를 입력하고 스토리지를 여러 개 선택하면 각각 개별 모델로 생성됩니다.
              </Alert>
              <TextField
                label="시리즈"
                placeholder="예: iPhone 16 Pro"
                value={multiForm.series}
                onChange={(e) => setMultiForm({ ...multiForm, series: e.target.value })}
                fullWidth
                required
              />
              <TextField
                label="모델명"
                placeholder="예: iPhone 16 Pro Max"
                value={multiForm.model_name}
                onChange={(e) => setMultiForm({ ...multiForm, model_name: e.target.value })}
                fullWidth
                required
              />
              <FormControl fullWidth>
                <InputLabel>연결성</InputLabel>
                <Select
                  value={multiForm.connectivity}
                  label="연결성"
                  onChange={(e) => setMultiForm({ ...multiForm, connectivity: e.target.value })}
                >
                  {connectivityOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box>
                <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                  스토리지 선택 (복수 선택)
                </Typography>
                <FormGroup row>
                  {storageOptions.map((size) => (
                    <FormControlLabel
                      key={size}
                      control={
                        <Checkbox
                          checked={multiForm.selectedStorages.has(size)}
                          onChange={() => handleStorageToggle(size)}
                        />
                      }
                      label={size >= 1024 ? `${size / 1024}TB` : `${size}GB`}
                    />
                  ))}
                </FormGroup>
              </Box>
              {multiForm.selectedStorages.size > 0 && (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    선택됨: {Array.from(multiForm.selectedStorages).sort((a, b) => a - b).map((s) => 
                      s >= 1024 ? `${s / 1024}TB` : `${s}GB`
                    ).join(', ')} ({multiForm.selectedStorages.size}개 모델 생성 예정)
                  </Typography>
                </Box>
              )}
            </Stack>
          </TabPanel>

          {/* 탭 3: JSON 일괄 */}
          <TabPanel value={tabIndex} index={2}>
            <Stack spacing={2.5}>
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                JSON 배열 형식으로 여러 모델을 한 번에 등록합니다. device_type, manufacturer는 현재 페이지 값이 기본값입니다.
              </Alert>
              <TextField
                label="JSON 데이터"
                placeholder={`[
  {
    "series": "iPhone 16 Pro",
    "model_name": "iPhone 16 Pro Max",
    "storage_gb": [128, 256, 512],
    "connectivity": "cellular"
  }
]`}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                fullWidth
                multiline
                rows={8}
                InputProps={{
                  sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
                }}
              />
              <Button
                variant="outlined"
                startIcon={<CloudUploadIcon />}
                component="label"
              >
                JSON 파일 업로드
                <input
                  type="file"
                  accept=".json"
                  hidden
                  onChange={handleFileUpload}
                />
              </Button>
            </Stack>
          </TabPanel>

          {/* 검증 결과 프리뷰 */}
          {validationResult && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                검증 결과
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Chip
                  label={`총 ${validationResult.total_count}개`}
                  size="small"
                  color="default"
                />
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`유효 ${validationResult.valid_count}`}
                  size="small"
                  color="success"
                />
                {validationResult.duplicate_count > 0 && (
                  <Chip
                    icon={<WarningIcon />}
                    label={`중복 ${validationResult.duplicate_count}`}
                    size="small"
                    color="warning"
                  />
                )}
                {validationResult.error_count > 0 && (
                  <Chip
                    icon={<ErrorIcon />}
                    label={`오류 ${validationResult.error_count}`}
                    size="small"
                    color="error"
                  />
                )}
              </Stack>

              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 250 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell width={50}>상태</TableCell>
                      <TableCell>모델코드</TableCell>
                      <TableCell>전체 모델명</TableCell>
                      <TableCell>메시지</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {validationResult.preview.map((row, idx) => (
                      <TableRow
                        key={idx}
                        sx={{
                          bgcolor: row.status === 'valid'
                            ? alpha(theme.palette.success.main, 0.05)
                            : row.status === 'duplicate'
                            ? alpha(theme.palette.warning.main, 0.05)
                            : alpha(theme.palette.error.main, 0.05),
                        }}
                      >
                        <TableCell>
                          <StatusIcon status={row.status} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontFamily="monospace">
                            {row.model_code}
                          </Typography>
                        </TableCell>
                        <TableCell>{row.full_name}</TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {row.error_message || '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Button onClick={handleClose} color="inherit">
            취소
          </Button>
          {!validationResult ? (
            <Button
              variant="contained"
              onClick={handleValidate}
              disabled={validating}
              startIcon={validating ? <CircularProgress size={18} /> : undefined}
            >
              {validating ? '검증 중...' : '검증하기'}
            </Button>
          ) : (
            <>
              <Button
                variant="outlined"
                onClick={() => setValidationResult(null)}
              >
                다시 입력
              </Button>
              <Button
                variant="contained"
                onClick={() => setConfirmDialogOpen(true)}
                disabled={validItems.length === 0}
                color="success"
              >
                등록 ({validItems.length}개)
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* 등록 확인 다이얼로그 */}
      <ConfirmDialog
        open={confirmDialogOpen}
        title="모델 등록 확정"
        confirmLabel="등록"
        confirmColor="success"
        loading={committing}
        maxWidth="sm"
        onConfirm={handleCommit}
        onCancel={() => setConfirmDialogOpen(false)}
      >
        <Box>
          <Typography variant="body1" gutterBottom>
            {validItems.length}개 모델을 등록하시겠습니까?
          </Typography>
          {validationResult && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
              <Typography variant="body2" gutterBottom fontWeight={600}>
                등록 요약:
              </Typography>
              <Typography variant="body2" color="text.secondary">
                • 생성될 모델: {validItems.length}개
              </Typography>
              {validationResult.summary?.by_series && Object.keys(validationResult.summary.by_series).length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  • 시리즈: {Object.entries(validationResult.summary.by_series).map(([k, v]) => `${k}(${v})`).join(', ')}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </ConfirmDialog>
    </>
  );
}
