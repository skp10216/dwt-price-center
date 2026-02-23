/**
 * 단가표 통합 관리 시스템 - 로그인 페이지
 *
 * 도메인별 분기 처리:
 * - admin.dwt.price: 프리미엄 다크 + 틸/남색 UI (관리자 권한 필수)
 * - dwt.price: 클린 그린 UI (일반 사용자)
 *
 * SSOT: 모든 색상은 theme/tokens에서 가져옴
 * 로고 색상 기반 디자인:
 * - D: #2d4a6f (진한 남색)
 * - W: #0d9488 → #14b8a6 (틸 그라데이션)
 * - T: #6b7280 (회색)
 */

'use client';

import { useState, useEffect, useLayoutEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
import SecurityIcon from '@mui/icons-material/Security';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ShieldIcon from '@mui/icons-material/Shield';
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
import { userGreenTheme, shadows, transitions } from '@/theme/tokens';

// 로고 색상 기반 관리자 테마
const adminTheme = {
  // 로고 메인 색상
  navy: {
    main: '#2d4a6f',
    light: '#3d5f8a',
    dark: '#1e3550',
  },
  teal: {
    main: '#0d9488',
    light: '#14b8a6',
    dark: '#0f766e',
    gradient: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
  },
  // 배경 색상
  background: {
    primary: '#0a0f1a',
    secondary: '#111827',
    tertiary: '#1e293b',
    card: 'rgba(30, 41, 59, 0.8)',
  },
  // 텍스트 색상
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    muted: '#64748b',
  },
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
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
      // ⚠️ router.push는 클라이언트 사이드 내비게이션(소프트)이라
      //    쿠키가 미들웨어에 즉시 반영되지 않아 미인증 리다이렉트 발생 가능
      //    → window.location.href로 풀 페이지 리로드하여 쿠키 확실히 전달
      const redirectPath = searchParams.get('redirect') || getAfterLoginPath(domainType);
      window.location.href = redirectPath;
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
          bgcolor: adminTheme.background.primary,
        }}
      >
        <CircularProgress sx={{ color: adminTheme.teal.main }} />
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
    bgcolor: alpha('#ffffff', 0.04),
    borderRadius: 2.5,
    transition: transitions.fast,
    '& fieldset': {
      borderColor: alpha('#ffffff', 0.08),
      transition: transitions.fast,
    },
    '&:hover fieldset': {
      borderColor: alpha(adminTheme.teal.main, 0.5),
    },
    '&.Mui-focused fieldset': {
      borderColor: adminTheme.teal.main,
      borderWidth: 2,
    },
  },
  '& .MuiOutlinedInput-input': {
    color: adminTheme.text.primary,
    py: 1.75,
    fontSize: '0.95rem',
    '&::placeholder': {
      color: alpha('#ffffff', 0.4),
      opacity: 1,
    },
  },
});

/**
 * 관리자 로그인 UI - DWT 로고 색상 기반 프리미엄 테마
 * 남색/틸 그라데이션을 활용한 현대적이고 세련된 관리자 인터페이스
 */
function AdminLoginUI({
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  rememberMe,
  setRememberMe,
  loading,
  error,
  handleSubmit,
}: LoginUIProps) {
  const theme = useTheme();
  const { navy, teal, background: bg, text } = adminTheme;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        // 로고 색상 기반 다크 그라데이션 배경
        background: `
          linear-gradient(135deg, ${bg.primary} 0%, ${bg.secondary} 50%, ${alpha(navy.dark, 0.95)} 100%)
        `,
      }}
    >
      {/* 배경 메시 그라데이션 효과 */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 50% at 50% -20%, ${alpha(teal.main, 0.15)} 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 100% 100%, ${alpha(navy.main, 0.2)} 0%, transparent 50%),
            radial-gradient(ellipse 40% 60% at 0% 80%, ${alpha(teal.dark, 0.1)} 0%, transparent 50%)
          `,
        }}
      />

      {/* 플로팅 오브 - 틸 (좌상단) */}
      <Box
        sx={{
          position: 'absolute',
          top: '5%',
          left: '10%',
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(teal.main, 0.12)} 0%, transparent 70%)`,
          filter: 'blur(50px)',
          animation: 'floatOrb1 12s ease-in-out infinite',
          '@keyframes floatOrb1': {
            '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: 0.6 },
            '33%': { transform: 'translate(30px, 20px) scale(1.05)', opacity: 0.8 },
            '66%': { transform: 'translate(-20px, 40px) scale(0.95)', opacity: 0.7 },
          },
        }}
      />

      {/* 플로팅 오브 - 남색 (우하단) */}
      <Box
        sx={{
          position: 'absolute',
          bottom: '10%',
          right: '5%',
          width: 350,
          height: 350,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(navy.main, 0.15)} 0%, transparent 70%)`,
          filter: 'blur(60px)',
          animation: 'floatOrb2 15s ease-in-out infinite',
          '@keyframes floatOrb2': {
            '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: 0.5 },
            '50%': { transform: 'translate(-40px, -30px) scale(1.1)', opacity: 0.7 },
          },
        }}
      />

      {/* 작은 틸 오브 (우상단) */}
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          right: '15%',
          width: 150,
          height: 150,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(teal.light, 0.1)} 0%, transparent 70%)`,
          filter: 'blur(40px)',
          animation: 'floatOrb3 10s ease-in-out infinite',
          '@keyframes floatOrb3': {
            '0%, 100%': { transform: 'translate(0, 0)', opacity: 0.5 },
            '50%': { transform: 'translate(-15px, 25px)', opacity: 0.8 },
          },
        }}
      />

      {/* 그리드 패턴 오버레이 */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(${alpha('#ffffff', 0.02)} 1px, transparent 1px),
            linear-gradient(90deg, ${alpha('#ffffff', 0.02)} 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          opacity: 0.5,
        }}
      />

      {/* 로그인 카드 컨테이너 */}
      <Box
        sx={{
          width: '100%',
          maxWidth: 440,
          mx: 2,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* 메인 카드 */}
        <Box
          sx={{
            background: `linear-gradient(165deg, ${alpha(bg.tertiary, 0.9)} 0%, ${alpha(bg.secondary, 0.95)} 100%)`,
            backdropFilter: 'blur(20px)',
            borderRadius: 4,
            border: `1px solid ${alpha(teal.main, 0.15)}`,
            boxShadow: `
              0 0 0 1px ${alpha('#000', 0.1)},
              0 20px 50px -10px ${alpha('#000', 0.5)},
              0 0 100px -20px ${alpha(teal.main, 0.2)}
            `,
            p: { xs: 3.5, sm: 4.5 },
            position: 'relative',
            overflow: 'hidden',
            transition: transitions.normal,
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: teal.gradient,
              opacity: 0.8,
            },
            '&:hover': {
              border: `1px solid ${alpha(teal.main, 0.25)}`,
              boxShadow: `
                0 0 0 1px ${alpha('#000', 0.1)},
                0 25px 60px -10px ${alpha('#000', 0.6)},
                0 0 120px -20px ${alpha(teal.main, 0.3)}
              `,
            },
          }}
        >
          {/* 로고 영역 */}
          <Box sx={{ textAlign: 'center', mb: 3.5 }}>
            <Box
              sx={{
                display: 'inline-flex',
                p: 2,
                mb: 2,
                borderRadius: 3,
                background: alpha('#ffffff', 0.03),
                border: `1px solid ${alpha('#ffffff', 0.05)}`,
              }}
            >
              <Logo size="large" showCompanyName variant="dark" />
            </Box>

            <Typography
              variant="h6"
              sx={{
                color: text.primary,
                fontWeight: 600,
                fontSize: '1.1rem',
                letterSpacing: '-0.01em',
              }}
            >
              관리자 로그인
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: text.muted,
                mt: 0.5,
                fontSize: '0.85rem',
              }}
            >
              단가표 통합 관리 시스템
            </Typography>
          </Box>

          {/* 관리자 상태 배지 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              mb: 3.5,
              py: 1.25,
              px: 2.5,
              mx: 'auto',
              width: 'fit-content',
              borderRadius: 3,
              background: `linear-gradient(135deg, ${alpha(teal.main, 0.12)} 0%, ${alpha(navy.main, 0.08)} 100%)`,
              border: `1px solid ${alpha(teal.main, 0.2)}`,
            }}
          >
            <ShieldIcon
              sx={{
                fontSize: 18,
                color: teal.main,
              }}
            />
            <Typography
              sx={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: teal.light,
                letterSpacing: '0.03em',
              }}
            >
              ADMIN ACCESS
            </Typography>
          </Box>

          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 3,
                bgcolor: alpha(theme.palette.error.main, 0.1),
                border: `1px solid ${alpha(theme.palette.error.main, 0.25)}`,
                color: theme.palette.error.light,
                borderRadius: 2.5,
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
                    <EmailIcon sx={{ color: alpha('#ffffff', 0.35), fontSize: 20 }} />
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
                    <LockIcon sx={{ color: alpha('#ffffff', 0.35), fontSize: 20 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      sx={{
                        color: alpha('#ffffff', 0.35),
                        '&:hover': { color: teal.main },
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
                    color: alpha(teal.main, 0.5),
                    '&.Mui-checked': {
                      color: teal.main,
                    },
                  }}
                />
              }
              label="아이디 저장"
              sx={{
                mb: 3,
                '& .MuiFormControlLabel-label': {
                  color: text.secondary,
                  fontSize: '0.875rem',
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
                py: 1.6,
                borderRadius: 2.5,
                background: teal.gradient,
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.95rem',
                letterSpacing: '0.02em',
                boxShadow: `0 8px 30px ${alpha(teal.main, 0.35)}`,
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
                  background: `linear-gradient(90deg, transparent, ${alpha('#ffffff', 0.15)}, transparent)`,
                  transition: 'left 0.6s ease',
                },
                '&:hover': {
                  background: `linear-gradient(135deg, ${teal.light} 0%, ${teal.main} 100%)`,
                  boxShadow: `0 12px 40px ${alpha(teal.main, 0.45)}`,
                  transform: 'translateY(-2px)',
                  '&::before': {
                    left: '100%',
                  },
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
                '&:disabled': {
                  background: alpha(teal.main, 0.25),
                  color: alpha('#ffffff', 0.5),
                  boxShadow: 'none',
                },
              }}
            >
              {loading ? (
                <CircularProgress size={22} sx={{ color: '#ffffff' }} />
              ) : (
                '로그인'
              )}
            </Button>
          </Box>
        </Box>

        {/* 하단 보안 안내 */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            mt: 3,
          }}
        >
          <SecurityIcon
            sx={{
              fontSize: 14,
              color: alpha('#ffffff', 0.3),
            }}
          />
          <Typography
            variant="caption"
            sx={{
              color: alpha('#ffffff', 0.35),
              fontSize: '0.75rem',
            }}
          >
            권한이 없는 접근은 기록됩니다
          </Typography>
        </Box>

        {/* 저작권 */}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            textAlign: 'center',
            mt: 2,
            color: alpha('#ffffff', 0.25),
            fontSize: '0.7rem',
          }}
        >
          DWT Price Center © 2024
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
