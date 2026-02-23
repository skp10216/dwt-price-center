/**
 * AppPageContainer - 모든 페이지의 최외곽 컨테이너
 *
 * 밀도 모드에 따라 padding이 자동 조절됨
 * - compact: 12px
 * - regular: 16px
 * - spacious: 24px
 *
 * 사용 예시:
 * <AppPageContainer>
 *   <AppPageHeader ... />
 *   <AppPageToolbar ... />
 *   <AppSectionCard>
 *     <Table ... />
 *   </AppSectionCard>
 * </AppPageContainer>
 */

'use client';

import { Box, type SxProps, type Theme } from '@mui/material';

export interface AppPageContainerProps {
  children: React.ReactNode;
  /** 최대 너비 제한 (기본값: 없음, 전체폭) */
  maxWidth?: number | string;
  /** 추가 sx 스타일 */
  sx?: SxProps<Theme>;
}

export default function AppPageContainer({
  children,
  maxWidth,
  sx,
}: AppPageContainerProps) {
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: maxWidth ?? '100%',
        mx: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
