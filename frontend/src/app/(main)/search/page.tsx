/**
 * 단가표 통합 관리 시스템 - 모델 검색 페이지
 */

'use client';

import { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  Search as SearchIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import { ssotModelsApi, myListsApi } from '@/lib/api';

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

export default function SearchPage() {
  const { enqueueSnackbar } = useSnackbar();
  
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [total, setTotal] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  
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
      
      {/* 검색 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            size="medium"
            placeholder="모델명 또는 모델코드로 검색하세요"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
            autoFocus
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
            검색어를 입력하세요
          </Typography>
        </Box>
      )}
    </Box>
  );
}
