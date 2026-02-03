/**
 * MUI Theme Registry for Next.js App Router
 * SSR 깜빡임 방지 + 외관 설정 연동
 * 
 * SSOT: 모든 테마 제공은 이 컴포넌트를 통해서만
 */

'use client';

import * as React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import { SnackbarProvider } from 'notistack';
import { createAppTheme } from './createAppTheme';
import { useAppearanceStore, useAppearanceHydrated } from '@/lib/store';
import { DEFAULT_SETTINGS } from './settings';
import type { PaletteMode } from '@mui/material';

interface ThemeRegistryProps {
  children: React.ReactNode;
}

export default function ThemeRegistry({ children }: ThemeRegistryProps) {
  // 외관 설정 가져오기
  const settings = useAppearanceStore((state) => state.settings);
  const isHydrated = useAppearanceHydrated();
  
  // 마운트 상태 및 시스템 테마 모드
  const [mounted, setMounted] = React.useState(false);
  const [systemMode, setSystemMode] = React.useState<PaletteMode>('light');

  // 클라이언트 마운트 및 시스템 테마 감지
  React.useEffect(() => {
    setMounted(true);

    // 시스템 다크모드 설정 감지
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemMode(mediaQuery.matches ? 'dark' : 'light');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemMode(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // SSR에서는 기본값 사용, CSR에서는 저장된 설정 사용 (깜빡임 최소화)
  const effectiveSettings = React.useMemo(() => {
    if (!mounted || !isHydrated) {
      return DEFAULT_SETTINGS;
    }
    return settings;
  }, [mounted, isHydrated, settings]);

  // 테마 생성 (settings 또는 systemMode 변경 시에만 재생성)
  const theme = React.useMemo(
    () => createAppTheme(effectiveSettings, systemMode),
    [effectiveSettings, systemMode]
  );

  // CSS 변수로 테마 색상 노출 (CSS-in-JS 외부에서도 사용 가능)
  React.useEffect(() => {
    if (!mounted) return;
    
    const root = document.documentElement;
    root.style.setProperty('--primary-main', theme.palette.primary.main);
    root.style.setProperty('--primary-light', theme.palette.primary.light);
    root.style.setProperty('--primary-dark', theme.palette.primary.dark);
    root.style.setProperty('--background-default', theme.palette.background.default);
    root.style.setProperty('--background-paper', theme.palette.background.paper);
    root.style.setProperty('--text-primary', theme.palette.text.primary);
    root.style.setProperty('--text-secondary', theme.palette.text.secondary);
  }, [mounted, theme]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {/* 전역 스타일: body 스크롤 방지 (레이아웃에서 개별 영역별로 스크롤 처리) */}
      <GlobalStyles
        styles={{
          'html, body': {
            height: '100%',
            overflow: 'hidden',
            margin: 0,
            padding: 0,
          },
        }}
      />
      <SnackbarProvider
        maxSnack={3}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        autoHideDuration={3000}
        preventDuplicate
        style={{
          // Snackbar도 테마 기반으로 스타일 적용
          fontFamily: theme.typography.fontFamily,
        }}
      >
        {children}
      </SnackbarProvider>
    </ThemeProvider>
  );
}
