/**
 * 모델 수정 모달 (고급 UI)
 * 
 * 기능:
 * - 모델 기본 정보 수정 (model_name, series, connectivity, is_active)
 * - 용량(storage) 관리: 현재 용량 확인, 새 용량 추가, 기존 용량 삭제
 * - 고급스러운 디자인 적용
 * 
 * 주의:
 * - model_key, model_code, storage_gb는 불변 필드 (수정 불가)
 * - 용량 추가는 새 모델 생성으로 처리
 * - 용량 삭제는 해당 모델 삭제로 처리
 */

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Stack,
  Chip,
  Paper,
  Grid,
  IconButton,
  Tooltip,
  Alert,
  AlertTitle,
  Avatar,
  Divider,
  Switch,
  FormControlLabel,
  CircularProgress,
  Fade,
  Collapse,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Storage as StorageIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
  Smartphone as SmartphoneIcon,
  Memory as MemoryIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ssotModelsApi, BulkValidateResponse } from '@/lib/api';
import { shadows, transitions } from '@/theme/tokens';
import {
  GroupedModel,
  SSOTModel,
  DeviceType,
  Manufacturer,
  deviceTypeLabels,
  manufacturerLabels,
} from './types';

// ============================================================================
// 타입 정의
// ============================================================================

interface ModelEditModalProps {
  open: boolean;
  onClose: (shouldRefresh?: boolean) => void;
  groupedModel: GroupedModel | null;
  deviceType: DeviceType;
  manufacturer: Manufacturer;
}

interface EditFormData {
  model_name: string;
  series: string;
  connectivity: string;
  is_active: boolean;
}

// ============================================================================
// 상수 정의
// ============================================================================

const connectivityOptions: Record<string, { value: string; label: string }[]> = {
  smartphone: [{ value: 'lte', label: 'LTE' }],
  tablet: [
    { value: 'wifi', label: 'WiFi Only' },
    { value: 'wifi_cellular', label: 'WiFi + Cellular' },
  ],
  wearable: [{ value: 'standard', label: 'Standard' }],
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

// 제조사별 시리즈 옵션 (오타 방지를 위한 선택형)
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
      'Galaxy S24 Plus',
      'Galaxy S24 Ultra',
      'Galaxy S23',
      'Galaxy S23 Plus',
      'Galaxy S23 Ultra',
      'Galaxy S22',
      'Galaxy S22 Plus',
      'Galaxy S22 Ultra',
      'Galaxy S21',
      'Galaxy S21 Plus',
      'Galaxy S21 Ultra',
      'Galaxy S20',
      'Galaxy S20 Plus',
      'Galaxy S20 Ultra',
      'Galaxy S10',
      'Galaxy S10 Plus',
      'Galaxy Z Fold6',
      'Galaxy Z Fold5',
      'Galaxy Z Fold4',
      'Galaxy Z Fold3',
      'Galaxy Z Fold2',
      'Galaxy Z Fold',
      'Galaxy Z Flip6',
      'Galaxy Z Flip5',
      'Galaxy Z Flip4',
      'Galaxy Z Flip3',
      'Galaxy Z Flip',
      'Galaxy Note 20',
      'Galaxy Note 20 Ultra',
      'Galaxy Note 10',
      'Galaxy Note 10 Plus',
      'Galaxy A55',
      'Galaxy A54',
      'Galaxy A53',
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

// 스토리지 표시 변환
function getStorageDisplay(storage: number): string {
  if (storage >= 1024) {
    return `${storage / 1024}TB`;
  }
  return `${storage}GB`;
}

// ============================================================================
// 메인 컴포넌트
// ============================================================================

export function ModelEditModal({
  open,
  onClose,
  groupedModel,
  deviceType,
  manufacturer,
}: ModelEditModalProps) {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  // 폼 상태
  const [formData, setFormData] = useState<EditFormData>({
    model_name: '',
    series: '',
    connectivity: 'lte',
    is_active: true,
  });

  // 로컬 variants 상태 (삭제/추가 시 즉시 반영을 위해)
  const [localVariants, setLocalVariants] = useState<SSOTModel[]>([]);

  // 새 용량 추가 상태
  const [newStorages, setNewStorages] = useState<number[]>([]);
  const [storageValidation, setStorageValidation] = useState<BulkValidateResponse | null>(null);

  // 삭제 대상 용량 상태
  const [deleteTargetVariant, setDeleteTargetVariant] = useState<SSOTModel | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // 로딩 상태
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingStorage, setAddingStorage] = useState(false);

  // 저장 확인 다이얼로그
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [storageAddDialogOpen, setStorageAddDialogOpen] = useState(false);

  // 현재 선택 가능한 시리즈 목록
  const availableSeries = useMemo(() => {
    return seriesOptions[deviceType]?.[manufacturer] || [];
  }, [deviceType, manufacturer]);

  // 현재 등록된 용량 목록 (로컬 상태 기반)
  const existingStorages = useMemo(() => {
    return localVariants.map((v) => v.storage_gb).sort((a, b) => a - b);
  }, [localVariants]);

  // 추가 가능한 용량 목록 (기존에 없는 것만)
  const availableStorages = useMemo(() => {
    return storageOptions.filter((opt) => !existingStorages.includes(opt.value));
  }, [existingStorages]);

  // 폼이 변경되었는지 확인
  const hasChanges = useMemo(() => {
    if (localVariants.length === 0) return false;
    const firstVariant = localVariants[0];
    return (
      formData.model_name !== firstVariant.model_name ||
      formData.series !== firstVariant.series ||
      formData.connectivity !== firstVariant.connectivity ||
      formData.is_active !== firstVariant.is_active
    );
  }, [formData, localVariants]);

  // 초기화 완료 여부 추적 (한 번 초기화되면 모달이 닫힐 때까지 다시 초기화하지 않음)
  const isInitializedRef = useRef(false);
  // groupedModel을 ref로 저장하여 useEffect 의존성에서 제외
  const groupedModelRef = useRef(groupedModel);
  groupedModelRef.current = groupedModel;

  // 모달 열릴 때 초기화 (open이 true가 될 때만 - groupedModel 의존성 제외)
  useEffect(() => {
    const currentGroupedModel = groupedModelRef.current;
    
    // 모달이 열리고, 아직 초기화되지 않았고, groupedModel이 있을 때만 초기화
    if (open && !isInitializedRef.current && currentGroupedModel) {
      const firstVariant = currentGroupedModel.variants[0];
      setFormData({
        model_name: firstVariant.model_name,
        series: firstVariant.series,
        connectivity: firstVariant.connectivity,
        is_active: firstVariant.is_active,
      });
      setLocalVariants([...currentGroupedModel.variants]);
      setNewStorages([]);
      setStorageValidation(null);
      isInitializedRef.current = true;
    }

    // 모달이 닫히면 초기화 플래그 리셋
    if (!open) {
      isInitializedRef.current = false;
    }
  }, [open]); // groupedModel 의존성 제거 - ref를 통해 최신 값 접근

  // ============================================================================
  // 기본 정보 수정 핸들러
  // ============================================================================

  const handleSaveClick = useCallback(() => {
    if (!hasChanges) {
      enqueueSnackbar('변경된 내용이 없습니다', { variant: 'info' });
      return;
    }
    setSaveDialogOpen(true);
  }, [hasChanges, enqueueSnackbar]);

  const handleSave = useCallback(async () => {
    if (localVariants.length === 0) return;

    setSaving(true);
    try {
      // 모든 variants에 대해 업데이트 수행
      const updatePromises = localVariants.map((variant) =>
        ssotModelsApi.update(variant.id, {
          model_name: formData.model_name,
          series: formData.series,
          connectivity: formData.connectivity,
          is_active: formData.is_active,
        })
      );

      await Promise.all(updatePromises);

      enqueueSnackbar(`${localVariants.length}개 모델이 수정되었습니다`, {
        variant: 'success',
      });
      setSaveDialogOpen(false);
      // 모달 닫기 (shouldRefresh=true로 부모에서 데이터 갱신)
      onClose(true);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '수정에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [localVariants, formData, onClose, enqueueSnackbar]);

  // ============================================================================
  // 용량 추가 핸들러
  // ============================================================================

  const handleStorageToggle = useCallback((storage: number) => {
    setNewStorages((prev) => {
      const newList = prev.includes(storage)
        ? prev.filter((s) => s !== storage)
        : [...prev, storage].sort((a, b) => a - b);
      return newList;
    });
    setStorageValidation(null);
  }, []);

  const handleValidateStorages = useCallback(async () => {
    if (localVariants.length === 0 || newStorages.length === 0) return;

    const firstVariant = localVariants[0];
    setValidating(true);

    try {
      const response = await ssotModelsApi.validateBulkJson({
        models: [
          {
            device_type: firstVariant.device_type,
            manufacturer: firstVariant.manufacturer,
            series: formData.series,
            model_name: formData.model_name,
            storage_gb: newStorages,
            connectivity: formData.connectivity,
          },
        ],
      });
      setStorageValidation(response.data.data);

      if (response.data.data.valid_count === 0) {
        enqueueSnackbar('추가 가능한 용량이 없습니다. 오류를 확인하세요.', { variant: 'warning' });
      } else {
        setStorageAddDialogOpen(true);
      }
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '검증에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setValidating(false);
    }
  }, [localVariants, newStorages, formData, enqueueSnackbar]);

  const handleAddStorages = useCallback(async () => {
    if (!storageValidation) return;

    setAddingStorage(true);
    try {
      const response = await ssotModelsApi.commitBulk(storageValidation.validation_id);
      
      enqueueSnackbar(`${response.data.data.created_count}개 용량이 추가되었습니다`, {
        variant: 'success',
      });
      
      setStorageAddDialogOpen(false);
      setNewStorages([]);
      setStorageValidation(null);
      
      // 모달 닫기 (shouldRefresh=true로 부모에서 데이터 갱신)
      onClose(true);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '추가에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setAddingStorage(false);
    }
  }, [storageValidation, onClose, enqueueSnackbar]);

  // ============================================================================
  // 용량 삭제 핸들러
  // ============================================================================

  const handleDeleteStorageClick = useCallback((variant: SSOTModel) => {
    setDeleteTargetVariant(variant);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteStorage = useCallback(async () => {
    if (!deleteTargetVariant) return;

    setDeleting(true);
    try {
      await ssotModelsApi.delete(deleteTargetVariant.id);
      enqueueSnackbar(`${deleteTargetVariant.storage_display} 용량이 삭제되었습니다`, {
        variant: 'success',
      });
      setDeleteDialogOpen(false);
      setDeleteTargetVariant(null);

      // 모달 닫기 (shouldRefresh=true로 부모에서 데이터 갱신)
      onClose(true);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '삭제에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [deleteTargetVariant, onClose, enqueueSnackbar]);

  // ============================================================================
  // 렌더링
  // ============================================================================

  if (!groupedModel) return null;

  return (
    <>
      <Dialog
        open={open}
        onClose={() => onClose()}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 4,
            overflow: 'hidden',
          },
        }}
      >
        {/* ========== 헤더 ========== */}
        <DialogTitle
          sx={{
            p: 0,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            color: 'white',
          }}
        >
          <Box
            sx={{
              p: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={2}>
              <Avatar
                sx={{
                  width: 52,
                  height: 52,
                  bgcolor: alpha('#ffffff', 0.15),
                  backdropFilter: 'blur(10px)',
                  border: `1px solid ${alpha('#ffffff', 0.2)}`,
                }}
              >
                <EditIcon sx={{ fontSize: 28 }} />
              </Avatar>
              <Box>
                <Typography variant="h5" fontWeight={700}>
                  모델 수정
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.85 }}>
                  {manufacturerLabels[manufacturer]} {groupedModel.model_name}
                </Typography>
              </Box>
            </Stack>
            <IconButton onClick={() => onClose()} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
              {/* ========== 좌측: 기본 정보 수정 ========== */}
              <Grid item xs={12} md={6}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 3,
                    height: '100%',
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: theme.palette.primary.main,
                      }}
                    >
                      <InfoIcon fontSize="small" />
                    </Avatar>
                    <Typography variant="subtitle1" fontWeight={700}>
                      기본 정보
                    </Typography>
                    {hasChanges && (
                      <Chip
                        label="변경됨"
                        size="small"
                        color="warning"
                        sx={{ fontWeight: 600 }}
                      />
                    )}
                  </Stack>

                  <Stack spacing={2.5}>
                    {/* 모델명 */}
                    <TextField
                      fullWidth
                      size="small"
                      label="모델명"
                      value={formData.model_name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, model_name: e.target.value }))
                      }
                      helperText="표시용 모델명을 입력하세요"
                    />

                    {/* 시리즈 - 선택형 (오타 방지) */}
                    <FormControl fullWidth size="small">
                      <InputLabel>시리즈</InputLabel>
                      <Select
                        value={formData.series}
                        label="시리즈"
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, series: e.target.value }))
                        }
                      >
                        {availableSeries.map((series) => (
                          <MenuItem key={series} value={series}>
                            {series}
                          </MenuItem>
                        ))}
                        {/* 기존 시리즈가 목록에 없으면 추가 표시 */}
                        {formData.series && !availableSeries.includes(formData.series) && (
                          <MenuItem value={formData.series}>
                            {formData.series} (기존값)
                          </MenuItem>
                        )}
                      </Select>
                    </FormControl>

                    {/* 연결성 */}
                    <FormControl fullWidth size="small">
                      <InputLabel>연결성</InputLabel>
                      <Select
                        value={formData.connectivity}
                        label="연결성"
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            connectivity: e.target.value,
                          }))
                        }
                      >
                        {connectivityOptions[deviceType]?.map((c) => (
                          <MenuItem key={c.value} value={c.value}>
                            {c.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {/* 활성 상태 */}
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: formData.is_active
                          ? alpha(theme.palette.success.main, 0.05)
                          : alpha(theme.palette.error.main, 0.05),
                        borderColor: formData.is_active
                          ? theme.palette.success.main
                          : theme.palette.error.main,
                      }}
                    >
                      <FormControlLabel
                        control={
                          <Switch
                            checked={formData.is_active}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                is_active: e.target.checked,
                              }))
                            }
                            color={formData.is_active ? 'success' : 'error'}
                          />
                        }
                        label={
                          <Stack direction="row" alignItems="center" spacing={1}>
                            {formData.is_active ? (
                              <CheckCircleIcon fontSize="small" color="success" />
                            ) : (
                              <ErrorIcon fontSize="small" color="error" />
                            )}
                            <Typography fontWeight={600}>
                              {formData.is_active ? '활성 상태' : '비활성 상태'}
                            </Typography>
                          </Stack>
                        }
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mt: 0.5, ml: 6 }}
                      >
                        비활성화하면 가격 목록에서 숨겨집니다
                      </Typography>
                    </Paper>

                    {/* 저장 버튼 */}
                    <Button
                      variant="contained"
                      fullWidth
                      startIcon={
                        saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />
                      }
                      onClick={handleSaveClick}
                      disabled={!hasChanges || saving}
                      sx={{
                        py: 1.5,
                        fontWeight: 700,
                        boxShadow: shadows.md,
                        '&:hover': {
                          boxShadow: shadows.lg,
                        },
                      }}
                    >
                      {saving ? '저장 중...' : '기본 정보 저장'}
                    </Button>
                  </Stack>
                </Paper>
              </Grid>

              {/* ========== 우측: 용량 관리 ========== */}
              <Grid item xs={12} md={6}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 3,
                    height: '100%',
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        bgcolor: alpha(theme.palette.secondary.main, 0.1),
                        color: theme.palette.secondary.main,
                      }}
                    >
                      <MemoryIcon fontSize="small" />
                    </Avatar>
                    <Typography variant="subtitle1" fontWeight={700}>
                      용량 관리
                    </Typography>
                  </Stack>

                  {/* 현재 등록된 용량 */}
                  <Box sx={{ mb: 3 }}>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color="text.secondary"
                      sx={{ mb: 1.5 }}
                    >
                      현재 등록된 용량 ({localVariants.length}개)
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={1}>
                      {localVariants
                        .sort((a, b) => a.storage_gb - b.storage_gb)
                        .map((variant) => (
                          <Chip
                            key={variant.id}
                            icon={<StorageIcon />}
                            label={variant.storage_display}
                            color="primary"
                            variant="outlined"
                            onDelete={
                              localVariants.length > 1
                                ? () => handleDeleteStorageClick(variant)
                                : undefined
                            }
                            deleteIcon={
                              <Tooltip title="이 용량 삭제">
                                <DeleteIcon fontSize="small" />
                              </Tooltip>
                            }
                            sx={{
                              fontWeight: 600,
                              py: 2.5,
                              fontSize: '0.95rem',
                              '& .MuiChip-deleteIcon': {
                                color: theme.palette.error.main,
                                '&:hover': {
                                  color: theme.palette.error.dark,
                                },
                              },
                            }}
                          />
                        ))}
                    </Stack>
                    {localVariants.length === 1 && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        * 마지막 용량은 삭제할 수 없습니다
                      </Typography>
                    )}
                  </Box>

                  <Divider sx={{ mb: 3 }} />

                  {/* 새 용량 추가 */}
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color="text.secondary"
                      sx={{ mb: 1.5 }}
                    >
                      새 용량 추가
                    </Typography>

                    {availableStorages.length === 0 ? (
                      <Alert severity="info" sx={{ borderRadius: 2 }}>
                        모든 용량이 이미 등록되어 있습니다.
                      </Alert>
                    ) : (
                      <>
                        <Grid container spacing={1} sx={{ mb: 2 }}>
                          {availableStorages.map((option) => {
                            const isSelected = newStorages.includes(option.value);
                            return (
                              <Grid item xs={4} key={option.value}>
                                <Paper
                                  onClick={() => handleStorageToggle(option.value)}
                                  variant={isSelected ? 'elevation' : 'outlined'}
                                  sx={{
                                    p: 1.5,
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    bgcolor: isSelected
                                      ? theme.palette.secondary.main
                                      : 'background.paper',
                                    color: isSelected ? 'white' : 'text.primary',
                                    transition: transitions.fast,
                                    borderRadius: 2,
                                    '&:hover': {
                                      bgcolor: isSelected
                                        ? theme.palette.secondary.dark
                                        : alpha(theme.palette.secondary.main, 0.08),
                                      transform: 'scale(1.02)',
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

                        {/* 선택된 새 용량 표시 */}
                        <Collapse in={newStorages.length > 0}>
                          <Paper
                            sx={{
                              p: 2,
                              mb: 2,
                              borderRadius: 2,
                              bgcolor: alpha(theme.palette.success.main, 0.08),
                              border: `1px solid ${theme.palette.success.main}`,
                            }}
                          >
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                            >
                              <Typography variant="body2" color="success.dark" fontWeight={600}>
                                추가할 용량
                              </Typography>
                              <Stack direction="row" spacing={0.5}>
                                {newStorages.map((s) => (
                                  <Chip
                                    key={s}
                                    label={getStorageDisplay(s)}
                                    size="small"
                                    color="success"
                                    onDelete={() => handleStorageToggle(s)}
                                  />
                                ))}
                              </Stack>
                            </Stack>
                          </Paper>
                        </Collapse>

                        {/* 용량 추가 버튼 */}
                        <Button
                          variant="contained"
                          color="secondary"
                          fullWidth
                          startIcon={
                            validating ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : (
                              <AddIcon />
                            )
                          }
                          onClick={handleValidateStorages}
                          disabled={newStorages.length === 0 || validating}
                          sx={{
                            py: 1.5,
                            fontWeight: 700,
                            boxShadow: shadows.md,
                            '&:hover': {
                              boxShadow: shadows.lg,
                            },
                          }}
                        >
                          {validating ? '검증 중...' : `용량 추가 (${newStorages.length}개)`}
                        </Button>
                      </>
                    )}
                  </Box>
                </Paper>
              </Grid>
            </Grid>

            {/* 불변 필드 안내 */}
            <Alert
              severity="info"
              icon={<InfoIcon />}
              sx={{ mt: 3, borderRadius: 2 }}
            >
              <AlertTitle>불변 필드 안내</AlertTitle>
              <Typography variant="body2">
                <strong>model_key</strong>, <strong>model_code</strong>, <strong>storage_gb</strong>는
                데이터 무결성을 위해 수정할 수 없습니다. 용량 변경은 추가/삭제로만 가능합니다.
              </Typography>
            </Alert>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button onClick={() => onClose()} variant="outlined">
            닫기
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== 기본 정보 저장 확인 다이얼로그 ========== */}
      <ConfirmDialog
        open={saveDialogOpen}
        title="기본 정보 저장"
        confirmLabel="저장"
        confirmColor="primary"
        loading={saving}
        onConfirm={handleSave}
        onCancel={() => setSaveDialogOpen(false)}
      >
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>변경 사항</AlertTitle>
            <Typography variant="body2">
              {localVariants.length}개 모델에 동일하게 적용됩니다.
            </Typography>
          </Alert>
          <Stack spacing={1}>
            {localVariants.length > 0 && formData.model_name !== localVariants[0].model_name && (
              <Chip
                label={`모델명: ${localVariants[0].model_name} → ${formData.model_name}`}
                size="small"
                color="warning"
              />
            )}
            {localVariants.length > 0 && formData.series !== localVariants[0].series && (
              <Chip
                label={`시리즈: ${localVariants[0].series} → ${formData.series}`}
                size="small"
                color="warning"
              />
            )}
            {localVariants.length > 0 && formData.is_active !== localVariants[0].is_active && (
              <Chip
                label={`상태: ${localVariants[0].is_active ? '활성' : '비활성'} → ${formData.is_active ? '활성' : '비활성'}`}
                size="small"
                color={formData.is_active ? 'success' : 'error'}
              />
            )}
          </Stack>
        </Box>
      </ConfirmDialog>

      {/* ========== 용량 추가 확인 다이얼로그 ========== */}
      <ConfirmDialog
        open={storageAddDialogOpen}
        title="용량 추가 확정"
        confirmLabel="추가"
        confirmColor="success"
        loading={addingStorage}
        onConfirm={handleAddStorages}
        onCancel={() => setStorageAddDialogOpen(false)}
      >
        <Box>
          <Alert severity="success" sx={{ mb: 2 }}>
            <AlertTitle>추가할 용량</AlertTitle>
            <Typography variant="h5" fontWeight="bold" color="success.main">
              {storageValidation?.valid_count ?? 0}개
            </Typography>
          </Alert>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {newStorages.map((s) => (
              <Chip
                key={s}
                icon={<StorageIcon />}
                label={getStorageDisplay(s)}
                color="success"
                variant="outlined"
              />
            ))}
          </Stack>
          {storageValidation && storageValidation.error_count > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {storageValidation.error_count}개 용량에 오류가 있어 추가되지 않습니다.
            </Alert>
          )}
        </Box>
      </ConfirmDialog>

      {/* ========== 용량 삭제 확인 다이얼로그 ========== */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="용량 삭제"
        confirmLabel="삭제"
        confirmColor="error"
        loading={deleting}
        onConfirm={handleDeleteStorage}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteTargetVariant(null);
        }}
      >
        <Box>
          <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
            <AlertTitle>삭제 경고</AlertTitle>
            이 작업은 되돌릴 수 없습니다.
          </Alert>
          {deleteTargetVariant && (
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.error.main, 0.05),
                borderColor: theme.palette.error.main,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar sx={{ bgcolor: theme.palette.error.main }}>
                  <StorageIcon />
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {deleteTargetVariant.full_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    모델코드: {deleteTargetVariant.model_code}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            연관된 가격 정보도 함께 삭제됩니다.
          </Typography>
        </Box>
      </ConfirmDialog>
    </>
  );
}
