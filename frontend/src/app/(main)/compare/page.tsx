/**
 * 단가표 통합 관리 시스템 - 업체별 단가 비교 페이지
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Typography,
  Stack,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import { compareApi, gradesApi, partnersApi, myListsApi } from '@/lib/api';

interface CompareData {
  grade_id: string;
  grade_name: string;
  partners: { id: string; name: string }[];
  models: {
    model_id: string;
    model_code: string;
    model_name: string;
    storage_display: string;
    hq_price: number | null;
    partner_prices: Record<string, number | null>;
    min_price: number | null;
    max_price: number | null;
    min_partner_id: string | null;
    max_partner_id: string | null;
  }[];
  updated_at: string;
}

export default function ComparePage() {
  const { enqueueSnackbar } = useSnackbar();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompareData | null>(null);
  const [grades, setGrades] = useState<{ id: string; name: string }[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [myLists, setMyLists] = useState<{ id: string; name: string }[]>([]);
  const [listType, setListType] = useState<'admin' | 'my'>('admin');
  const [selectedMyListId, setSelectedMyListId] = useState('');
  
  // 등급 목록 조회
  useEffect(() => {
    const fetchGrades = async () => {
      try {
        const response = await gradesApi.list({ is_active: true });
        const gradeList = response.data.data.grades as any[];
        setGrades(gradeList);
        const defaultGrade = gradeList.find((g) => g.is_default) || gradeList[0];
        if (defaultGrade) setSelectedGradeId(defaultGrade.id);
      } catch (error) {
        enqueueSnackbar('등급 목록을 불러오는데 실패했습니다', { variant: 'error' });
      }
    };
    fetchGrades();
  }, [enqueueSnackbar]);
  
  // 내 리스트 조회
  useEffect(() => {
    const fetchMyLists = async () => {
      try {
        const response = await myListsApi.list();
        setMyLists(response.data.data.lists as any[]);
      } catch (error) {
        // 조용히 실패
      }
    };
    fetchMyLists();
  }, []);
  
  // 비교 데이터 조회
  useEffect(() => {
    const fetchCompareData = async () => {
      if (!selectedGradeId) return;
      
      setLoading(true);
      try {
        const params: any = {
          grade_id: selectedGradeId,
          list_type: listType,
        };
        if (listType === 'my' && selectedMyListId) {
          params.my_list_id = selectedMyListId;
        }
        
        const response = await compareApi.getData(params);
        setData(response.data.data as CompareData);
      } catch (error) {
        enqueueSnackbar('비교 데이터를 불러오는데 실패했습니다', { variant: 'error' });
      } finally {
        setLoading(false);
      }
    };
    fetchCompareData();
  }, [selectedGradeId, listType, selectedMyListId, enqueueSnackbar]);
  
  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return '-';
    return price.toLocaleString();
  };
  
  return (
    <Box>
      <PageHeader
        title="업체별 단가 비교"
        description="동일 모델 기준으로 거래처별 가격을 비교합니다"
      />
      
      {/* 필터 영역 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
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
            
            <ToggleButtonGroup
              value={listType}
              exclusive
              onChange={(_, value) => value && setListType(value)}
              size="small"
            >
              <ToggleButton value="admin">관리자 지정</ToggleButton>
              <ToggleButton value="my">내 리스트</ToggleButton>
            </ToggleButtonGroup>
            
            {listType === 'my' && (
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>내 리스트</InputLabel>
                <Select
                  value={selectedMyListId}
                  label="내 리스트"
                  onChange={(e) => setSelectedMyListId(e.target.value)}
                >
                  {myLists.map((list) => (
                    <MenuItem key={list.id} value={list.id}>
                      {list.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>
        </CardContent>
      </Card>
      
      {/* 비교 테이블 */}
      <Card>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : !data || data.models.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">
              비교할 모델이 없습니다
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>모델</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, minWidth: 100 }}>본사</TableCell>
                  {data.partners.map((partner) => (
                    <TableCell key={partner.id} align="right" sx={{ fontWeight: 700, minWidth: 100 }}>
                      {partner.name}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.models.map((model) => (
                  <TableRow key={model.model_id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {model.model_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {model.storage_display} | {model.model_code}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={500}>
                        {formatPrice(model.hq_price)}
                      </Typography>
                    </TableCell>
                    {data.partners.map((partner) => {
                      const price = model.partner_prices[partner.id];
                      const isMin = model.min_partner_id === partner.id;
                      const isMax = model.max_partner_id === partner.id;
                      
                      return (
                        <TableCell key={partner.id} align="right">
                          <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                            {isMax && <TrendingUpIcon sx={{ fontSize: 16, color: 'error.main' }} />}
                            {isMin && <TrendingDownIcon sx={{ fontSize: 16, color: 'success.main' }} />}
                            <Typography
                              variant="body2"
                              fontWeight={isMin || isMax ? 700 : 400}
                              color={isMin ? 'success.main' : isMax ? 'error.main' : 'text.primary'}
                            >
                              {formatPrice(price)}
                            </Typography>
                          </Stack>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </Box>
  );
}
