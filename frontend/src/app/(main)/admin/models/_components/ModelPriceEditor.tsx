/**
 * 모델 가격 편집기 (메인 컴포넌트)
 * 
 * 프리미엄 UI 특징:
 * - 그라데이션 헤더 (아이콘 + 제목 + 버튼)
 * - 통계 카드 3개 (애니메이션)
 * - 필터 + 모델 카드 목록
 * 
 * 기능:
 * - 가격 편집 및 저장
 * - 선택/전체선택
 * - 단일/일괄 삭제 (연관 가격정보 포함)
 * - 가격 변경 히스토리 조회
 * - 삭제 히스토리 조회
 * 
 * SSOT: 모든 색상은 theme/tokens에서 가져옴
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  CircularProgress,
  Alert,
  AlertTitle,
  IconButton,
  Tooltip,
  Pagination,
  Paper,
  Avatar,
  Grid,
  Checkbox,
  Chip,
  alpha,
  useTheme,
  Theme,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  FilterAlt as FilterIcon,
  Clear as ClearIcon,
  Smartphone as SmartphoneIcon,
  Tablet as TabletIcon,
  Watch as WatchIcon,
  Apple as AppleIcon,
  PhoneAndroid as SamsungIcon,
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  DeleteForever as DeleteForeverIcon,
  History as HistoryIcon,
  TrendingUp as TrendingUpIcon,
  PriceCheck as PriceCheckIcon,
  PriceChange as PriceChangeIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { ssotModelsApi, gradesApi, GradePriceItem } from '@/lib/api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ChangeTracker } from './ChangeTracker';
import { ModelPriceCard } from './ModelPriceCard';
import { PriceHistoryModal } from './PriceHistoryModal';
import { DeletedHistoryModal } from './DeletedHistoryModal';
import { ModelRegisterModal } from './ModelRegisterModal';
import { ModelEditModal } from './ModelEditModal';
import { shadows, transitions } from '@/theme/tokens';
import {
  SSOTModel,
  Grade,
  GroupedModel,
  PriceChange,
  PriceStats,
  FilterOptions,
  DeviceType,
  Manufacturer,
  createChangeKey,
  deviceTypeLabels,
  manufacturerLabels,
} from './types';

interface ModelPriceEditorProps {
  deviceType: DeviceType;
  manufacturer: Manufacturer;
}

// 페이지당 모델 수
const MODELS_PER_PAGE = 20;

// ============================================================================
// 시리즈 필터 그룹 정의
// ============================================================================

interface SeriesGroup {
  label: string;       // 표시 이름
  matchPrefix: string; // 시리즈 매칭 프리픽스 (대소문자 무시)
  color: string;       // Chip 색상
}

/** Samsung 시리즈 그룹 (대분류) */
const SAMSUNG_SERIES_GROUPS: SeriesGroup[] = [
  { label: 'Galaxy S', matchPrefix: 'Galaxy S', color: '#1428A0' },
  { label: 'Galaxy Note', matchPrefix: 'Galaxy Note', color: '#FF6F00' },
  { label: 'Galaxy Z Fold', matchPrefix: 'Galaxy Z Fold', color: '#6A1B9A' },
  { label: 'Galaxy Z Flip', matchPrefix: 'Galaxy Z Flip', color: '#00838F' },
];

/** Apple 시리즈 그룹 (세대별) */
const APPLE_SERIES_GROUPS: SeriesGroup[] = [
  { label: 'iPhone 16', matchPrefix: 'iPhone 16', color: '#5E5CE6' },
  { label: 'iPhone 15', matchPrefix: 'iPhone 15', color: '#BF5AF2' },
  { label: 'iPhone 14', matchPrefix: 'iPhone 14', color: '#FF375F' },
  { label: 'iPhone 13', matchPrefix: 'iPhone 13', color: '#FF9F0A' },
  { label: 'iPhone 12', matchPrefix: 'iPhone 12', color: '#30D158' },
  { label: 'iPhone 11', matchPrefix: 'iPhone 11', color: '#64D2FF' },
  { label: 'iPhone X', matchPrefix: 'iPhone X', color: '#AC8E68' },
  { label: 'iPhone SE', matchPrefix: 'iPhone SE', color: '#8E8E93' },
  { label: 'iPhone 8', matchPrefix: 'iPhone 8', color: '#636366' },
  { label: 'iPhone 7', matchPrefix: 'iPhone 7', color: '#48484A' },
];

/** 제조사별 시리즈 그룹 매핑 */
const SERIES_GROUPS_BY_MANUFACTURER: Record<Manufacturer, SeriesGroup[]> = {
  samsung: SAMSUNG_SERIES_GROUPS,
  apple: APPLE_SERIES_GROUPS,
};

// 디바이스 타입 아이콘
const deviceIcons: Record<DeviceType, React.ReactNode> = {
  smartphone: <SmartphoneIcon />,
  tablet: <TabletIcon />,
  wearable: <WatchIcon />,
};

// 제조사 아이콘
const manufacturerIcons: Record<Manufacturer, React.ReactNode> = {
  apple: <AppleIcon />,
  samsung: <SamsungIcon />,
};

// 디바이스 타입별 그라데이션 (테마 기반)
const getDeviceGradient = (deviceType: DeviceType, theme: Theme) => {
  const colors = {
    smartphone: {
      start: theme.palette.primary.main,
      end: theme.palette.primary.dark,
    },
    tablet: {
      start: theme.palette.secondary.main,
      end: alpha(theme.palette.secondary.dark, 0.9),
    },
    wearable: {
      start: theme.palette.info.main,
      end: theme.palette.info.dark,
    },
  };
  return `linear-gradient(135deg, ${colors[deviceType].start} 0%, ${colors[deviceType].end} 100%)`;
};

// 통계 카드 컴포넌트
function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'warning';
}) {
  const theme = useTheme();
  const colorMap = {
    primary: theme.palette.primary.main,
    success: theme.palette.success.main,
    warning: theme.palette.warning.main,
  };
  const bgColorMap = {
    primary: alpha(theme.palette.primary.main, 0.08),
    success: alpha(theme.palette.success.main, 0.08),
    warning: alpha(theme.palette.warning.main, 0.08),
  };

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: shadows.sm,
        transition: transitions.normal,
        overflow: 'hidden',
        '&:hover': {
          boxShadow: shadows.md,
          transform: 'translateY(-2px)',
          '& .stat-icon': {
            transform: 'scale(1.1)',
          },
        },
      }}
    >
      <Box
        sx={{
          height: 4,
          background: `linear-gradient(90deg, ${colorMap[color]}, ${alpha(colorMap[color], 0.6)})`,
        }}
      />
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
              {title}
            </Typography>
            <Typography
              variant="h3"
              fontWeight={800}
              sx={{ color: colorMap[color], letterSpacing: '-0.02em' }}
            >
              {value.toLocaleString()}
            </Typography>
          </Box>
          <Avatar
            className="stat-icon"
            sx={{
              width: 48,
              height: 48,
              bgcolor: bgColorMap[color],
              color: colorMap[color],
              transition: transitions.normal,
            }}
          >
            {icon}
          </Avatar>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ModelPriceEditor({ deviceType, manufacturer }: ModelPriceEditorProps) {
  const router = useRouter();
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  // 데이터 상태
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<SSOTModel[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);

  // 필터 상태
  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    priceStatus: 'all',
    series: '',
  });

  // 페이지네이션
  const [page, setPage] = useState(1);

  // 변경 추적
  const [changes, setChanges] = useState<Map<string, PriceChange>>(new Map());

  // 저장 상태
  const [saving, setSaving] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // 선택 상태
  const [selectedModelKeys, setSelectedModelKeys] = useState<Set<string>>(new Set());

  // 삭제 관련 상태
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'single' | 'bulk';
    modelId?: string;
    modelName?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 히스토리 모달 상태
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyTargetModel, setHistoryTargetModel] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // 삭제 히스토리 모달 상태
  const [deletedHistoryModalOpen, setDeletedHistoryModalOpen] = useState(false);

  // 모델 등록 모달 상태
  const [registerModalOpen, setRegisterModalOpen] = useState(false);

  // 모델 수정 모달 상태
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTargetModel, setEditTargetModel] = useState<GroupedModel | null>(null);

  // 모델 그룹화 (model_key 기준)
  const groupedModels = useMemo(() => {
    const groups = new Map<string, GroupedModel>();

    models.forEach((model) => {
      const existing = groups.get(model.model_key);
      if (existing) {
        existing.variants.push(model);
      } else {
        groups.set(model.model_key, {
          model_key: model.model_key,
          model_name: model.model_name,
          series: model.series,
          variants: [model],
        });
      }
    });

    return Array.from(groups.values());
  }, [models]);

  // 시리즈 목록 추출
  const seriesList = useMemo(() => {
    const set = new Set<string>();
    models.forEach((m) => set.add(m.series));
    return Array.from(set).sort();
  }, [models]);

  // 필터링된 모델
  const filteredModels = useMemo(() => {
    return groupedModels.filter((group) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          group.model_name.toLowerCase().includes(searchLower) ||
          group.model_key.toLowerCase().includes(searchLower) ||
          group.series.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // 시리즈 필터: prefix 매칭 (시리즈 그룹 Chip 지원)
      if (filters.series) {
        const seriesLower = group.series.toLowerCase();
        const filterLower = filters.series.toLowerCase();
        // 정확히 일치하거나 prefix로 시작하는 경우
        if (!seriesLower.startsWith(filterLower) && seriesLower !== filterLower) {
          return false;
        }
      }

      if (filters.priceStatus !== 'all') {
        const hasAllPrices = group.variants.every((v) =>
          grades.every((g) => {
            const gp = v.grade_prices.find((p) => p.grade_id === g.id);
            return gp && gp.price > 0;
          })
        );

        if (filters.priceStatus === 'configured' && !hasAllPrices) return false;
        if (filters.priceStatus === 'unconfigured' && hasAllPrices) return false;
      }

      return true;
    });
  }, [groupedModels, filters, grades]);

  // 페이지네이션 적용
  const paginatedModels = useMemo(() => {
    const start = (page - 1) * MODELS_PER_PAGE;
    return filteredModels.slice(start, start + MODELS_PER_PAGE);
  }, [filteredModels, page]);

  // 총 페이지 수
  const totalPages = Math.ceil(filteredModels.length / MODELS_PER_PAGE);

  // 통계 계산
  const stats = useMemo((): PriceStats => {
    let configuredCount = 0;
    let unconfiguredCount = 0;
    const totalConfigurations = models.length * grades.length;

    models.forEach((model) => {
      grades.forEach((grade) => {
        const gp = model.grade_prices.find((p) => p.grade_id === grade.id);
        const changeKey = createChangeKey(model.id, grade.id);
        const change = changes.get(changeKey);

        const price = change ? change.newPrice : gp?.price || 0;
        if (price > 0) {
          configuredCount++;
        } else {
          unconfiguredCount++;
        }
      });
    });

    return {
      totalModels: models.length,
      totalConfigurations,
      configuredCount,
      unconfiguredCount,
    };
  }, [models, grades, changes]);

  // 전체 선택 여부 확인
  const isAllSelected = useMemo(() => {
    if (filteredModels.length === 0) return false;
    return filteredModels.every((group) => selectedModelKeys.has(group.model_key));
  }, [filteredModels, selectedModelKeys]);

  // 일부 선택 여부 확인
  const isSomeSelected = useMemo(() => {
    if (filteredModels.length === 0) return false;
    const selectedCount = filteredModels.filter((group) =>
      selectedModelKeys.has(group.model_key)
    ).length;
    return selectedCount > 0 && selectedCount < filteredModels.length;
  }, [filteredModels, selectedModelKeys]);

  // 선택된 모델 ID 목록 (스토리지 변형 포함)
  const selectedModelIds = useMemo(() => {
    const ids: string[] = [];
    groupedModels.forEach((group) => {
      if (selectedModelKeys.has(group.model_key)) {
        group.variants.forEach((v) => ids.push(v.id));
      }
    });
    return ids;
  }, [groupedModels, selectedModelKeys]);

  // 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsRes, gradesRes] = await Promise.all([
        ssotModelsApi.list({
          device_type: deviceType,
          manufacturer: manufacturer,
          page_size: 1000,
          is_active: true,
        }),
        gradesApi.list({ is_active: true }),
      ]);

      setModels(modelsRes.data.data.models as SSOTModel[]);
      setGrades(
        (gradesRes.data.data.grades as Grade[]).sort((a, b) => a.sort_order - b.sort_order)
      );
      setChanges(new Map());
      setSelectedModelKeys(new Set());
    } catch (error) {
      enqueueSnackbar('데이터를 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [deviceType, manufacturer, enqueueSnackbar]);

  // 초기 로드
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 필터 변경 시 페이지 리셋
  useEffect(() => {
    setPage(1);
    setSelectedModelKeys(new Set());
  }, [filters]);

  // 가격 변경 핸들러
  const handlePriceChange = useCallback(
    (
      modelId: string,
      gradeId: string,
      gradeName: string,
      originalPrice: number,
      newPrice: number
    ) => {
      setChanges((prev) => {
        const newChanges = new Map(prev);
        const key = createChangeKey(modelId, gradeId);

        if (newPrice === originalPrice) {
          newChanges.delete(key);
        } else {
          const model = models.find((m) => m.id === modelId);
          newChanges.set(key, {
            modelId,
            storageGb: model?.storage_gb || 0,
            gradeId,
            gradeName,
            originalPrice,
            newPrice,
          });
        }

        return newChanges;
      });
    },
    [models]
  );

  // 변경 취소
  const handleCancel = useCallback(() => {
    setChanges(new Map());
  }, []);

  // 저장 확인
  const handleSaveClick = useCallback(() => {
    setConfirmDialogOpen(true);
  }, []);

  // 저장 실행
  const handleSave = useCallback(async () => {
    if (changes.size === 0) return;

    setSaving(true);
    try {
      const modelChanges = new Map<string, GradePriceItem[]>();

      changes.forEach((change) => {
        const existing = modelChanges.get(change.modelId) || [];
        existing.push({
          grade_id: change.gradeId,
          price: change.newPrice,
        });
        modelChanges.set(change.modelId, existing);
      });

      const promises = Array.from(modelChanges.entries()).map(([modelId, prices]) =>
        ssotModelsApi.updatePrices(modelId, {
          model_id: modelId,
          prices,
        })
      );

      await Promise.all(promises);

      enqueueSnackbar(`${changes.size}개 가격이 저장되었습니다`, { variant: 'success' });
      setConfirmDialogOpen(false);

      await loadData();
    } catch (error) {
      enqueueSnackbar('저장에 실패했습니다', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [changes, loadData, enqueueSnackbar]);

  // 필터 초기화
  const handleResetFilters = useCallback(() => {
    setFilters({
      search: '',
      priceStatus: 'all',
      series: '',
    });
  }, []);

  // 뒤로가기
  const handleBack = useCallback(() => {
    router.push('/admin/models');
  }, [router]);

  // 선택 토글
  const handleSelectChange = useCallback((modelKey: string, selected: boolean) => {
    setSelectedModelKeys((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(modelKey);
      } else {
        next.delete(modelKey);
      }
      return next;
    });
  }, []);

  // 전체 선택/해제
  const handleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedModelKeys(new Set());
    } else {
      const allKeys = new Set(filteredModels.map((g) => g.model_key));
      setSelectedModelKeys(allKeys);
    }
  }, [isAllSelected, filteredModels]);

  // 단일 모델 삭제 클릭 (변형 단위)
  const handleDeleteVariant = useCallback(
    (modelId: string) => {
      const model = models.find((m) => m.id === modelId);
      if (!model) return;

      setDeleteTarget({
        type: 'single',
        modelId,
        modelName: model.full_name,
      });
      setDeleteDialogOpen(true);
    },
    [models]
  );

  // 선택된 모델 일괄 삭제 클릭
  const handleBulkDeleteClick = useCallback(() => {
    if (selectedModelIds.length === 0) return;

    setDeleteTarget({
      type: 'bulk',
    });
    setDeleteDialogOpen(true);
  }, [selectedModelIds]);

  // 삭제 실행
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      if (deleteTarget.type === 'single' && deleteTarget.modelId) {
        await ssotModelsApi.delete(deleteTarget.modelId);
        enqueueSnackbar(`${deleteTarget.modelName}이(가) 삭제되었습니다`, {
          variant: 'success',
        });
      } else {
        const res = await ssotModelsApi.deleteBulk(selectedModelIds);
        const deletedCount = res.data.data.deleted_count;
        enqueueSnackbar(`${deletedCount}개 모델이 삭제되었습니다`, { variant: 'success' });
      }

      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      await loadData();
    } catch (error) {
      enqueueSnackbar('삭제에 실패했습니다', { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedModelIds, loadData, enqueueSnackbar]);

  // 히스토리 보기
  const handleViewHistory = useCallback(
    (modelId: string) => {
      const model = models.find((m) => m.id === modelId);
      if (!model) return;

      setHistoryTargetModel({
        id: modelId,
        name: model.full_name,
      });
      setHistoryModalOpen(true);
    },
    [models]
  );

  // 모델 수정 핸들러
  const handleEditModel = useCallback((groupedModel: GroupedModel) => {
    setEditTargetModel(groupedModel);
    setEditModalOpen(true);
  }, []);

  // 로딩 스켈레톤
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 400,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* ========== 그라데이션 헤더 ========== */}
      <Paper
        sx={{
          mb: 3,
          borderRadius: 3,
          overflow: 'hidden',
          background: getDeviceGradient(deviceType, theme),
          boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.25)}`,
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            right: 0,
            width: '40%',
            height: '100%',
            background: `radial-gradient(circle at 80% 50%, ${alpha('#ffffff', 0.1)} 0%, transparent 60%)`,
          },
        }}
      >
        <Box
          sx={{
            p: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={2.5}>
            <Avatar
              sx={{
                width: 56,
                height: 56,
                bgcolor: alpha('#ffffff', 0.15),
                backdropFilter: 'blur(10px)',
                border: `1px solid ${alpha('#ffffff', 0.2)}`,
              }}
            >
              {deviceIcons[deviceType]}
            </Avatar>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography
                  variant="h5"
                  fontWeight={700}
                  color="white"
                  sx={{ letterSpacing: '-0.01em' }}
                >
                  {manufacturerLabels[manufacturer]} {deviceTypeLabels[deviceType]}
                </Typography>
                <Avatar
                  sx={{
                    width: 26,
                    height: 26,
                    bgcolor: alpha('#ffffff', 0.25),
                    border: `1px solid ${alpha('#ffffff', 0.3)}`,
                  }}
                >
                  {manufacturerIcons[manufacturer]}
                </Avatar>
              </Stack>
              <Typography
                variant="body2"
                sx={{ color: alpha('#ffffff', 0.8), mt: 0.25 }}
              >
                등급별 가격을 설정하고 관리합니다
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={handleBack}
              sx={{
                color: 'white',
                borderColor: alpha('#ffffff', 0.4),
                borderWidth: 1.5,
                fontWeight: 600,
                '&:hover': {
                  borderColor: 'white',
                  bgcolor: alpha('#ffffff', 0.1),
                  borderWidth: 1.5,
                },
              }}
            >
              목록으로
            </Button>
            <Tooltip title="삭제 히스토리 보기">
              <Button
                variant="outlined"
                startIcon={<HistoryIcon />}
                onClick={() => setDeletedHistoryModalOpen(true)}
                sx={{
                  color: 'white',
                  borderColor: alpha('#ffffff', 0.4),
                  borderWidth: 1.5,
                  fontWeight: 600,
                  '&:hover': {
                    borderColor: 'white',
                    bgcolor: alpha('#ffffff', 0.1),
                    borderWidth: 1.5,
                  },
                }}
              >
                삭제 기록
              </Button>
            </Tooltip>
            {/* 모델 등록 버튼 - 하이라이트 */}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setRegisterModalOpen(true)}
              sx={{
                bgcolor: 'white',
                color: theme.palette.primary.main,
                fontWeight: 700,
                boxShadow: shadows.md,
                '&:hover': {
                  bgcolor: alpha('#ffffff', 0.9),
                  boxShadow: shadows.lg,
                  transform: 'translateY(-1px)',
                },
              }}
            >
              모델 등록
            </Button>
            {changes.size > 0 && (
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveClick}
                sx={{
                  bgcolor: theme.palette.success.main,
                  color: 'white',
                  fontWeight: 700,
                  boxShadow: shadows.md,
                  '&:hover': {
                    bgcolor: theme.palette.success.dark,
                    boxShadow: shadows.lg,
                  },
                }}
              >
                저장 ({changes.size})
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>

      {/* ========== 통계 카드 3개 ========== */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <StatCard
            title="전체 모델"
            value={stats.totalModels}
            icon={<TrendingUpIcon />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatCard
            title="가격 설정됨"
            value={stats.configuredCount}
            icon={<PriceCheckIcon />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatCard
            title="가격 미설정"
            value={stats.unconfiguredCount}
            icon={<PriceChangeIcon />}
            color="warning"
          />
        </Grid>
      </Grid>

      {/* ========== 변경 추적 바 ========== */}
      <ChangeTracker
        stats={stats}
        changes={changes}
        onSave={handleSaveClick}
        onCancel={handleCancel}
        saving={saving}
      />

      {/* ========== 시리즈 빠른 필터 (Chip) ========== */}
      <Card
        sx={{
          mb: 2,
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: shadows.sm,
          background: theme.palette.mode === 'dark'
            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`
            : `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.06)} 0%, ${theme.palette.background.paper} 100%)`,
        }}
      >
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
            <FilterIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
              시리즈 빠른 필터
            </Typography>
            {filters.series && (
              <Chip
                label="전체 보기"
                size="small"
                variant="outlined"
                onClick={() => setFilters((prev) => ({ ...prev, series: '' }))}
                sx={{ ml: 1, fontWeight: 500 }}
              />
            )}
          </Stack>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {SERIES_GROUPS_BY_MANUFACTURER[manufacturer].map((group) => {
              const isSelected = filters.series.toLowerCase() === group.matchPrefix.toLowerCase();
              return (
                <Chip
                  key={group.matchPrefix}
                  label={group.label}
                  onClick={() => {
                    if (isSelected) {
                      setFilters((prev) => ({ ...prev, series: '' }));
                    } else {
                      setFilters((prev) => ({ ...prev, series: group.matchPrefix }));
                    }
                  }}
                  variant={isSelected ? 'filled' : 'outlined'}
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    py: 2.5,
                    px: 0.5,
                    borderRadius: '16px',
                    transition: 'all 0.2s ease-in-out',
                    borderColor: group.color,
                    color: isSelected ? '#fff' : group.color,
                    bgcolor: isSelected ? group.color : 'transparent',
                    '&:hover': {
                      bgcolor: isSelected
                        ? group.color
                        : alpha(group.color, 0.1),
                      transform: 'translateY(-2px)',
                      boxShadow: `0 4px 12px ${alpha(group.color, 0.3)}`,
                    },
                  }}
                />
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      {/* ========== 필터 카드 ========== */}
      <Card
        sx={{
          mb: 3,
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: shadows.sm,
        }}
      >
        <CardContent sx={{ py: 2 }}>
          <Stack
            direction="row"
            spacing={2}
            flexWrap="wrap"
            useFlexGap
            alignItems="center"
          >
            {/* 전체 선택 체크박스 */}
            <Tooltip title={isAllSelected ? '전체 해제' : '전체 선택'}>
              <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isSomeSelected}
                  onChange={handleSelectAll}
                  sx={{ p: 0.5 }}
                />
                <Typography variant="body2" sx={{ ml: 0.5 }}>
                  전체
                </Typography>
              </Box>
            </Tooltip>

            {/* 선택된 항목 수 표시 */}
            {selectedModelKeys.size > 0 && (
              <Chip
                label={`${selectedModelKeys.size}개 선택`}
                color="primary"
                size="small"
                onDelete={() => setSelectedModelKeys(new Set())}
                sx={{ fontWeight: 600 }}
              />
            )}

            {/* 검색 */}
            <TextField
              size="small"
              placeholder="모델명 검색"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              sx={{ minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: filters.search && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {/* 가격 상태 필터 */}
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>가격 상태</InputLabel>
              <Select
                value={filters.priceStatus}
                label="가격 상태"
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    priceStatus: e.target.value as FilterOptions['priceStatus'],
                  }))
                }
              >
                <MenuItem value="all">전체</MenuItem>
                <MenuItem value="configured">설정됨</MenuItem>
                <MenuItem value="unconfigured">미설정</MenuItem>
              </Select>
            </FormControl>

            {/* 시리즈 필터 */}
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>시리즈</InputLabel>
              <Select
                value={filters.series}
                label="시리즈"
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, series: e.target.value }))
                }
              >
                <MenuItem value="">전체</MenuItem>
                {seriesList.map((series) => (
                  <MenuItem key={series} value={series}>
                    {series}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 필터 초기화 */}
            <Button
              variant="outlined"
              startIcon={<FilterIcon />}
              onClick={handleResetFilters}
              size="small"
            >
              초기화
            </Button>

            <Box sx={{ flex: 1 }} />

            {/* 선택 삭제 버튼 */}
            {selectedModelIds.length > 0 && (
              <Button
                variant="contained"
                color="error"
                startIcon={<DeleteForeverIcon />}
                onClick={handleBulkDeleteClick}
                size="small"
                sx={{ fontWeight: 600 }}
              >
                선택 삭제 ({selectedModelIds.length})
              </Button>
            )}

            {/* 표시 정보 */}
            <Typography variant="body2" color="text.secondary">
              표시중: <strong>{filteredModels.length}</strong>개 모델 그룹
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* ========== 모델 리스트 ========== */}
      {filteredModels.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 3 }}>
          <AlertTitle>검색 결과 없음</AlertTitle>
          조건에 맞는 모델이 없습니다. 필터를 조정해 주세요.
        </Alert>
      ) : (
        <Box>
          {/* 모델 카드 목록 */}
          <Stack spacing={0}>
            {paginatedModels.map((group) => (
              <ModelPriceCard
                key={group.model_key}
                groupedModel={group}
                grades={grades}
                changes={changes}
                onPriceChange={handlePriceChange}
                onViewHistory={handleViewHistory}
                onDeleteVariant={handleDeleteVariant}
                onEdit={handleEditModel}
                selected={selectedModelKeys.has(group.model_key)}
                onSelectChange={handleSelectChange}
              />
            ))}
          </Stack>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 2 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, value) => setPage(value)}
                color="primary"
                size="large"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </Box>
      )}

      {/* ========== 저장 확인 다이얼로그 ========== */}
      <ConfirmDialog
        open={confirmDialogOpen}
        title="가격 저장"
        message={`${changes.size}개 가격을 저장하시겠습니까?`}
        confirmLabel="저장"
        confirmColor="primary"
        loading={saving}
        onConfirm={handleSave}
        onCancel={() => setConfirmDialogOpen(false)}
      />

      {/* ========== 삭제 확인 다이얼로그 ========== */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="모델 삭제"
        message={
          deleteTarget?.type === 'single'
            ? `"${deleteTarget.modelName}"을(를) 삭제하시겠습니까?\n연관된 가격 정보도 함께 삭제됩니다.`
            : `선택한 ${selectedModelIds.length}개 모델을 삭제하시겠습니까?\n연관된 모든 가격 정보도 함께 삭제됩니다.\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`
        }
        confirmLabel="삭제"
        confirmColor="error"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteTarget(null);
        }}
      />

      {/* ========== 가격 히스토리 모달 ========== */}
      {historyTargetModel && (
        <PriceHistoryModal
          open={historyModalOpen}
          onClose={() => {
            setHistoryModalOpen(false);
            setHistoryTargetModel(null);
          }}
          modelId={historyTargetModel.id}
          modelName={historyTargetModel.name}
          grades={grades}
        />
      )}

      {/* ========== 삭제 히스토리 모달 ========== */}
      <DeletedHistoryModal
        open={deletedHistoryModalOpen}
        onClose={() => setDeletedHistoryModalOpen(false)}
        deviceType={deviceType}
        manufacturer={manufacturer}
      />

      {/* ========== 모델 등록 모달 ========== */}
      <ModelRegisterModal
        open={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        deviceType={deviceType}
        manufacturer={manufacturer}
        onSuccess={loadData}
      />

      {/* ========== 모델 수정 모달 ========== */}
      <ModelEditModal
        open={editModalOpen}
        onClose={(shouldRefresh?: boolean) => {
          setEditModalOpen(false);
          setEditTargetModel(null);
          // 용량 추가/삭제 후 닫힐 때 데이터 새로고침
          if (shouldRefresh) {
            loadData();
          }
        }}
        groupedModel={editTargetModel}
        deviceType={deviceType}
        manufacturer={manufacturer}
      />
    </Box>
  );
}
