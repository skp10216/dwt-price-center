/**
 * 단가표 통합 관리 시스템 - 본사 판매 단가 리스트 페이지
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
  Chip,
  IconButton,
  Tooltip,
  Typography,
  Stack,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import { hqPricesApi, gradesApi, myListsApi } from '@/lib/api';
import { format } from 'date-fns';

// 타입 정의
interface Grade {
  id: string;
  name: string;
  is_default: boolean;
}

interface PriceItem {
  model_id: string;
  model_code: string;
  device_type: string;
  manufacturer: string;
  series: string;
  model_name: string;
  storage_display: string;
  full_name: string;
  connectivity: string;
  grade_id: string;
  grade_name: string;
  price: number;
  applied_at: string;
  is_favorite: boolean;
}

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

export default function PricesPage() {
  const { enqueueSnackbar } = useSnackbar();
  
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PriceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  
  const [search, setSearch] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  
  // 등급 목록 조회
  useEffect(() => {
    const fetchGrades = async () => {
      try {
        const response = await gradesApi.list({ is_active: true });
        const gradeList = response.data.data.grades as Grade[];
        setGrades(gradeList);
        
        // 기본 등급 선택
        const defaultGrade = gradeList.find((g) => g.is_default) || gradeList[0];
        if (defaultGrade) {
          setSelectedGradeId(defaultGrade.id);
        }
      } catch (error) {
        enqueueSnackbar('등급 목록을 불러오는데 실패했습니다', { variant: 'error' });
      }
    };
    
    fetchGrades();
  }, [enqueueSnackbar]);
  
  // 가격 목록 조회
  useEffect(() => {
    const fetchPrices = async () => {
      if (!selectedGradeId) return;
      
      setLoading(true);
      try {
        const response = await hqPricesApi.list({
          page: page + 1,
          page_size: pageSize,
          grade_id: selectedGradeId,
          device_type: deviceType || undefined,
          manufacturer: manufacturer || undefined,
          search: search || undefined,
          favorites_only: favoritesOnly,
        });
        
        const data = response.data.data as any;
        setItems(data.items || []);
        setTotal(data.total || 0);
        setAppliedAt(data.applied_at);
      } catch (error) {
        enqueueSnackbar('가격 목록을 불러오는데 실패했습니다', { variant: 'error' });
      } finally {
        setLoading(false);
      }
    };
    
    fetchPrices();
  }, [selectedGradeId, page, pageSize, search, deviceType, manufacturer, favoritesOnly, enqueueSnackbar]);
  
  // 즐겨찾기 토글
  const handleToggleFavorite = async (modelId: string) => {
    try {
      await myListsApi.toggleFavorite(modelId);
      setItems((prev) =>
        prev.map((item) =>
          item.model_id === modelId
            ? { ...item, is_favorite: !item.is_favorite }
            : item
        )
      );
      enqueueSnackbar('즐겨찾기가 업데이트되었습니다', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('즐겨찾기 업데이트에 실패했습니다', { variant: 'error' });
    }
  };
  
  // DataGrid 컬럼 정의
  const columns: GridColDef[] = [
    {
      field: 'is_favorite',
      headerName: '',
      width: 50,
      sortable: false,
      renderCell: (params: GridRenderCellParams<PriceItem>) => (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleFavorite(params.row.model_id);
          }}
        >
          {params.row.is_favorite ? (
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
    { field: 'full_name', headerName: '모델명', width: 250, flex: 1 },
    { field: 'model_code', headerName: '모델코드', width: 120 },
    {
      field: 'price',
      headerName: '가격',
      width: 120,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => (
        <Typography fontWeight={600}>
          {params.value?.toLocaleString()}원
        </Typography>
      ),
    },
  ];
  
  return (
    <Box>
      <PageHeader
        title="본사 판매 단가"
        description={appliedAt ? `최종 업데이트: ${format(new Date(appliedAt), 'yyyy-MM-dd HH:mm')}` : undefined}
        chips={appliedAt ? [<Chip key="status" label="적용됨" color="success" size="small" />] : undefined}
      />
      
      {/* 필터 영역 */}
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
              <InputLabel>등급</InputLabel>
              <Select
                value={selectedGradeId}
                label="등급"
                onChange={(e) => setSelectedGradeId(e.target.value)}
              >
                {grades.map((grade) => (
                  <MenuItem key={grade.id} value={grade.id}>
                    {grade.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>타입</InputLabel>
              <Select
                value={deviceType}
                label="타입"
                onChange={(e) => setDeviceType(e.target.value)}
              >
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="smartphone">스마트폰</MenuItem>
                <MenuItem value="tablet">태블릿</MenuItem>
                <MenuItem value="wearable">웨어러블</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>제조사</InputLabel>
              <Select
                value={manufacturer}
                label="제조사"
                onChange={(e) => setManufacturer(e.target.value)}
              >
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="apple">애플</MenuItem>
                <MenuItem value="samsung">삼성</MenuItem>
                <MenuItem value="other">기타</MenuItem>
              </Select>
            </FormControl>
            
            <Tooltip title="즐겨찾기만 보기">
              <IconButton
                onClick={() => setFavoritesOnly(!favoritesOnly)}
                color={favoritesOnly ? 'warning' : 'default'}
              >
                {favoritesOnly ? <StarIcon /> : <StarBorderIcon />}
              </IconButton>
            </Tooltip>
          </Stack>
        </CardContent>
      </Card>
      
      {/* 데이터 테이블 */}
      <Card>
        <DataGrid
          rows={items}
          columns={columns}
          getRowId={(row) => row.model_id}
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
          sx={{
            '& .MuiDataGrid-cell': {
              py: 1,
            },
          }}
        />
      </Card>
    </Box>
  );
}
