/**
 * AppMetricChip / AppMetricCard - KPI/지표 표시 컴포넌트
 *
 * AppMetricChip: 헤더 우측에 인라인으로 표시하는 작은 KPI 칩
 * AppMetricCard: 대시보드 등에서 큰 카드로 표시하는 KPI 카드
 *
 * 사용 예시:
 * // 헤더 내 인라인 KPI
 * <AppMetricChip label="총 매출채권" value="₩12.3억" color="success" />
 *
 * // 대시보드 KPI 카드
 * <AppMetricCard
 *   label="총 매출채권"
 *   value="₩12,345,678"
 *   change="+5.2%"
 *   changeType="up"
 *   icon={<TrendingUpIcon />}
 *   color="success"
 * />
 */

'use client';

import { Box, Chip, Paper, Typography, Stack, type SxProps, type Theme } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
} from '@mui/icons-material';

// ─── AppMetricChip (인라인 KPI 칩) ──────────────────────────────────────────

export interface AppMetricChipProps {
  /** 지표 라벨 */
  label: string;
  /** 지표 값 (포맷된 문자열) */
  value: string;
  /** 강조 색상 */
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'success' | 'info';
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 추가 sx */
  sx?: SxProps<Theme>;
}

export function AppMetricChip({
  label,
  value,
  color = 'primary',
  onClick,
  sx,
}: AppMetricChipProps) {
  const theme = useTheme();
  const paletteColor = theme.palette[color as keyof typeof theme.palette] as {
    main: string;
  };
  const mainColor = paletteColor?.main ?? theme.palette.primary.main;

  return (
    <Chip
      label={
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'baseline' }}>
          <Box component="span" sx={{ fontSize: '0.625rem', opacity: 0.8 }}>
            {label}
          </Box>
          <Box
            component="span"
            sx={{
              fontWeight: 700,
              fontSize: '0.75rem',
              fontFeatureSettings: '"tnum" on, "lnum" on',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </Box>
        </Box>
      }
      size="small"
      onClick={onClick}
      sx={{
        height: 24,
        bgcolor: alpha(mainColor, 0.1),
        color: mainColor,
        border: `1px solid ${alpha(mainColor, 0.2)}`,
        fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick
          ? { bgcolor: alpha(mainColor, 0.15) }
          : {},
        ...sx,
      }}
    />
  );
}

// ─── AppMetricCard (KPI 카드) ────────────────────────────────────────────────

export interface AppMetricCardProps {
  /** 지표 라벨 */
  label: string;
  /** 지표 값 (포맷된 문자열) */
  value: string;
  /** 변동량 표시 (예: "+5.2%", "-₩1,234") */
  change?: string;
  /** 변동 방향 */
  changeType?: 'up' | 'down' | 'flat';
  /** 좌측 아이콘 */
  icon?: React.ReactNode;
  /** 강조 색상 */
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'success' | 'info';
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 추가 sx */
  sx?: SxProps<Theme>;
}

export function AppMetricCard({
  label,
  value,
  change,
  changeType = 'flat',
  icon,
  color = 'primary',
  onClick,
  sx,
}: AppMetricCardProps) {
  const theme = useTheme();
  const paletteColor = theme.palette[color as keyof typeof theme.palette] as {
    main: string;
  };
  const mainColor = paletteColor?.main ?? theme.palette.primary.main;

  // 변동 아이콘 & 색상
  const changeIconMap = {
    up: <TrendingUpIcon sx={{ fontSize: 14 }} />,
    down: <TrendingDownIcon sx={{ fontSize: 14 }} />,
    flat: <TrendingFlatIcon sx={{ fontSize: 14 }} />,
  };
  const changeColorMap = {
    up: theme.palette.success.main,
    down: theme.palette.error.main,
    flat: theme.palette.text.secondary,
  };

  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        '&:hover': onClick
          ? {
              borderColor: alpha(mainColor, 0.4),
              bgcolor: alpha(mainColor, 0.02),
            }
          : undefined,
        ...sx,
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        {icon && (
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              bgcolor: alpha(mainColor, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: mainColor,
              flexShrink: 0,
              '& svg': { fontSize: 20 },
            }}
          >
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 500, lineHeight: 1.3, display: 'block', mb: 0.25 }}
          >
            {label}
          </Typography>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{
              lineHeight: 1.3,
              fontSize: '1.125rem',
              fontFeatureSettings: '"tnum" on, "lnum" on',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </Typography>
          {change && (
            <Stack direction="row" alignItems="center" spacing={0.25} sx={{ mt: 0.5 }}>
              <Box sx={{ color: changeColorMap[changeType], display: 'flex', alignItems: 'center' }}>
                {changeIconMap[changeType]}
              </Box>
              <Typography
                variant="caption"
                sx={{
                  color: changeColorMap[changeType],
                  fontWeight: 600,
                  fontSize: '0.6875rem',
                  fontFeatureSettings: '"tnum" on, "lnum" on',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {change}
              </Typography>
            </Stack>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

export default AppMetricChip;
