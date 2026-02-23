/**
 * MUI Theme 생성 함수
 * SSOT: 모든 테마는 이 함수에서만 생성
 * 
 * 사용법:
 * const theme = createAppTheme(settings, systemMode);
 * 
 * 밀도 모드에 따라 모든 컴포넌트의 크기/여백이 자동 조절됨:
 * - compact: 정보 밀도 최대 (백오피스 기본)
 * - regular: 표준 (기본 모드)
 * - spacious: 편안한 모드 (접근성)
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
  density: ReturnType<typeof getDensityConfig>,
  typo: typeof fontScales['medium'],
): Theme['components'] => {
  // fontScale 연동: 타이포그래피 토큰에서 fontSize 추출
  const fs = {
    body2: String((typo.body2 as Record<string, unknown>)?.fontSize ?? '0.875rem'),
    caption: String((typo.caption as Record<string, unknown>)?.fontSize ?? '0.75rem'),
    overline: String((typo.overline as Record<string, unknown>)?.fontSize ?? '0.6875rem'),
  };

  return ({
  // 버튼
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: density.borderRadius,
        padding: `${density.buttonPadding.y}px ${density.buttonPadding.x}px`,
        fontWeight: 600,
        boxShadow: 'none',
        transition: transitions.fast,
        minHeight: density.inputHeight,
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
        padding: `${Math.max(density.buttonPadding.y - 2, 2)}px ${density.buttonPadding.x - 4}px`,
        minHeight: density.inputHeight - 4,
        fontSize: fs.body2,
      },
      sizeLarge: {
        padding: `${density.buttonPadding.y + 4}px ${density.buttonPadding.x + 8}px`,
        minHeight: density.inputHeight + 8,
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
        borderRadius: density.borderRadius + 2,
        boxShadow: mode === 'light' ? shadows.xs : shadows.darkSm,
        backgroundImage: 'none',
        border: `1px solid ${mode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
        transition: transitions.normal,
      },
    },
  },

  // 페이퍼
  MuiPaper: {
    styleOverrides: {
      root: {
        borderRadius: density.borderRadius + 2,
        backgroundImage: 'none',
      },
      elevation1: {
        boxShadow: mode === 'light' ? shadows.xs : shadows.darkSm,
      },
      elevation2: {
        boxShadow: mode === 'light' ? shadows.sm : shadows.darkMd,
      },
      elevation3: {
        boxShadow: mode === 'light' ? shadows.md : shadows.darkLg,
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
        height: 'auto',
      },
      inputSizeSmall: {
        padding: `${Math.max(density.inputPadding.y - 2, 4)}px ${density.inputPadding.x}px`,
      },
    },
  },

  // Select
  MuiSelect: {
    styleOverrides: {
      select: {
        minHeight: 'auto',
      },
    },
    defaultProps: {
      size: 'small',
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
        fontSize: fs.caption,
      },
      sizeSmall: {
        height: density.chipHeight - 2,
        fontSize: fs.overline,
      },
      filled: {
        '&.MuiChip-colorDefault': {
          backgroundColor: mode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)',
        },
      },
      icon: {
        fontSize: density.chipHeight - 8,
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
        '& svg': { fontSize: density.iconButtonSize - 12 },
      },
      sizeMedium: {
        padding: 6,
        '& svg': { fontSize: density.iconButtonSize - 8 },
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
        fontSize: fs.caption,
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
        padding: `${density.inputPadding.y}px ${density.inputPadding.x}px`,
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

  // 테이블 셀
  MuiTableCell: {
    styleOverrides: {
      root: {
        padding: `${density.tableCellPadding.y}px ${density.tableCellPadding.x}px`,
        borderBottom: `1px solid ${getDividerColor(mode)}`,
        fontSize: fs.body2,
        lineHeight: 1.4,
      },
      head: {
        fontWeight: 600,
        backgroundColor: mode === 'light' ? '#f8fafc' : '#27272a',
        fontSize: fs.caption,
        letterSpacing: '0.02em',
        color: mode === 'light' ? '#475569' : '#a1a1aa',
        whiteSpace: 'nowrap',
      },
      sizeSmall: {
        padding: `${Math.max(density.tableCellPadding.y - 2, 4)}px ${density.tableCellPadding.x}px`,
      },
    },
  },

  // 테이블 행
  MuiTableRow: {
    styleOverrides: {
      root: {
        height: density.tableRowHeight,
        '&:hover': {
          backgroundColor: alpha(accentColor, mode === 'light' ? 0.04 : 0.08),
        },
        '&.Mui-selected': {
          backgroundColor: alpha(accentColor, mode === 'light' ? 0.08 : 0.16),
          '&:hover': {
            backgroundColor: alpha(accentColor, mode === 'light' ? 0.12 : 0.20),
          },
        },
      },
      head: {
        height: density.tableHeaderHeight,
      },
    },
  },

  // 테이블 페이지네이션
  MuiTablePagination: {
    styleOverrides: {
      root: {
        borderTop: `1px solid ${getDividerColor(mode)}`,
      },
      toolbar: {
        minHeight: `${density.toolbarHeight}px !important`,
        paddingLeft: '8px',
        paddingRight: '8px',
      },
      selectLabel: {
        fontSize: fs.caption,
      },
      displayedRows: {
        fontSize: fs.caption,
      },
    },
  },

  // Tabs
  MuiTabs: {
    styleOverrides: {
      root: {
        minHeight: density.toolbarHeight,
      },
      indicator: {
        height: 2,
      },
    },
  },

  MuiTab: {
    styleOverrides: {
      root: {
        minHeight: density.toolbarHeight,
        padding: `${density.buttonPadding.y}px ${density.buttonPadding.x}px`,
        fontWeight: 500,
        fontSize: fs.body2,
        textTransform: 'none',
        '&.Mui-selected': {
          fontWeight: 600,
        },
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

  // 툴바 높이 compact 48px
  MuiToolbar: {
    styleOverrides: {
      root: {
        minHeight: '48px !important',
        '@media (min-width: 600px)': {
          minHeight: '48px !important',
        },
      },
      dense: {
        minHeight: '48px !important',
      },
    },
  },

  // ToggleButton
  MuiToggleButton: {
    styleOverrides: {
      root: {
        textTransform: 'none',
        fontWeight: 500,
        fontSize: fs.body2,
        borderRadius: density.borderRadius,
        padding: `${density.buttonPadding.y}px ${density.buttonPadding.x}px`,
      },
      sizeSmall: {
        padding: `${Math.max(density.buttonPadding.y - 2, 2)}px ${density.buttonPadding.x - 4}px`,
        fontSize: fs.caption,
      },
    },
  },

  // ToggleButtonGroup
  MuiToggleButtonGroup: {
    styleOverrides: {
      root: {
        gap: 0,
      },
      grouped: {
        '&:not(:first-of-type)': {
          borderRadius: density.borderRadius,
          marginLeft: -1,
        },
        '&:first-of-type': {
          borderRadius: density.borderRadius,
        },
      },
    },
  },

  // Divider
  MuiDivider: {
    styleOverrides: {
      root: {
        borderColor: getDividerColor(mode),
      },
    },
  },

  // DataGrid (MUI X)
  // @ts-expect-error MUI X DataGrid 컴포넌트
  MuiDataGrid: {
    styleOverrides: {
      root: {
        border: 'none',
        borderRadius: density.borderRadius + 2,
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
});};

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
    components: createComponentOverrides(mode, accent.main, density, typography),
  });
}

export default createAppTheme;
