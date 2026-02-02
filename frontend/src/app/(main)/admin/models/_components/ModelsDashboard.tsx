/**
 * SSOT 모델 관리 대시보드
 * 
 * FAQ 관리 페이지 스타일 UI:
 * - 그라데이션 헤더 (아이콘 + 제목 + 버튼)
 * - 통계 카드 3개
 * - 디바이스 타입별 카드 (스마트폰/태블릿/웨어러블)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Avatar,
  Stack,
  Chip,
  Skeleton,
  Divider,
  Paper,
  Button,
  LinearProgress,
} from '@mui/material';
import {
  Smartphone as SmartphoneIcon,
  Tablet as TabletIcon,
  Watch as WatchIcon,
  Apple as AppleIcon,
  PhoneAndroid as SamsungIcon,
  ArrowForward as ArrowIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';
import { ssotModelsApi, gradesApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import {
  DeviceType,
  Manufacturer,
  deviceTypeLabels,
  manufacturerLabels,
  SSOTModel,
  Grade,
} from './types';

// 디바이스 타입 아이콘
const deviceIcons: Record<DeviceType, React.ReactNode> = {
  smartphone: <SmartphoneIcon sx={{ fontSize: 48 }} />,
  tablet: <TabletIcon sx={{ fontSize: 48 }} />,
  wearable: <WatchIcon sx={{ fontSize: 48 }} />,
};

// 제조사 아이콘
const manufacturerIcons: Record<Manufacturer, React.ReactNode> = {
  apple: <AppleIcon />,
  samsung: <SamsungIcon />,
};

// 브랜드 색상
const brandColors: Record<Manufacturer, string> = {
  apple: '#333333',
  samsung: '#1428a0',
};

interface CategoryStats {
  deviceType: DeviceType;
  manufacturers: {
    manufacturer: Manufacturer;
    totalModels: number;
    configuredCount: number;
    unconfiguredCount: number;
    configurationRate: number;
  }[];
}

interface TotalStats {
  totalModels: number;
  configuredPrices: number;
  unconfiguredPrices: number;
}

export function ModelsDashboard() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [totals, setTotals] = useState<TotalStats>({ totalModels: 0, configuredPrices: 0, unconfiguredPrices: 0 });
  
  // 통계 로드
  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsRes, gradesRes] = await Promise.all([
        ssotModelsApi.list({ page_size: 1000, is_active: true }),
        gradesApi.list({ is_active: true }),
      ]);
      
      const models = modelsRes.data.data.models as SSOTModel[];
      const grades = (gradesRes.data.data.grades as Grade[]).filter((g) => g);
      
      // 통계 계산
      const deviceTypes: DeviceType[] = ['smartphone', 'tablet', 'wearable'];
      const manufacturers: Manufacturer[] = ['apple', 'samsung'];
      
      let totalConfigured = 0;
      let totalUnconfigured = 0;
      let totalModelsCount = 0;
      
      const categoryStats: CategoryStats[] = deviceTypes.map((dt) => ({
        deviceType: dt,
        manufacturers: manufacturers.map((mfr) => {
          const filtered = models.filter(
            (m) => m.device_type === dt && m.manufacturer === mfr
          );
          
          let configuredCount = 0;
          let unconfiguredCount = 0;
          
          filtered.forEach((model) => {
            grades.forEach((grade) => {
              const gp = model.grade_prices?.find((p) => p.grade_id === grade.id);
              if (gp && gp.price > 0) {
                configuredCount++;
              } else {
                unconfiguredCount++;
              }
            });
          });
          
          const total = configuredCount + unconfiguredCount;
          
          totalConfigured += configuredCount;
          totalUnconfigured += unconfiguredCount;
          totalModelsCount += filtered.length;
          
          return {
            manufacturer: mfr,
            totalModels: filtered.length,
            configuredCount,
            unconfiguredCount,
            configurationRate: total > 0 ? Math.round((configuredCount / total) * 100) : 0,
          };
        }),
      }));
      
      setStats(categoryStats);
      setTotals({
        totalModels: totalModelsCount,
        configuredPrices: totalConfigured,
        unconfiguredPrices: totalUnconfigured,
      });
    } catch (error) {
      enqueueSnackbar('통계를 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);
  
  useEffect(() => {
    loadStats();
  }, [loadStats]);
  
  // 페이지 이동
  const handleNavigate = (deviceType: DeviceType, manufacturer: Manufacturer) => {
    router.push(`/admin/models/${deviceType}/${manufacturer}`);
  };
  
  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 2, mb: 3 }} />
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} md={4} key={i}>
              <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={3}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} md={4} key={i}>
              <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 3 }} />
            </Grid>
          ))}
        </Grid>
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
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
              <InventoryIcon sx={{ color: 'white' }} />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight={700} color="white">
                SSOT 모델 관리
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                디바이스 타입/브랜드별 모델 가격을 관리합니다
              </Typography>
            </Box>
          </Stack>
          
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadStats}
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
        </Box>
      </Paper>
      
      {/* ========== 통계 카드 3개 ========== */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                전체 모델
              </Typography>
              <Typography variant="h3" fontWeight={700} color="primary.main">
                {totals.totalModels}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                가격 설정됨
              </Typography>
              <Typography variant="h3" fontWeight={700} color="success.main">
                {totals.configuredPrices}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                가격 미설정
              </Typography>
              <Typography variant="h3" fontWeight={700} color="warning.main">
                {totals.unconfiguredPrices}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* ========== 디바이스 타입별 카드 (이전 UI 원복) ========== */}
      <Grid container spacing={3}>
        {stats.map((category) => (
          <Grid item xs={12} md={4} key={category.deviceType}>
            <Card
              sx={{
                height: '100%',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
              }}
            >
              {/* 헤더 */}
              <Box
                sx={{
                  p: 3,
                  background: `linear-gradient(135deg, ${
                    category.deviceType === 'smartphone'
                      ? '#667eea, #764ba2'
                      : category.deviceType === 'tablet'
                      ? '#f093fb, #f5576c'
                      : '#4facfe, #00f2fe'
                  })`,
                  color: 'white',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Avatar
                    sx={{
                      width: 64,
                      height: 64,
                      bgcolor: 'rgba(255,255,255,0.2)',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    {deviceIcons[category.deviceType]}
                  </Avatar>
                  <Box>
                    <Typography variant="h5" fontWeight={700}>
                      {deviceTypeLabels[category.deviceType]}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      SSOT 모델 가격 관리
                    </Typography>
                  </Box>
                </Stack>
              </Box>
              
              <CardContent sx={{ p: 0 }}>
                {/* 브랜드별 카드 */}
                {category.manufacturers.map((mfr, idx) => (
                  <Box key={mfr.manufacturer}>
                    {idx > 0 && <Divider />}
                    <CardActionArea
                      onClick={() => handleNavigate(category.deviceType, mfr.manufacturer)}
                      sx={{
                        p: 2.5,
                        transition: 'all 0.2s',
                        '&:hover': {
                          bgcolor: 'grey.50',
                        },
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={2}>
                        {/* 브랜드 아이콘 */}
                        <Avatar
                          sx={{
                            bgcolor: brandColors[mfr.manufacturer],
                            color: 'white',
                            width: 44,
                            height: 44,
                          }}
                        >
                          {manufacturerIcons[mfr.manufacturer]}
                        </Avatar>
                        
                        {/* 브랜드 정보 */}
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {manufacturerLabels[mfr.manufacturer]}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {mfr.totalModels}개 모델
                          </Typography>
                          
                          {/* 진행률 바 */}
                          {mfr.totalModels > 0 && (
                            <Box sx={{ mt: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={mfr.configurationRate}
                                sx={{
                                  height: 6,
                                  borderRadius: 3,
                                  bgcolor: 'grey.200',
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor:
                                      mfr.configurationRate === 100
                                        ? 'success.main'
                                        : mfr.configurationRate > 50
                                        ? 'warning.main'
                                        : 'error.main',
                                    borderRadius: 3,
                                  },
                                }}
                              />
                              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  {mfr.configurationRate}% 설정됨
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {mfr.configuredCount}/{mfr.configuredCount + mfr.unconfiguredCount}
                                </Typography>
                              </Stack>
                            </Box>
                          )}
                        </Box>
                        
                        {/* 상태 배지 */}
                        <Stack direction="column" spacing={0.5} alignItems="flex-end">
                          {mfr.unconfiguredCount === 0 && mfr.totalModels > 0 ? (
                            <Chip
                              icon={<CheckCircleIcon />}
                              label="완료"
                              size="small"
                              color="success"
                            />
                          ) : mfr.unconfiguredCount > 0 ? (
                            <Chip
                              icon={<WarningIcon />}
                              label={`미설정 ${mfr.unconfiguredCount}`}
                              size="small"
                              color="warning"
                            />
                          ) : null}
                          <ArrowIcon color="action" sx={{ fontSize: 20 }} />
                        </Stack>
                      </Stack>
                    </CardActionArea>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
