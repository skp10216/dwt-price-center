/**
 * AppDetailDrawer - 우측 상세 패널 공통 컴포넌트
 *
 * 데스크톱: persistent (메인 컨텐츠 폭 축소)
 * 모바일: temporary (오버레이, 전체화면)
 *
 * 사용 예시:
 * <AppDetailDrawer
 *   open={!!selectedId}
 *   onClose={() => setSelectedId(null)}
 *   title="입출금 상세"
 * >
 *   <DrawerContent />
 * </AppDetailDrawer>
 */

'use client';

import { ReactNode } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  useMediaQuery,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

export interface AppDetailDrawerProps {
  /** Drawer 열림 상태 */
  open: boolean;
  /** 닫기 핸들러 */
  onClose: () => void;
  /** 제목 */
  title?: string;
  /** Drawer 폭 (기본 440px) */
  width?: number;
  /** Drawer 내용 */
  children: ReactNode;
  /** 헤더 우측 추가 액션 */
  headerActions?: ReactNode;
  /** 추가 sx 스타일 */
  sx?: SxProps<Theme>;
}

export default function AppDetailDrawer({
  open,
  onClose,
  title,
  width = 440,
  children,
  headerActions,
  sx,
}: AppDetailDrawerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant={isMobile ? 'temporary' : 'persistent'}
      sx={{
        '& .MuiDrawer-paper': {
          width: isMobile ? '100%' : width,
          maxWidth: '100vw',
          boxSizing: 'border-box',
          borderLeft: isMobile ? 'none' : `1px solid ${theme.palette.divider}`,
        },
        ...sx,
      }}
    >
      {/* 헤더 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          minHeight: 56,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton size="small" onClick={onClose} edge="start">
            <CloseIcon />
          </IconButton>
          {title && (
            <Typography variant="subtitle1" fontWeight={600}>
              {title}
            </Typography>
          )}
        </Box>
        {headerActions && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {headerActions}
          </Box>
        )}
      </Box>
      <Divider />

      {/* 본문 */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
        }}
      >
        {children}
      </Box>
    </Drawer>
  );
}
