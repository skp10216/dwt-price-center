/**
 * 단가표 통합 관리 시스템 - MUI Theme 설정
 * 모든 UI 요소는 이 Theme 토큰을 사용해야 함
 */

'use client';

import { createTheme, alpha } from '@mui/material/styles';

// 색상 팔레트 정의
const colors = {
  // Primary: 핵심 CTA (등록/저장/확정/적용)
  primary: {
    main: '#1976d2',
    light: '#42a5f5',
    dark: '#1565c0',
    contrastText: '#ffffff',
  },
  // Secondary: 보조 동작
  secondary: {
    main: '#9c27b0',
    light: '#ba68c8',
    dark: '#7b1fa2',
    contrastText: '#ffffff',
  },
  // Success: 완료/성공 상태
  success: {
    main: '#2e7d32',
    light: '#4caf50',
    dark: '#1b5e20',
    contrastText: '#ffffff',
  },
  // Error: 실패/삭제 위험 동작
  error: {
    main: '#d32f2f',
    light: '#ef5350',
    dark: '#c62828',
    contrastText: '#ffffff',
  },
  // Warning: 주의/저신뢰/미매핑
  warning: {
    main: '#ed6c02',
    light: '#ff9800',
    dark: '#e65100',
    contrastText: '#ffffff',
  },
  // Info
  info: {
    main: '#0288d1',
    light: '#03a9f4',
    dark: '#01579b',
    contrastText: '#ffffff',
  },
};

// Theme 생성
const theme = createTheme({
  palette: {
    mode: 'light',
    ...colors,
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    text: {
      primary: '#212121',
      secondary: '#757575',
    },
  },
  
  // Typography 설정 (폰트 1개로 통일)
  typography: {
    fontFamily: '"Pretendard", "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 700,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
    },
    body1: {
      fontSize: '1rem',
    },
    body2: {
      fontSize: '0.875rem',
    },
    caption: {
      fontSize: '0.75rem',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  
  // Shape 설정
  shape: {
    borderRadius: 8,
  },
  
  // Component 기본 스타일 오버라이드
  components: {
    // Button 스타일
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 16px',
          fontWeight: 600,
        },
        containedPrimary: {
          '&:hover': {
            backgroundColor: colors.primary.dark,
          },
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    
    // Card 스타일
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    
    // Paper 스타일
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    
    // TextField 스타일
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
    
    // DataGrid 스타일 (MUI X 컴포넌트 - 타입 단언 필요)
    // @ts-ignore - MUI X DataGrid 컴포넌트
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 'none',
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: '#f5f5f5',
            borderBottom: '1px solid #e0e0e0',
          },
          '& .MuiDataGrid-cell': {
            borderBottom: '1px solid #f0f0f0',
          },
          '& .MuiDataGrid-row:hover': {
            backgroundColor: alpha(colors.primary.main, 0.04),
          },
        },
      },
    },
    
    // Chip 스타일
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    
    // Dialog 스타일
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
        },
      },
    },
    
    // Tooltip 스타일
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#424242',
          fontSize: '0.75rem',
        },
      },
    },
  },
});

export default theme;
