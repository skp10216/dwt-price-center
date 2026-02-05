/**
 * SSOT 모델 관리 대시보드
 * 
 * 프리미엄 UI 특징:
 * - 그라데이션 헤더 (아이콘 + 제목 + 버튼)
 * - 통계 카드 3개 (애니메이션 카운터)
 * - 디바이스 타입별 카드 (스마트폰/태블릿/웨어러블)
 * 
 * SSOT: 모든 색상은 theme/tokens에서 가져옴
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
  alpha,
  useTheme,
  Theme,
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
  TrendingUp as TrendingUpIcon,
  PriceCheck as PriceCheckIcon,
  PriceChange as PriceChangeIcon,
} from '@mui/icons-material';
import { ssotModelsApi, gradesApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { shadows, transitions } from '@/theme/tokens';
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

// 제조사 브랜드 색상 (브랜드 아이덴티티 - 예외 허용)
const manufacturerBrandColors: Record<Manufacturer, { light: string; dark: string; text: { light: string; dark: string } }> = {
  apple: {
    light: '#1d1d1f',
    dark: '#f5f5f7',
    text: {
      light: '#f5f5f7',
      dark: '#1d1d1f',
    },
  },
  samsung: {
    light: '#1428a0',
    dark: '#1428a0',
    text: {
      light: '#ffffff',
      dark: '#ffffff',
    },
  },
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

// 통계 카드 컴포넌트
function StatCard({
  title,
  value,
  icon,
  color,
  loading,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'warning';
  loading?: boolean;
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
        position: 'relative',
        '&:hover': {
          boxShadow: shadows.md,
          transform: 'translateY(-2px)',
          '& .stat-icon': {
            transform: 'scale(1.1) rotate(-5deg)',
          },
        },
      }}
    >
      {/* 상단 컬러 라인 */}
      <Box
        sx={{
          height: 4,
          background: `linear-gradient(90deg, ${colorMap[color]}, ${alpha(colorMap[color], 0.6)})`,
        }}
      />
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
              fontWeight={500}
              gutterBottom
            >
              {title}
            </Typography>
            {loading ? (
              <Skeleton width={80} height={48} />
            ) : (
              <Typography
                variant="h3"
                fontWeight={800}
                sx={{
                  color: colorMap[color],
                  letterSpacing: '-0.02em',
                }}
              >
                {value.toLocaleString()}
              </Typography>
            )}
          </Box>
          <Avatar
            className="stat-icon"
            sx={{
              width: 52,
              height: 52,
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

export function ModelsDashboard() {
  const router = useRouter();
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [totals, setTotals] = useState<TotalStats>({
    totalModels: 0,
    configuredPrices: 0,
    unconfiguredPrices: 0,
  });

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
        <Skeleton
          variant="rectangular"
          height={100}
          sx={{ borderRadius: 3, mb: 3 }}
        />
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} md={4} key={i}>
              <Skeleton variant="rectangular" height={130} sx={{ borderRadius: 3 }} />
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={3}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} md={4} key={i}>
              <Skeleton variant="rectangular" height={340} sx={{ borderRadius: 3 }} />
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
          borderRadius: 3,
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
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
              <InventoryIcon sx={{ color: 'white', fontSize: 28 }} />
            </Avatar>
            <Box>
              <Typography
                variant="h5"
                fontWeight={700}
                color="white"
                sx={{ letterSpacing: '-0.01em' }}
              >
                모델 관리
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: alpha('#ffffff', 0.8), mt: 0.25 }}
              >
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
              borderColor: alpha('#ffffff', 0.4),
              borderWidth: 1.5,
              fontWeight: 600,
              px: 2.5,
              '&:hover': {
                borderColor: 'white',
                bgcolor: alpha('#ffffff', 0.1),
                borderWidth: 1.5,
              },
            }}
          >
            새로고침
          </Button>
        </Box>
      </Paper>

      {/* ========== 통계 카드 3개 ========== */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <StatCard
            title="전체 모델"
            value={totals.totalModels}
            icon={<TrendingUpIcon />}
            color="primary"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatCard
            title="가격 설정됨"
            value={totals.configuredPrices}
            icon={<PriceCheckIcon />}
            color="success"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <StatCard
            title="가격 미설정"
            value={totals.unconfiguredPrices}
            icon={<PriceChangeIcon />}
            color="warning"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* ========== 디바이스 타입별 카드 ========== */}
      <Grid container spacing={3}>
        {stats.map((category) => (
          <Grid item xs={12} md={4} key={category.deviceType}>
            <Card
              sx={{
                height: '100%',
                borderRadius: 3,
                border: `1px solid ${theme.palette.divider}`,
                overflow: 'hidden',
                boxShadow: shadows.sm,
                transition: transitions.normal,
                '&:hover': {
                  boxShadow: shadows.lg,
                  transform: 'translateY(-4px)',
                },
              }}
            >
              {/* 헤더 */}
              <Box
                sx={{
                  p: 3,
                  background: getDeviceGradient(category.deviceType, theme),
                  color: 'white',
                  position: 'relative',
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 120,
                    height: 120,
                    borderRadius: '50%',
                    background: alpha('#ffffff', 0.08),
                    transform: 'translate(30%, 30%)',
                  },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Avatar
                    sx={{
                      width: 64,
                      height: 64,
                      bgcolor: alpha('#ffffff', 0.15),
                      backdropFilter: 'blur(10px)',
                      border: `1px solid ${alpha('#ffffff', 0.2)}`,
                    }}
                  >
                    {deviceIcons[category.deviceType]}
                  </Avatar>
                  <Box>
                    <Typography variant="h5" fontWeight={700}>
                      {deviceTypeLabels[category.deviceType]}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ opacity: 0.9, fontWeight: 500 }}
                    >
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
                      onClick={() =>
                        handleNavigate(category.deviceType, mfr.manufacturer)
                      }
                      sx={{
                        p: 2.5,
                        transition: transitions.fast,
                        '&:hover': {
                          bgcolor:
                            theme.palette.mode === 'light'
                              ? alpha(theme.palette.primary.main, 0.04)
                              : alpha(theme.palette.primary.main, 0.08),
                          '& .arrow-icon': {
                            transform: 'translateX(4px)',
                            color: theme.palette.primary.main,
                          },
                        },
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={2}>
                        {/* 브랜드 아이콘 */}
                        <Avatar
                          sx={{
                            bgcolor: theme.palette.mode === 'light'
                              ? manufacturerBrandColors[mfr.manufacturer].light
                              : manufacturerBrandColors[mfr.manufacturer].dark,
                            color: theme.palette.mode === 'light'
                              ? manufacturerBrandColors[mfr.manufacturer].text.light
                              : manufacturerBrandColors[mfr.manufacturer].text.dark,
                            width: 48,
                            height: 48,
                            boxShadow: shadows.sm,
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
                            <Box sx={{ mt: 1.5 }}>
                              <LinearProgress
                                variant="determinate"
                                value={mfr.configurationRate}
                                sx={{
                                  height: 6,
                                  borderRadius: 3,
                                  bgcolor:
                                    theme.palette.mode === 'light'
                                      ? alpha(theme.palette.divider, 0.5)
                                      : alpha(theme.palette.divider, 0.3),
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor:
                                      mfr.configurationRate === 100
                                        ? theme.palette.success.main
                                        : mfr.configurationRate > 50
                                        ? theme.palette.warning.main
                                        : theme.palette.error.main,
                                    borderRadius: 3,
                                    transition: transitions.slow,
                                  },
                                }}
                              />
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                                sx={{ mt: 0.75 }}
                              >
                                <Typography variant="caption" color="text.secondary">
                                  {mfr.configurationRate}% 설정됨
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {mfr.configuredCount}/
                                  {mfr.configuredCount + mfr.unconfiguredCount}
                                </Typography>
                              </Stack>
                            </Box>
                          )}
                        </Box>

                        {/* 상태 배지 */}
                        <Stack direction="column" spacing={1} alignItems="flex-end">
                          {mfr.unconfiguredCount === 0 && mfr.totalModels > 0 ? (
                            <Chip
                              icon={<CheckCircleIcon />}
                              label="완료"
                              size="small"
                              color="success"
                              sx={{ fontWeight: 600 }}
                            />
                          ) : mfr.unconfiguredCount > 0 ? (
                            <Chip
                              icon={<WarningIcon />}
                              label={`미설정 ${mfr.unconfiguredCount}`}
                              size="small"
                              color="warning"
                              sx={{ fontWeight: 600 }}
                            />
                          ) : null}
                          <ArrowIcon
                            className="arrow-icon"
                            sx={{
                              fontSize: 20,
                              color: 'text.secondary',
                              transition: transitions.fast,
                            }}
                          />
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
