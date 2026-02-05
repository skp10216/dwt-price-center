/**
 * 판매가 대시보드 - 필터 바 컴포넌트
 * - 빠른 검색 (Ctrl+K) 버튼
 * - 컴팩트 뷰 토글
 */

'use client';

import {
  Box,
  TextField,
  FormControlLabel,
  Switch,
  Button,
  InputAdornment,
  useMediaQuery,
  useTheme,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  ViewColumn as ViewColumnIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { DashboardFilters } from './types';

interface FilterBarProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  onSearchClick: () => void;
  onColumnMenuClick: (event: React.MouseEvent<HTMLElement>) => void;
  onRefreshClick: () => void;
  hiddenColumnCount: number;
  excelExportButton: React.ReactNode;
}

export function FilterBar({
  filters,
  onFiltersChange,
  onSearchClick,
  onColumnMenuClick,
  onRefreshClick,
  hiddenColumnCount,
  excelExportButton,
}: FilterBarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleChange = (key: keyof DashboardFilters, value: string | boolean) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleReset = () => {
    onFiltersChange({
      search: '',
      appleSeries: '',
      samsungSeries: '',
      showChangedOnly: false,
      compactView: false,
    });
  };

  const hasActiveFilters = filters.search || filters.appleSeries || filters.samsungSeries;

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1.5,
        mb: 2,
        p: 1.5,
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        alignItems: 'center',
      }}
    >
      {/* 빠른 검색 버튼 */}
      <Button
        variant="outlined"
        size="small"
        startIcon={<SearchIcon />}
        onClick={onSearchClick}
        sx={{
          minWidth: isMobile ? 'auto' : 150,
          justifyContent: 'flex-start',
          color: 'text.secondary',
          borderColor: 'divider',
          '&:hover': {
            borderColor: 'primary.main',
          },
        }}
      >
        {isMobile ? '' : '검색'}
        <Chip
          label={isMobile ? '⌘K' : 'Ctrl+K'}
          size="small"
          sx={{
            ml: 'auto',
            height: 20,
            fontSize: '0.65rem',
            bgcolor: 'grey.100',
          }}
        />
      </Button>

      {/* 인라인 검색 */}
      <TextField
        size="small"
        placeholder="모델명 검색..."
        value={filters.search}
        onChange={(e) => handleChange('search', e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
        }}
        sx={{ minWidth: 150, flex: isMobile ? 1 : 'none' }}
      />

      {/* 구분선 */}
      <Box sx={{ borderLeft: 1, borderColor: 'divider', height: 32, mx: 0.5 }} />

      {/* 컴팩트 뷰 토글 */}
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={filters.compactView}
            onChange={(e) => handleChange('compactView', e.target.checked)}
          />
        }
        label={
          <Box component="span" sx={{ fontSize: '0.875rem' }}>
            {isMobile ? '작게' : '컴팩트 뷰'}
          </Box>
        }
        sx={{ mr: 0 }}
      />

      {/* 필터 초기화 */}
      {hasActiveFilters && (
        <Button
          size="small"
          color="secondary"
          onClick={handleReset}
        >
          초기화
        </Button>
      )}

      {/* Spacer to push buttons to the right */}
      <Box sx={{ flex: 1 }} />

      {/* 새로고침 버튼 */}
      <Tooltip title="새로고침">
        <IconButton onClick={onRefreshClick} size="small">
          <RefreshIcon />
        </IconButton>
      </Tooltip>

      {/* 엑셀 내보내기 버튼 */}
      {excelExportButton}

      {/* 컬럼 표시/숨김 버튼 */}
      <Tooltip title="컬럼 표시/숨김">
        <IconButton
          onClick={onColumnMenuClick}
          size="small"
          sx={{
            bgcolor: hiddenColumnCount > 0 ? 'primary.50' : 'transparent',
            position: 'relative',
          }}
        >
          <ViewColumnIcon fontSize="small" />
          {hiddenColumnCount > 0 && (
            <Box
              component="span"
              sx={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'white',
                fontSize: '0.65rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {hiddenColumnCount}
            </Box>
          )}
        </IconButton>
      </Tooltip>
    </Box>
  );
}
