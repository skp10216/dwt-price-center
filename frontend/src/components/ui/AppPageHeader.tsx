/**
 * AppPageHeader - 강조형 컴팩트 헤더 (전 페이지 공통)
 *
 * 설계 원칙:
 * 1. 좌측 3px accent bar로 시각적 강조 (과하지 않은 백오피스형)
 * 2. 좌: 아이콘박스(28×28) + 제목(h6, 1rem, 700) + 설명(caption)
 * 3. 우: KPI chips[] + count + 새로고침 + actions[]
 * 4. 내부 패딩: px:2, py:1.25 (compact하게)
 * 5. border-left accent color로 헤더 존재감 확보
 *
 * variants:
 * - default: 표준 헤더 (좌측 accent bar + 아이콘)
 * - compact: 제목만 표시 (설명/칩 없음)
 * - with-metrics: 우측에 KPI MetricChip 포함
 *
 * 사용 예시:
 * <AppPageHeader
 *   icon={<ReceiptIcon />}
 *   title="전표 목록"
 *   description="전표 원장을 조회하고 관리합니다"
 *   color="info"
 *   count={total}
 *   onRefresh={loadData}
 *   loading={loading}
 *   chips={[<Chip label="마감 3건" color="warning" size="small" />]}
 *   actions={[
 *     { label: '전표 추가', onClick: () => {}, variant: 'contained', color: 'primary' },
 *   ]}
 * />
 */

'use client';

import {
  Box,
  Paper,
  Typography,
  Stack,
  IconButton,
  Chip,
  Button,
  Tooltip,
  CircularProgress,
  type ButtonProps,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material';

// 액션 버튼 정의
export interface AppPageHeaderAction {
  label: string;
  onClick: () => void;
  variant?: ButtonProps['variant'];
  color?: ButtonProps['color'];
  disabled?: boolean;
  icon?: React.ReactNode;
  tooltip?: string;
}

// variant 타입
export type AppPageHeaderVariant = 'default' | 'compact' | 'with-metrics';

export interface AppPageHeaderProps {
  /** 제목 좌측 아이콘 (ReactNode) */
  icon?: React.ReactNode;
  /** 페이지 제목 */
  title: string;
  /** 제목 하단 보조 설명 (생략 가능) */
  description?: string;
  /**
   * 아이콘박스 및 좌측 accent bar 강조 색상
   * primary | secondary | error | warning | success | info
   * 기본값: 'primary'
   */
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'success' | 'info';
  /** 총 데이터 건수 (표시 시 "N건" 칩으로 렌더링) */
  count?: number | null;
  /** 새로고침 핸들러 (없으면 버튼 미표시) */
  onRefresh?: () => void;
  /** 로딩 상태 */
  loading?: boolean;
  /** 우측에 추가로 표시할 칩/KPI 배열 */
  chips?: React.ReactNode[];
  /** 우측 액션 버튼 배열 */
  actions?: AppPageHeaderAction[];
  /** variant (기본: 'default') */
  variant?: AppPageHeaderVariant;
  /**
   * 좌측 accent bar 강조 모드 (기본: false)
   * true이면 배경에 은은한 그라디언트 톤 추가
   */
  highlight?: boolean;
  /** 추가 sx 스타일 */
  sx?: SxProps<Theme>;
}

export default function AppPageHeader({
  icon,
  title,
  description,
  color = 'primary',
  count,
  onRefresh,
  loading = false,
  chips = [],
  actions = [],
  variant = 'default',
  highlight = false,
  sx,
}: AppPageHeaderProps) {
  const theme = useTheme();

  // MUI 팔레트에서 색상 추출
  const paletteColor = theme.palette[color as keyof typeof theme.palette] as {
    main: string;
    light?: string;
    dark?: string;
  };
  const mainColor = paletteColor?.main ?? theme.palette.primary.main;

  const isCompact = variant === 'compact';

  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1.25,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        gap: 2,
        flexWrap: 'wrap',
        // 좌측 accent bar (3px) — 헤더 존재감 강조
        borderLeft: `3px solid ${mainColor}`,
        position: 'relative',
        // highlight 모드: 배경에 은은한 그라디언트 톤 추가
        ...(highlight && {
          background: `linear-gradient(135deg, ${alpha(mainColor, 0.06)} 0%, transparent 60%)`,
        }),
        ...sx,
      }}
    >
      {/* 좌측: 아이콘 + 제목 + 설명 */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
        {icon && (
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1.5,
              bgcolor: alpha(mainColor, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: mainColor,
              flexShrink: 0,
              '& svg': { fontSize: 16 },
            }}
          >
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ lineHeight: 1.2, fontSize: '1rem' }}
          >
            {title}
          </Typography>
          {!isCompact && description && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', lineHeight: 1.4, mt: 0.25 }}
            >
              {description}
            </Typography>
          )}
        </Box>
      </Stack>

      {/* 우측: 칩/KPI + 카운트 + 새로고침 + 액션 버튼 */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        flexShrink={0}
        flexWrap="wrap"
        useFlexGap
      >
        {/* 커스텀 chips / KPI */}
        {!isCompact &&
          chips.map((chip, idx) => (
            <Box key={idx}>{chip}</Box>
          ))}

        {/* 총 건수 */}
        {count != null && (
          <Chip
            label={`총 ${count.toLocaleString()}건`}
            size="small"
            variant="outlined"
            sx={{
              height: 22,
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'text.secondary',
              borderColor: alpha(theme.palette.text.secondary, 0.3),
            }}
          />
        )}

        {/* 새로고침 버튼 */}
        {onRefresh && (
          <Tooltip title="새로고침">
            <span>
              <IconButton
                size="small"
                onClick={onRefresh}
                disabled={loading}
                sx={{ color: 'text.secondary', width: 28, height: 28 }}
              >
                {loading ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <RefreshIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* 액션 버튼들 */}
        {actions.map((action, idx) => {
          const btn = (
            <Button
              key={idx}
              size="small"
              variant={action.variant ?? (idx === actions.length - 1 ? 'contained' : 'outlined')}
              color={action.color ?? 'primary'}
              onClick={action.onClick}
              disabled={action.disabled}
              startIcon={action.icon}
              sx={{ height: 30, fontSize: '0.8125rem', fontWeight: 600, minWidth: 'auto' }}
            >
              {action.label}
            </Button>
          );
          return action.tooltip ? (
            <Tooltip key={idx} title={action.tooltip}>
              <span>{btn}</span>
            </Tooltip>
          ) : btn;
        })}
      </Stack>
    </Paper>
  );
}
