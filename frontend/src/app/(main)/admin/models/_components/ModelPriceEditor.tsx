/**
 * 모델 가격 편집기 (메인 컴포넌트)
 * 
 * FAQ 관리 페이지 스타일 UI:
 * - 그라데이션 헤더 (아이콘 + 제목 + 버튼)
 * - 통계 카드 3개
 * - 필터 + 모델 카드 목록
 * 
 * 성능 최적화:
 * - 변경 추적은 Map으로 O(1) 접근
 * - 개별 카드는 memo로 최적화
 * - Lazy Mount: 아코디언이 열릴 때만 테이블 렌더링
 * - API 호출은 배치로 처리
 * - 입력은 blur/enter 시점에만 상태 업데이트
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
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { ssotModelsApi, gradesApi, GradePriceItem } from '@/lib/api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ChangeTracker } from './ChangeTracker';
import { ModelPriceCard } from './ModelPriceCard';
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

// 그라데이션 색상
const gradientColors: Record<DeviceType, string> = {
  smartphone: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  tablet: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  wearable: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
};

export function ModelPriceEditor({ deviceType, manufacturer }: ModelPriceEditorProps) {
  const router = useRouter();
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
      // 검색 필터
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          group.model_name.toLowerCase().includes(searchLower) ||
          group.model_key.toLowerCase().includes(searchLower) ||
          group.series.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      // 시리즈 필터
      if (filters.series && group.series !== filters.series) {
        return false;
      }
      
      // 가격 상태 필터
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
        
        const price = change ? change.newPrice : (gp?.price || 0);
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
      setGrades((gradesRes.data.data.grades as Grade[]).sort((a, b) => a.sort_order - b.sort_order));
      setChanges(new Map());
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
  }, [filters]);
  
  // 가격 변경 핸들러
  const handlePriceChange = useCallback(
    (modelId: string, gradeId: string, gradeName: string, originalPrice: number, newPrice: number) => {
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
  
  // 로딩 스켈레톤
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
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
          borderRadius: 2,
          overflow: 'hidden',
          background: gradientColors[deviceType],
        }}
      >
        <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar
              sx={{
                width: 48,
                height: 48,
                bgcolor: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(10px)',
              }}
            >
              {deviceIcons[deviceType]}
            </Avatar>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h5" fontWeight={700} color="white">
                  {manufacturerLabels[manufacturer]} {deviceTypeLabels[deviceType]}
                </Typography>
                <Avatar
                  sx={{
                    width: 24,
                    height: 24,
                    bgcolor: 'rgba(255,255,255,0.3)',
                  }}
                >
                  {manufacturerIcons[manufacturer]}
                </Avatar>
              </Stack>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                등급별 가격을 설정하고 관리합니다
              </Typography>
            </Box>
          </Stack>
          
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={handleBack}
              sx={{
                color: 'white',
                borderColor: 'rgba(255,255,255,0.5)',
                '&:hover': {
                  borderColor: 'white',
                  bgcolor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              목록으로
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadData}
              sx={{
                color: 'white',
                borderColor: 'rgba(255,255,255,0.5)',
                '&:hover': {
                  borderColor: 'white',
                  bgcolor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              새로고침
            </Button>
            {changes.size > 0 && (
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveClick}
                sx={{
                  bgcolor: 'white',
                  color: 'primary.main',
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.9)',
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
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* 전체 모델 */}
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                전체 모델
              </Typography>
              <Typography variant="h3" fontWeight={700} color="primary.main">
                {stats.totalModels}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* 가격 설정됨 */}
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                가격 설정됨
              </Typography>
              <Typography variant="h3" fontWeight={700} color="success.main">
                {stats.configuredCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* 가격 미설정 */}
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                가격 미설정
              </Typography>
              <Typography variant="h3" fontWeight={700} color="warning.main">
                {stats.unconfiguredCount}
              </Typography>
            </CardContent>
          </Card>
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
      
      {/* ========== 필터 카드 ========== */}
      <Card sx={{ mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <CardContent>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            {/* 검색 */}
            <TextField
              size="small"
              placeholder="모델명 검색"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
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
                onChange={(e) => setFilters((prev) => ({ 
                  ...prev, 
                  priceStatus: e.target.value as FilterOptions['priceStatus'] 
                }))}
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
                onChange={(e) => setFilters((prev) => ({ ...prev, series: e.target.value }))}
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
            
            {/* 표시 정보 */}
            <Typography variant="body2" color="text.secondary">
              표시중: <strong>{filteredModels.length}</strong>개 모델 그룹
            </Typography>
          </Stack>
        </CardContent>
      </Card>
      
      {/* ========== 모델 리스트 ========== */}
      {filteredModels.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
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
    </Box>
  );
}
