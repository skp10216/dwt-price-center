/**
 * DWT (다원트레이드) 로고 컴포넌트
 * 
 * 사용처:
 * - 로그인 페이지
 * - 대시보드 상단 (AppBar)
 * - 사이드바 헤더
 */

'use client';

import { Box, Typography, alpha, useTheme } from '@mui/material';

interface LogoProps {
  /** 로고 크기 - 기본 텍스트 높이 기준 */
  size?: 'small' | 'medium' | 'large';
  /** 회사명 표시 여부 */
  showCompanyName?: boolean;
  /** 서브타이틀 표시 여부 */
  showSubtitle?: boolean;
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 다크 배경용 (로그인 페이지 등) */
  variant?: 'light' | 'dark' | 'auto';
}

// 크기별 설정
const sizeConfig = {
  small: {
    fontSize: 24,
    subtitleSize: '0.6rem',
    spacing: 0.5,
  },
  medium: {
    fontSize: 32,
    subtitleSize: '0.7rem',
    spacing: 0.75,
  },
  large: {
    fontSize: 48,
    subtitleSize: '0.85rem',
    spacing: 1,
  },
};

export function Logo({
  size = 'medium',
  showCompanyName = false,
  showSubtitle = false,
  onClick,
  variant = 'auto',
}: LogoProps) {
  const theme = useTheme();
  const config = sizeConfig[size];
  
  // 배경에 따른 색상 결정
  const isDark = variant === 'dark' || (variant === 'auto' && theme.palette.mode === 'dark');
  
  // DWT 로고 색상
  const colors = {
    d: '#2d4a6f',       // 진한 남색
    w: {
      start: '#0d9488', // 틸 시작
      end: '#14b8a6',   // 틸 끝
    },
    t: isDark ? '#9ca3af' : '#6b7280',  // 회색 (다크모드에서 더 밝게)
    subtitle: isDark ? alpha('#ffffff', 0.6) : '#9ca3af',
  };

  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        transition: 'transform 0.2s ease',
        '&:hover': onClick ? {
          transform: 'scale(1.02)',
        } : {},
      }}
    >
      {/* DWT 로고 텍스트 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          fontFamily: '"Pretendard Variable", "Pretendard", sans-serif',
          fontWeight: 800,
          fontSize: config.fontSize,
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {/* D */}
        <Box
          component="span"
          sx={{
            color: colors.d,
            position: 'relative',
            '&::before': {
              content: '"D"',
              position: 'absolute',
              left: 0,
              top: 0,
              background: `linear-gradient(135deg, ${colors.d} 0%, ${alpha(colors.d, 0.8)} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            },
          }}
        >
          D
        </Box>

        {/* W - 그라데이션 */}
        <Box
          component="span"
          sx={{
            background: `linear-gradient(135deg, ${colors.w.start} 0%, ${colors.w.end} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            mx: '-0.02em',
          }}
        >
          W
        </Box>

        {/* T */}
        <Box
          component="span"
          sx={{
            color: colors.t,
          }}
        >
          T
        </Box>
      </Box>

      {/* 회사명 (선택적) */}
      {showCompanyName && (
        <Typography
          sx={{
            fontSize: config.subtitleSize,
            fontWeight: 500,
            color: colors.subtitle,
            mt: config.spacing,
            letterSpacing: '0.05em',
          }}
        >
          <Box component="span" sx={{ color: colors.subtitle }}>
            (주)
          </Box>{' '}
          <Box component="span" sx={{ fontWeight: 600, color: isDark ? alpha('#ffffff', 0.7) : '#4b5563' }}>
            다원
          </Box>
          <Box component="span" sx={{ color: colors.subtitle }}>
            트레이드
          </Box>
        </Typography>
      )}

      {/* 서브타이틀 (선택적) */}
      {showSubtitle && (
        <Typography
          sx={{
            fontSize: size === 'large' ? '0.75rem' : '0.65rem',
            fontWeight: 500,
            color: colors.subtitle,
            mt: 0.5,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Price Center
        </Typography>
      )}
    </Box>
  );
}

/**
 * 로고 아이콘만 (AppBar, Favicon 등에 사용)
 */
export function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: size * 0.2,
        background: 'linear-gradient(135deg, #0d9488 0%, #2d4a6f 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontFamily: '"Pretendard Variable", "Pretendard", sans-serif',
        fontWeight: 800,
        fontSize: size * 0.5,
        letterSpacing: '-0.05em',
      }}
    >
      D
    </Box>
  );
}

export default Logo;
