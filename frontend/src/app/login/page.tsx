/**
 * 단가표 통합 관리 시스템 - 로그인 페이지
 * 
 * 도메인별 분기 처리:
 * - admin.dwt.price: 프리미엄 다크 + 골드 UI (관리자 권한 필수)
 * - dwt.price: 클린 그린 UI (일반 사용자)
 * 
 * SSOT: 모든 색상은 theme/tokens에서 가져옴
 */

'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  FormControlLabel,
  Checkbox,
  alpha,
  useTheme,
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useSnackbar } from 'notistack';
import { Logo } from '@/components/ui/Logo';
import { authApi } from '@/lib/api';
import { 
  useAuthStore, 
  User, 
  useDomainStore,
  getSavedEmail,
  getRememberMe,
  saveEmailPreference,
} from '@/lib/store';
import { getDomainType, getAfterLoginPath, requiresAdminRole } from '@/lib/domain';
import { adminGoldTheme, userGreenTheme, shadows, transitions } from '@/theme/tokens';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { domainType, isAdminDomain, setDomainType } = useDomainStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domainDetected, setDomainDetected] = useState(false);
  
  // 클라이언트에서 도메인 타입 감지 (useLayoutEffect로 깜빡임 방지)
  useLayoutEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.host;
      const urlSearchParams = new URLSearchParams(window.location.search);
      const detected = getDomainType(host, urlSearchParams);
      setDomainType(detected);
      setDomainDetected(true);
      
      // 저장된 이메일 및 아이디 저장 상태 복원
      const savedEmail = getSavedEmail();
      const savedRememberMe = getRememberMe();
      if (savedEmail) {
        setEmail(savedEmail);
      }
      setRememberMe(savedRememberMe);
    }
  }, [setDomainType]);
  
  // URL 파라미터에서 에러 메시지 처리
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'admin_required') {
      setError('관리자 도메인입니다. 관리자 계정으로 로그인해주세요.');
    }
  }, [searchParams]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      const response = await authApi.login(email, password, rememberMe);
      const { token, user } = response.data.data;
      
      // 관리자 도메인에서 admin 권한 체크
      if (requiresAdminRole(domainType) && (user as User).role !== 'admin') {
        setError('관리자 권한이 필요합니다. 관리자 계정으로 로그인해주세요.');
        setLoading(false);
        return;
      }
      
      // 아이디 저장 설정 저장
      saveEmailPreference(email, rememberMe);
      
      // 인증 상태 설정 (토큰 만료 시간 포함)
      setAuth(user as User, token.access_token, token.expires_in);
      enqueueSnackbar('로그인 성공', { variant: 'success' });
      
      // 도메인별 리다이렉트 경로
      const redirectPath = searchParams.get('redirect') || getAfterLoginPath(domainType);
      router.push(redirectPath);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: { message?: string } } } };
      const message = axiosError.response?.data?.error?.message || '로그인에 실패했습니다';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // 도메인 감지 전 로딩 화면 (깜빡임 방지)
  if (!domainDetected) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: adminGoldTheme.background.primary,
        }}
      >
        <CircularProgress sx={{ color: adminGoldTheme.gold.main }} />
      </Box>
    );
  }

  // 관리자 도메인: 프리미엄 다크 + 골드 테마
  if (isAdminDomain) {
    return <AdminLoginUI 
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      showPassword={showPassword}
      setShowPassword={setShowPassword}
      rememberMe={rememberMe}
      setRememberMe={setRememberMe}
      loading={loading}
      error={error}
      handleSubmit={handleSubmit}
    />;
  }

  // 사용자 도메인: 클린 그린 테마
  return <UserLoginUI
    email={email}
    setEmail={setEmail}
    password={password}
    setPassword={setPassword}
    showPassword={showPassword}
    setShowPassword={setShowPassword}
    rememberMe={rememberMe}
    setRememberMe={setRememberMe}
    loading={loading}
    error={error}
    handleSubmit={handleSubmit}
  />;
}

// 공통 Props 타입
interface LoginUIProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  rememberMe: boolean;
  setRememberMe: (v: boolean) => void;
  loading: boolean;
  error: string | null;
  handleSubmit: (e: React.FormEvent) => void;
}

// 공통 입력 필드 스타일 생성 함수
const createAdminInputStyles = () => ({
  mb: 2.5,
  '& .MuiOutlinedInput-root': {
    bgcolor: alpha('#ffffff', 0.03),
    borderRadius: 2,
    transition: transitions.fast,
    '& fieldset': {
      borderColor: alpha('#ffffff', 0.1),
      transition: transitions.fast,
    },
    '&:hover fieldset': {
      borderColor: alpha(adminGoldTheme.gold.main, 0.4),
    },
    '&.Mui-focused fieldset': {
      borderColor: adminGoldTheme.gold.main,
      borderWidth: 2,
    },
  },
  '& .MuiOutlinedInput-input': {
    color: adminGoldTheme.text.primary,
    py: 1.75,
    '&::placeholder': {
      color: alpha('#ffffff', 0.4),
      opacity: 1,
    },
  },
});

/**
 * 관리자 로그인 UI - 프리미엄 다크 + 골드 테마
 * 고급스럽고 권위있는 느낌의 관리자 전용 인터페이스
 */
function AdminLoginUI({
  email, setEmail, password, setPassword,
  showPassword, setShowPassword, rememberMe, setRememberMe,
  loading, error, handleSubmit
}: LoginUIProps) {
  const theme = useTheme();
  const gold = adminGoldTheme.gold;
  const bg = adminGoldTheme.background;
  const text = adminGoldTheme.text;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        // 프리미엄 다크 그라데이션 배경
        background: `
          radial-gradient(ellipse at 20% 0%, ${alpha(bg.secondary, 0.9)} 0%, transparent 50%),
          radial-gradient(ellipse at 80% 100%, ${alpha(bg.tertiary, 0.8)} 0%, transparent 50%),
          linear-gradient(180deg, ${bg.primary} 0%, ${bg.secondary} 50%, ${bg.tertiary} 100%)
        `,
      }}
    >
      {/* 배경 장식 요소 - 골드 글로우 */}
      <Box
        sx={{
          position: 'absolute',
          top: '10%',
          left: '5%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(gold.main, 0.08)} 0%, transparent 70%)`,
          filter: 'blur(60px)',
          animation: 'pulse 8s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 0.5, transform: 'scale(1)' },
            '50%': { opacity: 0.8, transform: 'scale(1.1)' },
          },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '15%',
          right: '10%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(gold.main, 0.05)} 0%, transparent 70%)`,
          filter: 'blur(80px)',
          animation: 'pulse 10s ease-in-out infinite reverse',
        }}
      />
      
      {/* 로그인 카드 */}
      <Box
        sx={{
          width: '100%',
          maxWidth: 460,
          mx: 2,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* 글래스모피즘 카드 */}
        <Box
          sx={{
            background: `linear-gradient(145deg, ${alpha('#ffffff', 0.06)} 0%, ${alpha('#ffffff', 0.02)} 100%)`,
            backdropFilter: 'blur(24px)',
            borderRadius: 4,
            border: `1px solid ${alpha(gold.main, 0.15)}`,
            boxShadow: `
              0 32px 64px -12px ${alpha('#000000', 0.5)},
              inset 0 1px 0 ${alpha('#ffffff', 0.05)}
            `,
            p: { xs: 4, sm: 5 },
            transition: transitions.normal,
            '&:hover': {
              border: `1px solid ${alpha(gold.main, 0.25)}`,
              boxShadow: `
                0 32px 64px -12px ${alpha('#000000', 0.6)},
                inset 0 1px 0 ${alpha('#ffffff', 0.08)},
                0 0 0 1px ${alpha(gold.main, 0.1)}
              `,
            },
          }}
        >
          {/* 로고/아이콘 영역 */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            {/* DWT 로고 */}
            <Box sx={{ mb: 2 }}>
              <Logo size="large" showCompanyName variant="dark" />
            </Box>
            
            <Typography
              variant="body2"
              sx={{
                color: alpha('#ffffff', 0.5),
                fontWeight: 500,
                mt: 1,
              }}
            >
              단가표 통합 관리 시스템
            </Typography>
          </Box>

          {/* 관리자 배지 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              mb: 4,
              py: 1.5,
              px: 3,
              mx: 'auto',
              width: 'fit-content',
              borderRadius: 2,
              background: alpha(gold.main, 0.1),
              border: `1px solid ${alpha(gold.main, 0.2)}`,
              backdropFilter: 'blur(8px)',
            }}
          >
            
          </Box>
          
          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 3,
                bgcolor: alpha(theme.palette.error.main, 0.1),
                border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
                color: theme.palette.error.light,
                borderRadius: 2,
                '& .MuiAlert-icon': { color: theme.palette.error.light },
              }}
            >
              {error}
            </Alert>
          )}
          
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              placeholder="관리자 이메일"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon sx={{ color: alpha('#ffffff', 0.35) }} />
                  </InputAdornment>
                ),
              }}
              sx={createAdminInputStyles()}
            />
            
            <TextField
              fullWidth
              placeholder="비밀번호"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon sx={{ color: alpha('#ffffff', 0.35) }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      sx={{ 
                        color: alpha('#ffffff', 0.35),
                        '&:hover': { color: gold.main },
                      }}
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={createAdminInputStyles()}
            />
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  sx={{
                    color: alpha(gold.main, 0.5),
                    '&.Mui-checked': {
                      color: gold.main,
                    },
                  }}
                />
              }
              label="아이디 저장"
              sx={{
                mb: 3,
                '& .MuiFormControlLabel-label': {
                  color: alpha('#ffffff', 0.7),
                  fontSize: theme.typography.body2.fontSize,
                },
              }}
            />
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                py: 1.75,
                borderRadius: 2,
                background: `linear-gradient(135deg, ${gold.main} 0%, ${gold.dark} 100%)`,
                color: bg.primary,
                fontWeight: 700,
                fontSize: theme.typography.button.fontSize,
                boxShadow: `0 8px 24px ${alpha(gold.main, 0.3)}`,
                transition: transitions.fast,
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: '-100%',
                  width: '100%',
                  height: '100%',
                  background: `linear-gradient(90deg, transparent, ${alpha('#ffffff', 0.2)}, transparent)`,
                  transition: transitions.slow,
                },
                '&:hover': {
                  background: `linear-gradient(135deg, ${gold.light} 0%, ${gold.main} 100%)`,
                  boxShadow: `0 12px 32px ${alpha(gold.main, 0.4)}`,
                  transform: 'translateY(-2px)',
                  '&::before': {
                    left: '100%',
                  },
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
                '&:disabled': {
                  background: alpha(gold.main, 0.3),
                  color: alpha('#000000', 0.5),
                  boxShadow: 'none',
                },
              }}
            >
              {loading ? (
                <CircularProgress size={24} sx={{ color: bg.primary }} />
              ) : (
                '관리자 로그인'
              )}
            </Button>
          </Box>
        </Box>
        
        {/* 하단 안내 */}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            textAlign: 'center',
            mt: 3,
            color: alpha('#ffffff', 0.35),
          }}
        >
          권한이 없는 접근은 기록됩니다
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * 사용자 로그인 UI - 클린 그린 테마
 * 친근하고 전문적인 일반 사용자 인터페이스
 */
function UserLoginUI({
  email, setEmail, password, setPassword,
  showPassword, setShowPassword, rememberMe, setRememberMe,
  loading, error, handleSubmit
}: LoginUIProps) {
  const theme = useTheme();
  const green = userGreenTheme.green;
  const bg = userGreenTheme.background;
  const text = userGreenTheme.text;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        // 자연스러운 그린 그라데이션
        background: bg.gradient,
      }}
    >
      {/* 배경 장식 */}
      <Box
        sx={{
          position: 'absolute',
          top: '-10%',
          right: '-5%',
          width: 450,
          height: 450,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha('#ffffff', 0.12)} 0%, transparent 70%)`,
          filter: 'blur(40px)',
          animation: 'float 12s ease-in-out infinite',
          '@keyframes float': {
            '0%, 100%': { transform: 'translate(0, 0)' },
            '50%': { transform: 'translate(-20px, 20px)' },
          },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '-5%',
          left: '-5%',
          width: 350,
          height: 350,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(green.main, 0.3)} 0%, transparent 70%)`,
          filter: 'blur(60px)',
          animation: 'float 15s ease-in-out infinite reverse',
        }}
      />
      
      {/* 로그인 카드 */}
      <Box
        sx={{
          width: '100%',
          maxWidth: 440,
          mx: 2,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            bgcolor: bg.paper,
            borderRadius: 4,
            boxShadow: shadows.xl,
            p: { xs: 4, sm: 5 },
            transition: transitions.normal,
            '&:hover': {
              boxShadow: shadows['2xl'],
              transform: 'translateY(-4px)',
            },
          }}
        >
          {/* 로고 영역 */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            {/* DWT 로고 */}
            <Box sx={{ mb: 2 }}>
              <Logo size="large" showCompanyName variant="light" />
            </Box>
            
            <Typography
              variant="body2"
              sx={{ color: text.secondary, mt: 1 }}
            >
              시스템에 로그인하세요
            </Typography>
          </Box>
          
          {error && (
            <Alert 
              severity="error" 
              sx={{ 
                mb: 3,
                borderRadius: 2,
              }}
            >
              {error}
            </Alert>
          )}
          
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="이메일"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              sx={{
                mb: 2.5,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  transition: transitions.fast,
                  '&.Mui-focused fieldset': {
                    borderColor: green.main,
                    borderWidth: 2,
                  },
                },
                '& .MuiInputLabel-root.Mui-focused': {
                  color: green.main,
                },
              }}
            />
            
            <TextField
              fullWidth
              label="비밀번호"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      sx={{
                        '&:hover': { color: green.main },
                      }}
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 2.5,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  transition: transitions.fast,
                  '&.Mui-focused fieldset': {
                    borderColor: green.main,
                    borderWidth: 2,
                  },
                },
                '& .MuiInputLabel-root.Mui-focused': {
                  color: green.main,
                },
              }}
            />
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  sx={{
                    color: green.main,
                    '&.Mui-checked': {
                      color: green.main,
                    },
                  }}
                />
              }
              label="아이디 저장"
              sx={{
                mb: 3,
                '& .MuiFormControlLabel-label': {
                  color: text.secondary,
                  fontSize: theme.typography.body2.fontSize,
                },
              }}
            />
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                py: 1.5,
                borderRadius: 2,
                background: `linear-gradient(135deg, ${green.main} 0%, ${green.dark} 100%)`,
                fontWeight: 600,
                boxShadow: `0 8px 24px ${alpha(green.main, 0.35)}`,
                transition: transitions.fast,
                '&:hover': {
                  background: `linear-gradient(135deg, ${green.light} 0%, ${green.main} 100%)`,
                  boxShadow: `0 12px 28px ${alpha(green.main, 0.45)}`,
                  transform: 'translateY(-2px)',
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : '로그인'}
            </Button>
          </Box>
        </Box>
        
        {/* 하단 안내 */}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            textAlign: 'center',
            mt: 3,
            color: alpha('#ffffff', 0.7),
          }}
        >
          DWT Price Center © 2024
        </Typography>
      </Box>
    </Box>
  );
}
