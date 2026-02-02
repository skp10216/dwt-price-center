/**
 * 단가표 통합 관리 시스템 - 로그인 페이지
 * 도메인별 분기 처리:
 * - admin.dwt.price: admin 권한 필수, 프리미엄 다크 + 골드 UI
 * - dwt.price: 일반 사용자, 클린 그린 UI
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
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ShieldIcon from '@mui/icons-material/Shield';
import BarChartIcon from '@mui/icons-material/BarChart';
import { useSnackbar } from 'notistack';
import { authApi } from '@/lib/api';
import { useAuthStore, User, useDomainStore } from '@/lib/store';
import { getDomainType, getAfterLoginPath, requiresAdminRole, DomainType } from '@/lib/domain';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { domainType, isAdminDomain, setDomainType } = useDomainStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      const response = await authApi.login(email, password);
      const { token, user } = response.data.data;
      
      // 관리자 도메인에서 admin 권한 체크
      if (requiresAdminRole(domainType) && user.role !== 'admin') {
        setError('관리자 권한이 필요합니다. 관리자 계정으로 로그인해주세요.');
        setLoading(false);
        return;
      }
      
      setAuth(user as User, token.access_token);
      enqueueSnackbar('로그인 성공', { variant: 'success' });
      
      // 도메인별 리다이렉트 경로
      const redirectPath = searchParams.get('redirect') || getAfterLoginPath(domainType);
      router.push(redirectPath);
    } catch (err: any) {
      const message = err.response?.data?.error?.message || '로그인에 실패했습니다';
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
          bgcolor: '#0f0f14',
        }}
      >
        <CircularProgress sx={{ color: '#D4AF37' }} />
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
  loading: boolean;
  error: string | null;
  handleSubmit: (e: React.FormEvent) => void;
}

/**
 * 관리자 로그인 UI - 프리미엄 다크 + 골드 테마
 */
function AdminLoginUI({
  email, setEmail, password, setPassword,
  showPassword, setShowPassword, loading, error, handleSubmit
}: LoginUIProps) {
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
          radial-gradient(ellipse at 20% 0%, rgba(45, 45, 58, 0.9) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 100%, rgba(30, 30, 40, 0.8) 0%, transparent 50%),
          linear-gradient(180deg, #0f0f14 0%, #1a1a24 50%, #0d0d12 100%)
        `,
      }}
    >
      {/* 배경 장식 요소 */}
      <Box
        sx={{
          position: 'absolute',
          top: '10%',
          left: '5%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212, 175, 55, 0.08) 0%, transparent 70%)',
          filter: 'blur(60px)',
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
          background: 'radial-gradient(circle, rgba(212, 175, 55, 0.05) 0%, transparent 70%)',
          filter: 'blur(80px)',
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
        {/* 글래스모피즘 카드 */}
        <Box
          sx={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
            backdropFilter: 'blur(20px)',
            borderRadius: 4,
            border: '1px solid rgba(212, 175, 55, 0.15)',
            boxShadow: `
              0 25px 50px -12px rgba(0, 0, 0, 0.5),
              inset 0 1px 0 rgba(255, 255, 255, 0.05)
            `,
            p: 5,
          }}
        >
          {/* 로고/아이콘 영역 */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 72,
                height: 72,
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #D4AF37 0%, #B8860B 50%, #8B6914 100%)',
                boxShadow: '0 10px 30px rgba(212, 175, 55, 0.3)',
                mb: 3,
              }}
            >
              <ShieldIcon sx={{ fontSize: 36, color: '#0f0f14' }} />
            </Box>
            
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.02em',
                mb: 0.5,
              }}
            >
              Admin Console
            </Typography>
            
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(255, 255, 255, 0.5)',
                fontWeight: 500,
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
              background: 'rgba(212, 175, 55, 0.1)',
              border: '1px solid rgba(212, 175, 55, 0.2)',
            }}
          >
            <AdminPanelSettingsIcon sx={{ fontSize: 18, color: '#D4AF37' }} />
            <Typography
              variant="caption"
              sx={{
                color: '#D4AF37',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Administrator Access Only
            </Typography>
          </Box>
          
          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 3,
                bgcolor: 'rgba(211, 47, 47, 0.1)',
                border: '1px solid rgba(211, 47, 47, 0.3)',
                color: '#ff6b6b',
                '& .MuiAlert-icon': { color: '#ff6b6b' },
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
                    <EmailIcon sx={{ color: 'rgba(255, 255, 255, 0.3)' }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 2,
                  '& fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(212, 175, 55, 0.3)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#D4AF37',
                    borderWidth: 1,
                  },
                },
                '& .MuiOutlinedInput-input': {
                  color: '#ffffff',
                  py: 1.75,
                  '&::placeholder': {
                    color: 'rgba(255, 255, 255, 0.4)',
                    opacity: 1,
                  },
                },
              }}
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
                    <LockIcon sx={{ color: 'rgba(255, 255, 255, 0.3)' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      sx={{ color: 'rgba(255, 255, 255, 0.3)' }}
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 2,
                  '& fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(212, 175, 55, 0.3)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#D4AF37',
                    borderWidth: 1,
                  },
                },
                '& .MuiOutlinedInput-input': {
                  color: '#ffffff',
                  py: 1.75,
                  '&::placeholder': {
                    color: 'rgba(255, 255, 255, 0.4)',
                    opacity: 1,
                  },
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
                background: 'linear-gradient(135deg, #D4AF37 0%, #B8860B 100%)',
                color: '#0f0f14',
                fontWeight: 700,
                fontSize: '1rem',
                textTransform: 'none',
                boxShadow: '0 8px 24px rgba(212, 175, 55, 0.25)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #E5C158 0%, #C9971C 100%)',
                  boxShadow: '0 12px 32px rgba(212, 175, 55, 0.35)',
                },
                '&:disabled': {
                  background: 'rgba(212, 175, 55, 0.3)',
                  color: 'rgba(0, 0, 0, 0.5)',
                },
              }}
            >
              {loading ? (
                <CircularProgress size={24} sx={{ color: '#0f0f14' }} />
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
            color: 'rgba(255, 255, 255, 0.3)',
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
 */
function UserLoginUI({
  email, setEmail, password, setPassword,
  showPassword, setShowPassword, loading, error, handleSubmit
}: LoginUIProps) {
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
        background: `
          linear-gradient(135deg, #0d9488 0%, #059669 50%, #047857 100%)
        `,
      }}
    >
      {/* 배경 장식 */}
      <Box
        sx={{
          position: 'absolute',
          top: '-10%',
          right: '-5%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '-5%',
          left: '-5%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      
      {/* 로그인 카드 */}
      <Box
        sx={{
          width: '100%',
          maxWidth: 420,
          mx: 2,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            bgcolor: '#ffffff',
            borderRadius: 4,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            p: 5,
          }}
        >
          {/* 로고 영역 */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35)',
                mb: 3,
              }}
            >
              <BarChartIcon sx={{ fontSize: 32, color: '#fff' }} />
            </Box>
            
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                color: '#1f2937',
                mb: 0.5,
              }}
            >
              단가표 통합 관리
            </Typography>
            
            <Typography
              variant="body2"
              sx={{ color: '#6b7280' }}
            >
              시스템에 로그인하세요
            </Typography>
          </Box>
          
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
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
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  '&.Mui-focused fieldset': {
                    borderColor: '#10b981',
                  },
                },
                '& .MuiInputLabel-root.Mui-focused': {
                  color: '#10b981',
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
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  '&.Mui-focused fieldset': {
                    borderColor: '#10b981',
                  },
                },
                '& .MuiInputLabel-root.Mui-focused': {
                  color: '#10b981',
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
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                fontWeight: 600,
                fontSize: '1rem',
                textTransform: 'none',
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
                  boxShadow: '0 12px 28px rgba(16, 185, 129, 0.4)',
                },
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : '로그인'}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
