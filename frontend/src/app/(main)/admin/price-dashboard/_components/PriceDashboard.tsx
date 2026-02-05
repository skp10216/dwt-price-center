/**
 * 판매가 대시보드 - 메인 컴포넌트
 * PC: 아이폰/삼성 좌우 분할 레이아웃
 * 모바일: 탭 전환 방식
 */

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
  CircularProgress,
  Alert,
  Chip,
  Stack,
  Menu,
  MenuItem,
  Checkbox,
  ListItemText,
  Divider,
  Button,
  alpha,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ViewColumn as ViewColumnIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { ssotModelsApi, gradesApi, deductionsApi } from '@/lib/api';
import { SSOTModel, Grade } from '@/app/(main)/admin/models/_components/types';
import { PriceTable } from './PriceTable';
import { FilterBar } from './FilterBar';
import { SearchModal } from './SearchModal';
import { ExcelExport } from './ExcelExport';
import { ResizableSplitPane } from './ResizableSplitPane';
import { DashboardFilters, BrandTab, ManufacturerTableData, PriceTableRow, SearchResult, DeductionItem, ColumnConfig } from './types';

// 스마트폰 모델만 필터링
const DEVICE_TYPE = 'smartphone';

// ============================================================================
// 시리즈 필터 그룹 정의 (ModelPriceEditor와 동일)
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

/** Apple 시리즈 그룹 (세대별 - 최신순) */
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

// 시리즈 필터 최대 표시 개수
const MAX_VISIBLE_SERIES = 6;

// 컬럼 가시성 localStorage 키
const COLUMN_VISIBILITY_KEY = 'price-dashboard-columns';

export function PriceDashboard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg')); // 1280px 미만
  const { enqueueSnackbar } = useSnackbar();

  // Refs for scrolling
  const appleTableRef = useRef<HTMLDivElement>(null);
  const samsungTableRef = useRef<HTMLDivElement>(null);

  // 상태
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<SSOTModel[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [deductions, setDeductions] = useState<DeductionItem[]>([]);
  const [activeTab, setActiveTab] = useState<BrandTab>('apple');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>({
    search: '',
    appleSeries: '',
    samsungSeries: '',
    showChangedOnly: false,
    compactView: false,
  });

  // 컬럼 가시성 상태
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [columnMenuAnchor, setColumnMenuAnchor] = useState<null | HTMLElement>(null);

  // 시리즈 더보기 메뉴 상태
  const [seriesMenuAnchor, setSeriesMenuAnchor] = useState<null | HTMLElement>(null);
  const [seriesMenuType, setSeriesMenuType] = useState<'apple' | 'samsung'>('apple');

  // 시리즈 더보기 버튼 ref
  const appleSeriesMoreButtonRef = useRef<HTMLDivElement>(null);
  const samsungSeriesMoreButtonRef = useRef<HTMLDivElement>(null);

  // 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelsRes, gradesRes, deductionsRes] = await Promise.all([
        ssotModelsApi.list({ device_type: DEVICE_TYPE, page_size: 1000 }),
        gradesApi.list({ page_size: 100 }),
        deductionsApi.list({ page_size: 100 }),
      ]);

      setModels(modelsRes.data.data.models as SSOTModel[]);
      setGrades((gradesRes.data.data.grades as Grade[]).sort((a, b) => a.sort_order - b.sort_order));
      setDeductions(deductionsRes.data.data.items as DeductionItem[]);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('데이터를 불러오는데 실패했습니다.');
      enqueueSnackbar('데이터 로드 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 컬럼 가시성 초기화 (grades 로드 후)
  useEffect(() => {
    if (grades.length === 0) return;

    // localStorage에서 저장된 설정 복원
    const saved = localStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (saved) {
      try {
        setColumnVisibility(JSON.parse(saved));
        return;
      } catch {
        // 파싱 실패 시 기본값 사용
      }
    }

    // 기본값: 모든 컬럼 표시
    const defaultVisibility: Record<string, boolean> = {};
    grades.forEach(g => {
      defaultVisibility[g.id] = true;
    });
    defaultVisibility['note'] = true;
    setColumnVisibility(defaultVisibility);
  }, [grades]);

  // 컬럼 가시성 변경 핸들러
  const handleColumnVisibilityChange = useCallback((columnId: string, visible: boolean) => {
    setColumnVisibility(prev => {
      const next = { ...prev, [columnId]: visible };
      localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // 모든 컬럼 표시
  const handleShowAllColumns = useCallback(() => {
    const allVisible: Record<string, boolean> = {};
    grades.forEach(g => {
      allVisible[g.id] = true;
    });
    allVisible['note'] = true;
    setColumnVisibility(allVisible);
    localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(allVisible));
  }, [grades]);

  // 컬럼 설정 목록
  const columnConfigs = useMemo((): ColumnConfig[] => {
    const configs: ColumnConfig[] = [];
    grades.forEach(g => {
      configs.push({
        id: g.id,
        label: g.name,
        visible: columnVisibility[g.id] !== false,
        required: false,
      });
    });
    configs.push({
      id: 'note',
      label: '비고',
      visible: columnVisibility['note'] !== false,
      required: false,
    });
    return configs;
  }, [grades, columnVisibility]);

  // 표시할 등급 목록 (숨긴 컬럼 제외)
  const visibleGrades = useMemo(() => {
    return grades.filter(g => columnVisibility[g.id] !== false);
  }, [grades, columnVisibility]);

  const showNoteColumn = columnVisibility['note'] !== false;
  const hiddenColumnCount = columnConfigs.filter(c => !c.visible).length;

  // 키보드 단축키 (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 차감 내용을 모델 키로 매핑
  const deductionsByModelKey = useMemo(() => {
    const map = new Map<string, string[]>();
    deductions.forEach(d => {
      if (d.applies_to && d.levels) {
        d.applies_to.forEach(modelKey => {
          const existing = map.get(modelKey) || [];
          // 차감 레벨 정보를 문자열로 변환
          const levelInfo = d.levels.map(l =>
            `${l.level_name}: ${d.is_percentage ? `${l.value}%` : l.value.toLocaleString()}`
          ).join(', ');
          existing.push(`${d.name} (${levelInfo})`);
          map.set(modelKey, existing);
        });
      }
    });
    return map;
  }, [deductions]);

  // 제조사별로 모델 분류 및 테이블 데이터 생성
  const { appleData, samsungData } = useMemo(() => {
    const appleModels = models.filter(m => m.manufacturer.toLowerCase() === 'apple');
    const samsungModels = models.filter(m => m.manufacturer.toLowerCase() === 'samsung');

    const transformToRows = (modelList: SSOTModel[]): PriceTableRow[] => {
      // 시리즈 > 모델명 > 용량 순으로 정렬
      const sorted = [...modelList].sort((a, b) => {
        // 시리즈 비교
        const seriesCompare = a.series.localeCompare(b.series, 'ko');
        if (seriesCompare !== 0) return seriesCompare;
        // 모델명 비교
        const nameCompare = a.model_name.localeCompare(b.model_name, 'ko');
        if (nameCompare !== 0) return nameCompare;
        // 용량 비교
        return a.storage_gb - b.storage_gb;
      });

      return sorted.map(model => {
        const prices: Record<string, number> = {};
        model.grade_prices.forEach(gp => {
          prices[gp.grade_id] = gp.price;
        });

        // 차감 내용 가져오기
        const deductionNotes = deductionsByModelKey.get(model.model_key);
        const note = deductionNotes ? deductionNotes.join('\n') : null;

        return {
          id: model.id,
          modelKey: model.model_key,
          modelName: model.model_name,
          series: model.series,
          storage: model.storage_display,
          storageGb: model.storage_gb,
          connectivity: model.connectivity,
          note,
          prices,
        };
      });
    };

    const allAppleRows = transformToRows(appleModels);
    const allSamsungRows = transformToRows(samsungModels);

    // 필터 적용
    const applyFilters = (rows: PriceTableRow[], seriesFilter: string): PriceTableRow[] => {
      return rows.filter(row => {
        // 검색어 필터
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          const matchesSearch =
            row.modelName.toLowerCase().includes(searchLower) ||
            row.series.toLowerCase().includes(searchLower) ||
            row.storage.toLowerCase().includes(searchLower);
          if (!matchesSearch) return false;
        }
        // 시리즈 필터 (prefix 매칭)
        if (seriesFilter) {
          const seriesLower = row.series.toLowerCase();
          const filterLower = seriesFilter.toLowerCase();
          // prefix로 시작하는 경우 매칭
          if (!seriesLower.startsWith(filterLower)) {
            return false;
          }
        }
        return true;
      });
    };

    const appleRows = applyFilters(allAppleRows, filters.appleSeries);
    const samsungRows = applyFilters(allSamsungRows, filters.samsungSeries);

    const appleData: ManufacturerTableData = {
      manufacturer: 'apple',
      label: '아이폰',
      grades: grades,
      rows: appleRows,
      allRows: allAppleRows,
    };

    const samsungData: ManufacturerTableData = {
      manufacturer: 'samsung',
      label: '삼성',
      grades: grades,
      rows: samsungRows,
      allRows: allSamsungRows,
      extraColumns: ['수출', 'LCD'],
    };

    return { appleData, samsungData };
  }, [models, grades, filters.search, filters.appleSeries, filters.samsungSeries, deductionsByModelKey]);

  // 검색 결과 선택 시 - 해당 행으로 스크롤 및 하이라이트
  const handleSearchSelect = useCallback((result: SearchResult) => {
    // 탭 전환 (모바일)
    setActiveTab(result.manufacturer);

    // 시리즈 필터 초기화 (선택한 모델이 보이도록)
    if (result.manufacturer === 'apple') {
      setFilters(prev => ({ ...prev, appleSeries: '' }));
    } else {
      setFilters(prev => ({ ...prev, samsungSeries: '' }));
    }

    // 모달 닫기
    setSearchOpen(false);

    // 하이라이트 설정
    setHighlightedId(result.id);

    // 스크롤 (약간의 딜레이 후)
    setTimeout(() => {
      const targetRef = result.manufacturer === 'apple' ? appleTableRef : samsungTableRef;
      const row = targetRef.current?.querySelector(`[data-row-id="${result.id}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    // 3초 후 하이라이트 해제
    setTimeout(() => {
      setHighlightedId(null);
    }, 3000);
  }, []);

  // 시리즈 필터 변경
  const handleAppleSeriesChange = useCallback((series: string) => {
    setFilters(prev => ({ ...prev, appleSeries: series }));
  }, []);

  const handleSamsungSeriesChange = useCallback((series: string) => {
    setFilters(prev => ({ ...prev, samsungSeries: series }));
  }, []);

  // 시리즈 더보기 메뉴 열기 (Hook은 조기 return 이전에 호출되어야 함)
  const handleOpenSeriesMenu = useCallback((type: 'apple' | 'samsung') => {
    const buttonRef = type === 'apple' ? appleSeriesMoreButtonRef : samsungSeriesMoreButtonRef;
    if (buttonRef.current) {
      setSeriesMenuAnchor(buttonRef.current);
      setSeriesMenuType(type);
    }
  }, []);

  // 시리즈 더보기 메뉴 닫기
  const handleCloseSeriesMenu = useCallback(() => {
    setSeriesMenuAnchor(null);
  }, []);

  // 더보기 메뉴에서 시리즈 선택
  const handleSelectSeriesFromMenu = useCallback((series: string) => {
    if (seriesMenuType === 'apple') {
      handleAppleSeriesChange(series);
    } else {
      handleSamsungSeriesChange(series);
    }
    handleCloseSeriesMenu();
  }, [seriesMenuType, handleAppleSeriesChange, handleSamsungSeriesChange, handleCloseSeriesMenu]);

  // 각 제조사의 시리즈 더보기 버튼 ref 가져오기
  const getSeriesMoreButtonRef = useCallback((type: 'apple' | 'samsung') => {
    return type === 'apple' ? appleSeriesMoreButtonRef : samsungSeriesMoreButtonRef;
  }, []);

  // ============================================================================
  // 조기 return (로딩/에러 상태) - 모든 Hook 호출 이후에 위치해야 함
  // ============================================================================

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
        <IconButton size="small" onClick={loadData} sx={{ ml: 1 }}>
          <RefreshIcon />
        </IconButton>
      </Alert>
    );
  }

  // 시리즈 빠른 필터 칩 컴포넌트 (최대 MAX_VISIBLE_SERIES개 표시)
  const SeriesFilterChips = ({
    seriesGroups,
    selectedSeries,
    onSelect,
    manufacturerType
  }: {
    seriesGroups: SeriesGroup[];
    selectedSeries: string;
    onSelect: (series: string) => void;
    manufacturerType: 'apple' | 'samsung';
  }) => {
    const visibleGroups = seriesGroups.slice(0, MAX_VISIBLE_SERIES);
    const hiddenGroups = seriesGroups.slice(MAX_VISIBLE_SERIES);
    const hasHidden = hiddenGroups.length > 0;

    // 선택된 시리즈가 숨겨진 그룹에 있는지 확인
    const selectedInHidden = hiddenGroups.some(
      g => selectedSeries.toLowerCase() === g.matchPrefix.toLowerCase()
    );

    return (
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'nowrap', alignItems: 'center' }}>
        <Chip
          label="전체"
          size="small"
          variant={selectedSeries === '' ? 'filled' : 'outlined'}
          color={selectedSeries === '' ? 'primary' : 'default'}
          onClick={() => onSelect('')}
          sx={{ height: 26, fontSize: '0.75rem', fontWeight: 500, flexShrink: 0 }}
        />
        {visibleGroups.map(group => {
          const isSelected = selectedSeries.toLowerCase() === group.matchPrefix.toLowerCase();
          return (
            <Chip
              key={group.matchPrefix}
              label={group.label}
              size="small"
              variant={isSelected ? 'filled' : 'outlined'}
              onClick={() => onSelect(isSelected ? '' : group.matchPrefix)}
              sx={{
                height: 26,
                fontSize: '0.75rem',
                fontWeight: 600,
                flexShrink: 0,
                borderColor: group.color,
                color: isSelected ? '#fff' : group.color,
                bgcolor: isSelected ? group.color : 'transparent',
                '&:hover': {
                  bgcolor: isSelected ? group.color : `${group.color}15`,
                },
              }}
            />
          );
        })}
        {hasHidden && (
          <Box ref={getSeriesMoreButtonRef(manufacturerType)} sx={{ display: 'inline-flex' }}>
            <Chip
              label={selectedInHidden ? `+${hiddenGroups.length} (선택됨)` : `+${hiddenGroups.length}`}
              size="small"
              variant={selectedInHidden ? 'filled' : 'outlined'}
              color={selectedInHidden ? 'primary' : 'default'}
              onClick={() => handleOpenSeriesMenu(manufacturerType)}
              deleteIcon={<ExpandMoreIcon sx={{ fontSize: '1rem !important' }} />}
              onDelete={() => handleOpenSeriesMenu(manufacturerType)}
              sx={{
                height: 26,
                fontSize: '0.75rem',
                fontWeight: 500,
                flexShrink: 0,
              }}
            />
          </Box>
        )}
      </Stack>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* 컬럼 가시성 메뉴 */}
      <Menu
        anchorEl={columnMenuAnchor}
        open={Boolean(columnMenuAnchor)}
        onClose={() => setColumnMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: { sx: { minWidth: 200, maxHeight: 400 } },
        }}
      >
        <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" fontWeight={600}>
            컬럼 표시
          </Typography>
          {hiddenColumnCount > 0 && (
            <Button size="small" onClick={handleShowAllColumns}>
              전체 표시
            </Button>
          )}
        </Box>
        <Divider />
        {columnConfigs.map((column) => (
          <MenuItem
            key={column.id}
            onClick={() => handleColumnVisibilityChange(column.id, !column.visible)}
            dense
          >
            <Checkbox
              checked={column.visible}
              size="small"
              sx={{ p: 0.5, mr: 1 }}
            />
            <ListItemText
              primary={column.label}
              primaryTypographyProps={{ variant: 'body2' }}
            />
          </MenuItem>
        ))}
      </Menu>

      {/* 시리즈 더보기 메뉴 */}
      <Menu
        anchorEl={seriesMenuAnchor}
        open={Boolean(seriesMenuAnchor)}
        onClose={handleCloseSeriesMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: { sx: { minWidth: 180 } },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
            추가 시리즈
          </Typography>
        </Box>
        <Divider />
        {(seriesMenuType === 'apple' ? APPLE_SERIES_GROUPS : SAMSUNG_SERIES_GROUPS)
          .slice(MAX_VISIBLE_SERIES)
          .map((group) => {
            const currentSeries = seriesMenuType === 'apple' ? filters.appleSeries : filters.samsungSeries;
            const isSelected = currentSeries.toLowerCase() === group.matchPrefix.toLowerCase();
            return (
              <MenuItem
                key={group.matchPrefix}
                onClick={() => handleSelectSeriesFromMenu(isSelected ? '' : group.matchPrefix)}
                selected={isSelected}
                dense
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: group.color,
                    mr: 1.5,
                    flexShrink: 0,
                  }}
                />
                <ListItemText
                  primary={group.label}
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </MenuItem>
            );
          })}
      </Menu>

      {/* 필터 바 */}
      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        onSearchClick={() => setSearchOpen(true)}
        onColumnMenuClick={(e) => setColumnMenuAnchor(e.currentTarget)}
        onRefreshClick={loadData}
        hiddenColumnCount={hiddenColumnCount}
        excelExportButton={<ExcelExport appleData={appleData} samsungData={samsungData} />}
      />

      {/* 테이블 영역 */}
      {isMobile ? (
        // 모바일: 탭 전환 방식
        <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 48 }}
          >
            <Tab
              label={`아이폰 (${appleData.rows.length})`}
              value="apple"
              sx={{ minHeight: 48 }}
            />
            <Tab
              label={`삼성 (${samsungData.rows.length})`}
              value="samsung"
              sx={{ minHeight: 48 }}
            />
          </Tabs>
          <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
            <SeriesFilterChips
              seriesGroups={activeTab === 'apple' ? APPLE_SERIES_GROUPS : SAMSUNG_SERIES_GROUPS}
              selectedSeries={activeTab === 'apple' ? filters.appleSeries : filters.samsungSeries}
              onSelect={activeTab === 'apple' ? handleAppleSeriesChange : handleSamsungSeriesChange}
              manufacturerType={activeTab}
            />
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto' }} ref={activeTab === 'apple' ? appleTableRef : samsungTableRef}>
            <PriceTable
              data={activeTab === 'apple' ? appleData : samsungData}
              compact={filters.compactView}
              highlightedId={highlightedId}
              visibleGradeIds={visibleGrades.map(g => g.id)}
              showNoteColumn={showNoteColumn}
            />
          </Box>
        </Paper>
      ) : (
        // PC: 리사이즈 가능한 좌우 분할 레이아웃
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <ResizableSplitPane
            storageKey="price-dashboard-split"
            defaultLeftWidth={50}
            minLeftWidth={30}
            maxLeftWidth={70}
            left={
              <Paper sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', mr: 0.5 }}>
                <Box sx={{
                  p: 1.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                  bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600} color="grey.800">
                      아이폰
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ({appleData.rows.length}개 모델)
                    </Typography>
                  </Box>
                  <SeriesFilterChips
                    seriesGroups={APPLE_SERIES_GROUPS}
                    selectedSeries={filters.appleSeries}
                    onSelect={handleAppleSeriesChange}
                    manufacturerType="apple"
                  />
                </Box>
                <Box sx={{ flex: 1, overflow: 'auto' }} ref={appleTableRef}>
                  <PriceTable
                    data={appleData}
                    compact={filters.compactView}
                    highlightedId={highlightedId}
                    visibleGradeIds={visibleGrades.map(g => g.id)}
                    showNoteColumn={showNoteColumn}
                  />
                </Box>
              </Paper>
            }
            right={
              <Paper sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', ml: 0.5 }}>
                <Box sx={{
                  p: 1.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                  bgcolor: (theme) => theme.palette.mode === 'dark' ? alpha(theme.palette.primary.main, 0.15) : 'primary.50',
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600} color="primary.main">
                      삼성
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ({samsungData.rows.length}개 모델)
                    </Typography>
                  </Box>
                  <SeriesFilterChips
                    seriesGroups={SAMSUNG_SERIES_GROUPS}
                    selectedSeries={filters.samsungSeries}
                    onSelect={handleSamsungSeriesChange}
                    manufacturerType="samsung"
                  />
                </Box>
                <Box sx={{ flex: 1, overflow: 'auto' }} ref={samsungTableRef}>
                  <PriceTable
                    data={samsungData}
                    compact={filters.compactView}
                    highlightedId={highlightedId}
                    visibleGradeIds={visibleGrades.map(g => g.id)}
                    showNoteColumn={showNoteColumn}
                  />
                </Box>
              </Paper>
            }
          />
        </Box>
      )}

      {/* 검색 모달 */}
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        appleRows={appleData.allRows}
        samsungRows={samsungData.allRows}
        onSelect={handleSearchSelect}
      />
    </Box>
  );
}
