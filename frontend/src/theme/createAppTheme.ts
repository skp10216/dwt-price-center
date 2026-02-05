/**
 * MUI Theme 생성 함수
 * SSOT: 모든 테마는 이 함수에서만 생성
 * 
 * 사용법:
 * const theme = createAppTheme(settings, systemMode);
 */

'use client';

import { createTheme, alpha, type Theme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import {
  accentPalettes,
  semanticColors,
  getBackgroundColors,
  getTextColors,
  getDividerColor,
  getDensityConfig,
  fontScales,
  shadows,
  transitions,
} from './tokens';
import type { AppearanceSettings } from './settings';

// 컴포넌트 오버라이드 생성
const createComponentOverrides = (
  mode: PaletteMode,
  accentColor: string,
  density: ReturnType<typeof getDensityConfig>
): Theme['components'] => ({
  // 버튼
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: density.borderRadius,
        padding: `${density.buttonPadding.y}px ${density.buttonPadding.x}px`,
        fontWeight: 600,
        boxShadow: 'none',
        transition: transitions.fast,
        '&:hover': {
          boxShadow: mode === 'light' ? shadows.sm : shadows.darkSm,
        },
      },
      contained: {
        '&:hover': {
          transform: 'translateY(-1px)',
        },
      },
      outlined: {
        borderWidth: '1.5px',
        '&:hover': {
          borderWidth: '1.5px',
        },
      },
      sizeSmall: {
        padding: `${density.buttonPadding.y - 2}px ${density.buttonPadding.x - 4}px`,
      },
      sizeLarge: {
        padding: `${density.buttonPadding.y + 4}px ${density.buttonPadding.x + 8}px`,
      },
    },
    defaultProps: {
      disableElevation: true,
    },
  },

  // 카드
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: density.borderRadius + 4,
        boxShadow: mode === 'light' ? shadows.sm : shadows.darkSm,
        backgroundImage: 'none',
        border: `1px solid ${mode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
        transition: transitions.normal,
        '&:hover': {
          boxShadow: mode === 'light' ? shadows.md : shadows.darkMd,
        },
      },
    },
  },

  // 페이퍼
  MuiPaper: {
    styleOverrides: {
      root: {
        borderRadius: density.borderRadius + 4,
        backgroundImage: 'none',
      },
      elevation1: {
        boxShadow: mode === 'light' ? shadows.sm : shadows.darkSm,
      },
      elevation2: {
        boxShadow: mode === 'light' ? shadows.md : shadows.darkMd,
      },
      elevation3: {
        boxShadow: mode === 'light' ? shadows.lg : shadows.darkLg,
      },
    },
  },

  // 텍스트 필드
  MuiTextField: {
    defaultProps: {
      variant: 'outlined',
      size: 'small',
    },
  },

  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: density.borderRadius,
        transition: transitions.fast,
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderWidth: '1.5px',
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderWidth: '2px',
        },
      },
      input: {
        padding: `${density.inputPadding.y}px ${density.inputPadding.x}px`,
      },
    },
  },

  // 칩
  MuiChip: {
    styleOverrides: {
      root: {
        height: density.chipHeight,
        fontWeight: 500,
        borderRadius: density.borderRadius,
        transition: transitions.fast,
      },
      sizeSmall: {
        height: density.chipHeight - 4,
      },
      filled: {
        '&.MuiChip-colorDefault': {
          backgroundColor: mode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)',
        },
      },
    },
  },

  // 아이콘 버튼
  MuiIconButton: {
    styleOverrides: {
      root: {
        borderRadius: density.borderRadius,
        transition: transitions.fast,
      },
      sizeSmall: {
        padding: 4,
      },
      sizeMedium: {
        padding: 8,
      },
    },
  },

  // 다이얼로그
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: density.dialogBorderRadius,
        boxShadow: mode === 'light' ? shadows.xl : '0 25px 50px -12px rgb(0 0 0 / 0.5)',
      },
    },
  },

  // 툴팁
  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        backgroundColor: mode === 'light' ? '#1e293b' : '#f1f5f9',
        color: mode === 'light' ? '#f1f5f9' : '#1e293b',
        fontSize: '0.75rem',
        fontWeight: 500,
        padding: '6px 12px',
        borderRadius: density.borderRadius - 2,
        boxShadow: shadows.md,
      },
      arrow: {
        color: mode === 'light' ? '#1e293b' : '#f1f5f9',
      },
    },
  },

  // Alert
  MuiAlert: {
    styleOverrides: {
      root: {
        borderRadius: density.borderRadius,
        alignItems: 'center',
      },
      standardSuccess: {
        backgroundColor: mode === 'light' 
          ? alpha(semanticColors.success.light, 0.15)
          : alpha(semanticColors.success.dark, 0.25),
        color: mode === 'light' ? semanticColors.success.dark : semanticColors.success.light,
        '& .MuiAlert-icon': {
          color: mode === 'light' ? semanticColors.success.main : semanticColors.success.light,
        },
      },
      standardError: {
        backgroundColor: mode === 'light'
          ? alpha(semanticColors.error.light, 0.15)
          : alpha(semanticColors.error.dark, 0.25),
        color: mode === 'light' ? semanticColors.error.dark : semanticColors.error.light,
        '& .MuiAlert-icon': {
          color: mode === 'light' ? semanticColors.error.main : semanticColors.error.light,
        },
      },
      standardWarning: {
        backgroundColor: mode === 'light'
          ? alpha(semanticColors.warning.light, 0.15)
          : alpha(semanticColors.warning.dark, 0.25),
        color: mode === 'light' ? semanticColors.warning.dark : semanticColors.warning.light,
        '& .MuiAlert-icon': {
          color: mode === 'light' ? semanticColors.warning.main : semanticColors.warning.light,
        },
      },
      standardInfo: {
        backgroundColor: mode === 'light'
          ? alpha(semanticColors.info.light, 0.15)
          : alpha(semanticColors.info.dark, 0.25),
        color: mode === 'light' ? semanticColors.info.dark : semanticColors.info.light,
        '& .MuiAlert-icon': {
          color: mode === 'light' ? semanticColors.info.main : semanticColors.info.light,
        },
      },
    },
  },

  // 테이블
  MuiTableCell: {
    styleOverrides: {
      root: {
        padding: density.tableCellPadding,
        borderBottom: `1px solid ${getDividerColor(mode)}`,
      },
      head: {
        fontWeight: 600,
        backgroundColor: mode === 'light' ? '#f8fafc' : '#27272a',
      },
    },
  },

  // 리스트
  MuiListItemButton: {
    styleOverrides: {
      root: {
        borderRadius: density.borderRadius,
        padding: `${density.listItemPadding}px ${density.listItemPadding + 8}px`,
        transition: transitions.fast,
        '&.Mui-selected': {
          backgroundColor: alpha(accentColor, 0.12),
          '&:hover': {
            backgroundColor: alpha(accentColor, 0.18),
          },
        },
      },
    },
  },

  // 앱바
  MuiAppBar: {
    styleOverrides: {
      root: {
        backgroundImage: 'none',
        boxShadow: mode === 'light' 
          ? '0 1px 3px 0 rgb(0 0 0 / 0.05)'
          : '0 1px 3px 0 rgb(0 0 0 / 0.2)',
      },
    },
  },

  // 드로어
  MuiDrawer: {
    styleOverrides: {
      paper: {
        borderRight: `1px solid ${getDividerColor(mode)}`,
        backgroundImage: 'none',
      },
    },
  },

  // DataGrid (MUI X)
  // @ts-expect-error MUI X DataGrid 컴포넌트
  MuiDataGrid: {
    styleOverrides: {
      root: {
        border: 'none',
        borderRadius: density.borderRadius + 4,
        '& .MuiDataGrid-columnHeaders': {
          backgroundColor: mode === 'light' ? '#f8fafc' : '#27272a',
          borderBottom: `1px solid ${getDividerColor(mode)}`,
        },
        '& .MuiDataGrid-cell': {
          borderBottom: `1px solid ${mode === 'light' ? '#f1f5f9' : '#3f3f46'}`,
        },
        '& .MuiDataGrid-row:hover': {
          backgroundColor: alpha(accentColor, mode === 'light' ? 0.04 : 0.08),
        },
        '& .MuiDataGrid-row.Mui-selected': {
          backgroundColor: alpha(accentColor, mode === 'light' ? 0.08 : 0.16),
          '&:hover': {
            backgroundColor: alpha(accentColor, mode === 'light' ? 0.12 : 0.20),
          },
        },
      },
    },
  },
});

// 메인 테마 생성 함수
export function createAppTheme(
  settings: AppearanceSettings,
  systemMode?: PaletteMode
): Theme {
  // 최종 모드 결정
  const mode: PaletteMode = settings.mode === 'auto'
    ? (systemMode ?? 'light')
    : settings.mode;

  // 토큰 가져오기
  const accent = accentPalettes[settings.accentColor];
  const typography = fontScales[settings.fontScale];
  const density = getDensityConfig(settings.density);
  const background = getBackgroundColors(mode);
  const text = getTextColors(mode);
  const divider = getDividerColor(mode);

  return createTheme({
    palette: {
      mode,
      primary: accent,
      secondary: {
        main: mode === 'light' ? '#64748b' : '#94a3b8',
        light: mode === 'light' ? '#94a3b8' : '#cbd5e1',
        dark: mode === 'light' ? '#475569' : '#64748b',
        contrastText: '#ffffff',
      },
      ...semanticColors,
      background,
      text,
      divider,
      action: {
        hover: alpha(accent.main, mode === 'light' ? 0.04 : 0.08),
        selected: alpha(accent.main, mode === 'light' ? 0.08 : 0.16),
        focus: alpha(accent.main, 0.12),
      },
    },
    typography,
    spacing: density.base,
    shape: {
      borderRadius: density.borderRadius,
    },
    components: createComponentOverrides(mode, accent.main, density),
  });
}

export default createAppTheme;
