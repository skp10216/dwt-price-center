/**
 * AppSectionCard - 페이지 내 섹션 카드 (콘텐츠 그룹핑)
 *
 * 설계 원칙:
 * - 테이블, 차트, 폼 등을 감싸는 공통 카드 컨테이너
 * - border: 1px solid divider, borderRadius: 2 (8px)
 * - 내부 패딩은 밀도 모드에 따라 자동 조절
 * - 옵션: 제목(title), 부제목(subtitle), 우측 액션(action)
 *
 * AppDataCard는 KPI/요약 정보를 표시하는 작은 카드
 *
 * 사용 예시:
 * <AppSectionCard title="최근 전표" subtitle="최근 7일 기준" action={<Button>더보기</Button>}>
 *   <Table ... />
 * </AppSectionCard>
 *
 * <AppDataCard
 *   title="총 매출채권"
 *   value="₩12,345,678"
 *   color="success"
 *   icon={<TrendingUpIcon />}
 * />
 */

'use client';

import { Box, Paper, Typography, Stack, alpha, useTheme, type SxProps, type Theme } from '@mui/material';

// ─── AppSectionCard ──────────────────────────────────────────────────────────

export interface AppSectionCardProps {
  children: React.ReactNode;
  /** 섹션 제목 (선택) */
  title?: string;
  /** 섹션 부제목 (선택) */
  subtitle?: string;
  /** 우측 액션 영역 (선택) */
  action?: React.ReactNode;
  /** 내부 패딩 제거 (테이블 직접 삽입 시) */
  noPadding?: boolean;
  /** 추가 sx 스타일 */
  sx?: SxProps<Theme>;
}

export function AppSectionCard({
  children,
  title,
  subtitle,
  action,
  noPadding = false,
  sx,
}: AppSectionCardProps) {
  const hasHeader = title || subtitle || action;

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflow: 'hidden',
        ...sx,
      }}
    >
      {/* 섹션 헤더 — 제목 계층 강화 (subtitle2→subtitle1, fontWeight 600→700) */}
      {hasHeader && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.25,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box>
            {title && (
              <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3, fontSize: '0.925rem', letterSpacing: '-0.01em' }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, fontWeight: 500 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action && <Box>{action}</Box>}
        </Box>
      )}

      {/* 콘텐츠 영역 */}
      <Box sx={noPadding ? undefined : { p: 2 }}>{children}</Box>
    </Paper>
  );
}

// ─── AppDataCard ─────────────────────────────────────────────────────────────

export interface AppDataCardProps {
  /** 카드 라벨 */
  title: string;
  /** 주요 값 (문자열 또는 ReactNode) */
  value: React.ReactNode;
  /** 보조 텍스트 (변동량 등) */
  subtitle?: string;
  /** 좌측 아이콘 */
  icon?: React.ReactNode;
  /** 강조 색상 */
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'success' | 'info';
  /** 추가 sx 스타일 */
  sx?: SxProps<Theme>;
  /** 클릭 핸들러 */
  onClick?: () => void;
}

export function AppDataCard({
  title,
  value,
  subtitle,
  icon,
  color = 'primary',
  sx,
  onClick,
}: AppDataCardProps) {
  const theme = useTheme();
  const paletteColor = theme.palette[color as keyof typeof theme.palette] as {
    main: string;
  };
  const mainColor = paletteColor?.main ?? theme.palette.primary.main;

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
            sx={{ fontWeight: 500, lineHeight: 1.3, display: 'block' }}
          >
            {title}
          </Typography>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{
              lineHeight: 1.3,
              fontSize: '1.125rem',
              fontFeatureSettings: '"tnum" on, "lnum" on',
              fontVariantNumeric: 'tabular-nums',
              mt: 0.25,
            }}
          >
            {value}
          </Typography>
          {subtitle && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: '0.6875rem', lineHeight: 1.3, mt: 0.25, display: 'block' }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

export default AppSectionCard;
