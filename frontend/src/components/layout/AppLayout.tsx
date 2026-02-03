/**
 * 단가표 통합 관리 시스템 - App Layout
 * 사이드바/상단바/컨텐츠 레이아웃
 * 도메인 기반 메뉴 분리:
 * - admin.dwt.price: 관리자 전용 메뉴
 * - dwt.price: 사용자 전용 메뉴
 */

'use client';

import { useState, useEffect, Fragment } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Collapse,
  Chip,
  alpha,
} from '@mui/material';
import {
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  PriceCheck as PriceCheckIcon,
  Compare as CompareIcon,
  Star as StarIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Upload as UploadIcon,
  Business as BusinessIcon,
  Grade as GradeIcon,
  RemoveCircle as RemoveCircleIcon,
  History as HistoryIcon,
  People as PeopleIcon,
  ExpandLess,
  ExpandMore,
  Logout as LogoutIcon,
  AdminPanelSettings as AdminIcon,
  Smartphone as SmartphoneIcon,
  Tablet as TabletIcon,
  Watch as WatchIcon,
  Apple as AppleIcon,
  PhoneAndroid as SamsungIcon,
  Dashboard as DashboardIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  SettingsBrightness as AutoModeIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useAuthStore, useUIStore, useDomainStore, useAuthHydrated, useThemeStore, type ThemeMode } from '@/lib/store';
import { getDomainType, getDefaultPath } from '@/lib/domain';
import { Logo } from '@/components/ui/Logo';

const DRAWER_WIDTH = 280;

// 메뉴 아이템 타입
interface MenuItemType {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: MenuItemType[];
}

// 사용자 도메인 메뉴 (dwt.price)
const userMenus: MenuItemType[] = [
  { id: 'prices', label: '본사 판매 단가', icon: <PriceCheckIcon />, path: '/prices' },
  { id: 'compare', label: '업체별 단가 비교', icon: <CompareIcon />, path: '/compare' },
  { id: 'my-lists', label: '내 리스트', icon: <StarIcon />, path: '/my-lists' },
  { id: 'search', label: '모델 검색', icon: <SearchIcon />, path: '/search' },
];

// 관리자 도메인 메뉴 (admin.dwt.price) - 서브메뉴 구조
const adminMenus: MenuItemType[] = [
  {
    id: 'ssot-models',
    label: 'SSOT 모델 관리',
    icon: <SettingsIcon />,
    path: '/admin/models',
    children: [
      { id: 'models-dashboard', label: '대시보드', icon: <DashboardIcon />, path: '/admin/models' },
      {
        id: 'models-smartphone',
        label: '스마트폰',
        icon: <SmartphoneIcon />,
        children: [
          { id: 'smartphone-apple', label: 'Apple', icon: <AppleIcon />, path: '/admin/models/smartphone/apple' },
          { id: 'smartphone-samsung', label: 'Samsung', icon: <SamsungIcon />, path: '/admin/models/smartphone/samsung' },
        ],
      },
      {
        id: 'models-tablet',
        label: '태블릿',
        icon: <TabletIcon />,
        children: [
          { id: 'tablet-apple', label: 'Apple', icon: <AppleIcon />, path: '/admin/models/tablet/apple' },
          { id: 'tablet-samsung', label: 'Samsung', icon: <SamsungIcon />, path: '/admin/models/tablet/samsung' },
        ],
      },
      {
        id: 'models-wearable',
        label: '웨어러블',
        icon: <WatchIcon />,
        children: [
          { id: 'wearable-apple', label: 'Apple', icon: <AppleIcon />, path: '/admin/models/wearable/apple' },
          { id: 'wearable-samsung', label: 'Samsung', icon: <SamsungIcon />, path: '/admin/models/wearable/samsung' },
        ],
      },
    ],
  },
  { id: 'hq-upload', label: '본사 단가표 업로드', icon: <UploadIcon />, path: '/admin/hq-upload' },
  { id: 'partners', label: '거래처 관리', icon: <BusinessIcon />, path: '/admin/partners' },
  { id: 'partner-upload', label: '거래처 단가표 업로드', icon: <UploadIcon />, path: '/admin/partner-upload' },
  { id: 'grades', label: '등급 관리', icon: <GradeIcon />, path: '/admin/grades' },
  { id: 'deductions', label: '차감 관리', icon: <RemoveCircleIcon />, path: '/admin/deductions' },
  { id: 'audit', label: '감사로그', icon: <HistoryIcon />, path: '/admin/audit' },
  { id: 'users', label: '사용자 관리', icon: <PeopleIcon />, path: '/admin/users' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, isAuthenticated } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { domainType, isAdminDomain, setDomainType } = useDomainStore();
  const { mode, setMode } = useThemeStore();
  const isHydrated = useAuthHydrated();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['ssot-models']));

  // 테마 전환 핸들러
  const handleThemeToggle = () => {
    const nextMode: ThemeMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light';
    setMode(nextMode);
  };

  // 테마 아이콘
  const getThemeIcon = () => {
    switch (mode) {
      case 'light':
        return <LightModeIcon />;
      case 'dark':
        return <DarkModeIcon />;
      case 'auto':
        return <AutoModeIcon />;
    }
  };
  
  // 클라이언트에서 도메인 타입 감지
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.host;
      const urlSearchParams = new URLSearchParams(window.location.search);
      const detected = getDomainType(host, urlSearchParams);
      setDomainType(detected);
    }
  }, [setDomainType]);
  
  // 현재 경로에 맞는 메뉴 자동 확장
  useEffect(() => {
    if (pathname.startsWith('/admin/models')) {
      const newExpanded = new Set(expandedMenus);
      newExpanded.add('ssot-models');
      
      if (pathname.includes('/smartphone')) {
        newExpanded.add('models-smartphone');
      }
      if (pathname.includes('/tablet')) {
        newExpanded.add('models-tablet');
      }
      if (pathname.includes('/wearable')) {
        newExpanded.add('models-wearable');
      }
      
      setExpandedMenus(newExpanded);
    }
  }, [pathname]);
  
  // 인증 체크 (hydration 완료 후에만)
  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.push('/login');
    }
  }, [isHydrated, isAuthenticated, router]);
  
  // 관리자 도메인에서 admin 권한 강제 (hydration 완료 후에만)
  useEffect(() => {
    if (isHydrated && isAdminDomain && user?.role !== 'admin') {
      logout();
      router.push('/login?error=admin_required');
    }
  }, [isHydrated, isAdminDomain, user, logout, router]);
  
  // Hydration 완료 전에는 로딩 표시 (깜빡임 방지)
  if (!isHydrated) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            로딩 중...
          </Typography>
        </Box>
      </Box>
    );
  }
  
  if (!isAuthenticated) {
    return null;
  }
  
  const isAdmin = user?.role === 'admin';
  const currentMenus = isAdminDomain ? adminMenus : userMenus;
  
  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  
  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };
  
  const handleLogout = () => {
    logout();
    router.push('/login');
  };
  
  const handleNavigate = (path: string) => {
    router.push(path);
  };
  
  const handleToggleExpand = (menuId: string) => {
    setExpandedMenus((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(menuId)) {
        newSet.delete(menuId);
      } else {
        newSet.add(menuId);
      }
      return newSet;
    });
  };
  
  // 메뉴가 현재 경로와 매칭되는지 확인
  const isMenuActive = (menu: MenuItemType): boolean => {
    if (menu.path && pathname === menu.path) return true;
    if (menu.children) {
      return menu.children.some(child => isMenuActive(child));
    }
    return false;
  };
  
  // 재귀적 메뉴 렌더링
  const renderMenuItem = (menu: MenuItemType, level: number = 0) => {
    const hasChildren = menu.children && menu.children.length > 0;
    const isExpanded = expandedMenus.has(menu.id);
    const isActive = menu.path ? pathname === menu.path : isMenuActive(menu);
    
    return (
      <Fragment key={menu.id}>
        <ListItem disablePadding>
          <ListItemButton
            selected={!hasChildren && isActive}
            onClick={() => {
              if (hasChildren) {
                handleToggleExpand(menu.id);
              } else if (menu.path) {
                handleNavigate(menu.path);
              }
            }}
            sx={{
              mx: 1,
              borderRadius: 2,
              pl: 2 + level * 2,
              '&.Mui-selected': {
                bgcolor: isAdminDomain ? 'error.light' : 'primary.light',
                color: 'white',
                '&:hover': {
                  bgcolor: isAdminDomain ? 'error.main' : 'primary.main',
                },
                '& .MuiListItemIcon-root': {
                  color: 'white',
                },
              },
              ...(hasChildren && isActive && {
                bgcolor: (theme) => theme.palette.mode === 'light' ? 'grey.100' : 'grey.800',
                '& .MuiListItemText-primary': {
                  fontWeight: 600,
                },
              }),
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{menu.icon}</ListItemIcon>
            <ListItemText 
              primary={menu.label} 
              primaryTypographyProps={{ 
                fontSize: level > 0 ? '0.875rem' : '0.9rem',
                fontWeight: isActive ? 600 : 400,
              }}
            />
            {hasChildren && (isExpanded ? <ExpandLess /> : <ExpandMore />)}
          </ListItemButton>
        </ListItem>
        
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {menu.children!.map((child) => renderMenuItem(child, level + 1))}
            </List>
          </Collapse>
        )}
      </Fragment>
    );
  };
  
  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: (theme) => theme.palette.mode === 'light'
            ? '0 1px 3px rgba(0,0,0,0.1)'
            : '0 1px 3px rgba(0,0,0,0.3)',
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            onClick={toggleSidebar}
            sx={{ mr: 2 }}
          >
            {sidebarOpen ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>
          
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Logo size="small" variant="auto" />
            {isAdminDomain && (
              <Chip
                icon={<AdminIcon sx={{ fontSize: 16 }} />}
                label="관리자"
                size="small"
                color="error"
                sx={{ fontWeight: 600 }}
              />
            )}
          </Box>

          <IconButton
            onClick={handleThemeToggle}
            sx={{ mr: 1 }}
            title={`현재: ${mode === 'light' ? '라이트' : mode === 'dark' ? '다크' : '자동'} 모드 (클릭하여 변경)`}
          >
            {getThemeIcon()}
          </IconButton>

          <IconButton onClick={handleUserMenuOpen}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main' }}>
              {user?.name?.[0] || 'U'}
            </Avatar>
          </IconButton>
          
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleUserMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem disabled>
              <Typography variant="body2">
                {user?.email}
              </Typography>
            </MenuItem>
            <MenuItem disabled>
              <Typography variant="caption" color="text.secondary">
                {user?.role === 'admin' ? '관리자' : '조회자'}
              </Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              로그아웃
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      
      {/* Sidebar */}
      <Drawer
        variant="persistent"
        open={sidebarOpen}
        sx={{
          width: sidebarOpen ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: (theme) => `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', py: 2 }}>
          {/* 도메인별 메뉴 렌더링 */}
          <List>
            {currentMenus.map((menu) => renderMenuItem(menu))}
          </List>
          
          {/* 도메인 전환 링크 (관리자만, 사용자 도메인에서만) */}
          {!isAdminDomain && isAdmin && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ px: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                  관리자 기능
                </Typography>
              </Box>
              <List>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => {
                      const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.dwt.price';
                      window.location.href = adminUrl;
                    }}
                    sx={{
                      mx: 1,
                      borderRadius: 2,
                      bgcolor: (theme) => theme.palette.mode === 'light' ? 'error.50' : alpha('#d32f2f', 0.1),
                      '&:hover': {
                        bgcolor: (theme) => theme.palette.mode === 'light' ? 'error.100' : alpha('#d32f2f', 0.2),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <AdminIcon color="error" />
                    </ListItemIcon>
                    <ListItemText 
                      primary="관리자 페이지 이동"
                      primaryTypographyProps={{ color: 'error.main', fontWeight: 600 }}
                    />
                  </ListItemButton>
                </ListItem>
              </List>
            </>
          )}
          
          {/* 사용자 도메인 이동 링크 (관리자 도메인에서만) */}
          {isAdminDomain && (
            <>
              <Divider sx={{ my: 2 }} />
              <List>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => {
                      const userUrl = process.env.NEXT_PUBLIC_USER_URL || 'https://dwt.price';
                      window.location.href = userUrl;
                    }}
                    sx={{
                      mx: 1,
                      borderRadius: 2,
                      bgcolor: (theme) => theme.palette.mode === 'light' ? 'primary.50' : alpha('#1976d2', 0.1),
                      '&:hover': {
                        bgcolor: (theme) => theme.palette.mode === 'light' ? 'primary.100' : alpha('#1976d2', 0.2),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <PriceCheckIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText 
                      primary="사용자 페이지 이동"
                      primaryTypographyProps={{ color: 'primary.main', fontWeight: 600 }}
                    />
                  </ListItemButton>
                </ListItem>
              </List>
            </>
          )}
        </Box>
      </Drawer>
      
      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          width: `calc(100% - ${sidebarOpen ? DRAWER_WIDTH : 0}px)`,
          transition: 'width 0.3s',
          bgcolor: 'background.default',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <Toolbar /> {/* AppBar 높이만큼 공간 확보 */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 3,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
