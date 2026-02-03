/**
 * 단가표 통합 관리 시스템 - 모델 검색 페이지
 * 
 * 기능:
 * - 고급 시리즈 필터 (제조사별 대분류 Chip)
 * - 모델 검색 및 즐겨찾기
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  InputAdornment,
  Typography,
  Stack,
  Chip,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
  Divider,
  alpha,
} from '@mui/material';
import {
  Search as SearchIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Apple as AppleIcon,
  FilterList as FilterListIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import { ssotModelsApi, myListsApi } from '@/lib/api';

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
  storage_display: string;
  full_name: string;
  connectivity: string;
  is_active: boolean;
}

type ManufacturerType = 'apple' | 'samsung' | null;

interface SeriesGroup {
  label: string;       // 표시 이름
  searchKey: string;   // 검색에 사용할 키워드
  color?: string;      // Chip 색상
}

// ============================================================================
// 상수 정의 - 시리즈 필터 데이터
// ============================================================================

/** Samsung 시리즈 그룹 (대분류) */
const SAMSUNG_SERIES: SeriesGroup[] = [
  { label: 'Galaxy S', searchKey: 'Galaxy S', color: '#1428A0' },
  { label: 'Galaxy Note', searchKey: 'Galaxy Note', color: '#FF6F00' },
  { label: 'Galaxy Z Fold', searchKey: 'Galaxy Z Fold', color: '#6A1B9A' },
  { label: 'Galaxy Z Flip', searchKey: 'Galaxy Z Flip', color: '#00838F' },
];

/** Apple 시리즈 그룹 (세대별) */
const APPLE_SERIES: SeriesGroup[] = [
  { label: 'iPhone 16', searchKey: 'iPhone 16', color: '#5E5CE6' },
  { label: 'iPhone 15', searchKey: 'iPhone 15', color: '#BF5AF2' },
  { label: 'iPhone 14', searchKey: 'iPhone 14', color: '#FF375F' },
  { label: 'iPhone 13', searchKey: 'iPhone 13', color: '#FF9F0A' },
  { label: 'iPhone 12', searchKey: 'iPhone 12', color: '#30D158' },
  { label: 'iPhone 11', searchKey: 'iPhone 11', color: '#64D2FF' },
  { label: 'iPhone X', searchKey: 'iPhone X', color: '#AC8E68' },
  { label: 'iPhone SE', searchKey: 'iPhone SE', color: '#8E8E93' },
];

const deviceTypeLabels: Record<string, string> = {
  smartphone: '스마트폰',
  tablet: '태블릿',
  wearable: '웨어러블',
};

const manufacturerLabels: Record<string, string> = {
  apple: '애플',
  samsung: '삼성',
  other: '기타',
};

// ============================================================================
// 메인 컴포넌트
// ============================================================================

export default function SearchPage() {
  const { enqueueSnackbar } = useSnackbar();
  
  // 검색 상태
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [total, setTotal] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  
  // 고급 필터 상태
  const [filterExpanded, setFilterExpanded] = useState(true);
  const [selectedManufacturer, setSelectedManufacturer] = useState<ManufacturerType>(null);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  
  // 선택된 제조사에 따른 시리즈 목록
  const seriesList = useMemo(() => {
    if (selectedManufacturer === 'samsung') return SAMSUNG_SERIES;
    if (selectedManufacturer === 'apple') return APPLE_SERIES;
    return [];
  }, [selectedManufacturer]);
  
  // 즐겨찾기 목록 조회
  useEffect(() => {
    const fetchFavorites = async () => {
      try {
        const response = await myListsApi.getFavorites();
        const favList = response.data.data.favorites as any[];
        setFavorites(new Set(favList.map((f) => f.model_id)));
      } catch (error) {
        // 조용히 실패
      }
    };
    fetchFavorites();
  }, []);
  
  // 모델 검색
  useEffect(() => {
    const fetchModels = async () => {
      if (!search.trim()) {
        setModels([]);
        setTotal(0);
        return;
      }
      
      setLoading(true);
      try {
        const response = await ssotModelsApi.list({
          page: page + 1,
          page_size: pageSize,
          search,
          is_active: true,
        });
        const data = response.data.data;
        setModels(data.models as Model[]);
        setTotal(data.total);
      } catch (error) {
        enqueueSnackbar('검색에 실패했습니다', { variant: 'error' });
      } finally {
        setLoading(false);
      }
    };
    
    const timer = setTimeout(fetchModels, 300);
    return () => clearTimeout(timer);
  }, [search, page, pageSize, enqueueSnackbar]);
  
  // 제조사 변경 핸들러
  const handleManufacturerChange = (
    _event: React.MouseEvent<HTMLElement>,
    newManufacturer: ManufacturerType,
  ) => {
    setSelectedManufacturer(newManufacturer);
    setSelectedSeries(null);
    // 제조사 변경 시 검색어 초기화하지 않음 (사용자 경험 유지)
  };
  
  // 시리즈 Chip 클릭 핸들러
  const handleSeriesClick = (series: SeriesGroup) => {
    if (selectedSeries === series.searchKey) {
      // 같은 시리즈 다시 클릭 시 선택 해제
      setSelectedSeries(null);
      setSearch('');
    } else {
      setSelectedSeries(series.searchKey);
      setSearch(series.searchKey);
      setPage(0); // 검색 시 첫 페이지로
    }
  };
  
  // 필터 초기화
  const handleClearFilter = () => {
    setSelectedManufacturer(null);
    setSelectedSeries(null);
    setSearch('');
  };
  
  // 즐겨찾기 토글
  const handleToggleFavorite = async (modelId: string) => {
    try {
      await myListsApi.toggleFavorite(modelId);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (next.has(modelId)) {
          next.delete(modelId);
        } else {
          next.add(modelId);
        }
        return next;
      });
      enqueueSnackbar('즐겨찾기가 업데이트되었습니다', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('즐겨찾기 업데이트에 실패했습니다', { variant: 'error' });
    }
  };
  
  const columns: GridColDef[] = [
    {
      field: 'favorite',
      headerName: '',
      width: 50,
      sortable: false,
      renderCell: (params: GridRenderCellParams<Model>) => (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleFavorite(params.row.id);
          }}
        >
          {favorites.has(params.row.id) ? (
            <StarIcon sx={{ color: 'warning.main' }} />
          ) : (
            <StarBorderIcon />
          )}
        </IconButton>
      ),
    },
    {
      field: 'device_type',
      headerName: '타입',
      width: 100,
      renderCell: (params) => (
        <Chip
          label={deviceTypeLabels[params.value] || params.value}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'manufacturer',
      headerName: '제조사',
      width: 80,
      renderCell: (params) => manufacturerLabels[params.value] || params.value,
    },
    { field: 'series', headerName: '시리즈', width: 130 },
    { field: 'full_name', headerName: '모델명', width: 300, flex: 1 },
    { field: 'model_code', headerName: '모델코드', width: 120 },
  ];
  
  return (
    <Box>
      <PageHeader
        title="모델 검색"
        description="SSOT 모델을 검색하고 즐겨찾기에 추가하세요"
      />
      
      {/* 고급 필터 섹션 */}
      <Card 
        sx={{ 
          mb: 3, 
          background: (theme) => 
            theme.palette.mode === 'dark' 
              ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`
              : `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.08)} 0%, ${theme.palette.background.paper} 100%)`,
          border: (theme) => `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
        }}
      >
        <CardContent sx={{ pb: 2 }}>
          {/* 헤더 */}
          <Stack 
            direction="row" 
            alignItems="center" 
            justifyContent="space-between"
            sx={{ mb: 2 }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <FilterListIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={600}>
                빠른 필터
              </Typography>
              {(selectedManufacturer || selectedSeries) && (
                <Chip 
                  label="초기화" 
                  size="small" 
                  variant="outlined"
                  onClick={handleClearFilter}
                  sx={{ ml: 1 }}
                />
              )}
            </Stack>
            <IconButton 
              size="small" 
              onClick={() => setFilterExpanded(!filterExpanded)}
            >
              {filterExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Stack>
          
          <Collapse in={filterExpanded}>
            {/* 제조사 선택 */}
            <Box sx={{ mb: 2.5 }}>
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ mb: 1, display: 'block', fontWeight: 500 }}
              >
                제조사 선택
              </Typography>
              <ToggleButtonGroup
                value={selectedManufacturer}
                exclusive
                onChange={handleManufacturerChange}
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    px: 3,
                    py: 1,
                    borderRadius: '20px !important',
                    mx: 0.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    '&.Mui-selected': {
                      borderColor: 'primary.main',
                    },
                  },
                }}
              >
                <ToggleButton 
                  value="apple"
                  sx={{
                    '&.Mui-selected': {
                      bgcolor: alpha('#000000', 0.08),
                      color: '#000000',
                      '&:hover': {
                        bgcolor: alpha('#000000', 0.12),
                      },
                    },
                  }}
                >
                  <AppleIcon sx={{ mr: 1, fontSize: 20 }} />
                  Apple
                </ToggleButton>
                <ToggleButton 
                  value="samsung"
                  sx={{
                    '&.Mui-selected': {
                      bgcolor: alpha('#1428A0', 0.08),
                      color: '#1428A0',
                      '&:hover': {
                        bgcolor: alpha('#1428A0', 0.12),
                      },
                    },
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      mr: 1,
                      fontWeight: 700,
                      fontSize: 14,
                      letterSpacing: '-0.5px',
                    }}
                  >
                    S
                  </Box>
                  Samsung
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            
            {/* 시리즈 Chip 목록 */}
            <Collapse in={selectedManufacturer !== null}>
              <Divider sx={{ mb: 2 }} />
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ mb: 1.5, display: 'block', fontWeight: 500 }}
              >
                {selectedManufacturer === 'apple' ? 'iPhone' : 'Galaxy'} 시리즈
              </Typography>
              <Stack 
                direction="row" 
                flexWrap="wrap" 
                gap={1}
              >
                {seriesList.map((series) => (
                  <Chip
                    key={series.searchKey}
                    label={series.label}
                    onClick={() => handleSeriesClick(series)}
                    variant={selectedSeries === series.searchKey ? 'filled' : 'outlined'}
                    sx={{
                      fontWeight: 500,
                      fontSize: '0.875rem',
                      py: 2.5,
                      px: 0.5,
                      borderRadius: '16px',
                      transition: 'all 0.2s ease-in-out',
                      borderColor: series.color,
                      color: selectedSeries === series.searchKey ? '#fff' : series.color,
                      bgcolor: selectedSeries === series.searchKey ? series.color : 'transparent',
                      '&:hover': {
                        bgcolor: selectedSeries === series.searchKey 
                          ? series.color 
                          : alpha(series.color || '#000', 0.08),
                        transform: 'translateY(-2px)',
                        boxShadow: (theme) => `0 4px 12px ${alpha(series.color || theme.palette.primary.main, 0.25)}`,
                      },
                    }}
                  />
                ))}
              </Stack>
            </Collapse>
          </Collapse>
        </CardContent>
      </Card>
      
      {/* 검색 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            size="medium"
            placeholder="모델명 또는 모델코드로 검색하세요"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // 수동 검색 시 시리즈 선택 해제
              if (e.target.value !== selectedSeries) {
                setSelectedSeries(null);
              }
            }}
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
      
      {/* 검색 결과 */}
      {search.trim() ? (
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
            localeText={{
              noRowsLabel: '검색 결과가 없습니다',
            }}
          />
        </Card>
      ) : (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            {selectedManufacturer 
              ? '위 시리즈 버튼을 클릭하거나 검색어를 입력하세요'
              : '제조사를 선택하거나 검색어를 입력하세요'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
