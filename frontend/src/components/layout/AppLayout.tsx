/**
 * 단가표 통합 관리 시스템 - App Layout
 * 사이드바/상단바/컨텐츠 레이아웃
 * 도메인 기반 메뉴 분리:
 * - admin.dwt.price: 관리자 전용 메뉴
 * - dwt.price: 사용자 전용 메뉴
 */

'use client';

import { useState, useEffect, useRef, Fragment, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
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
  Button,
  Tooltip,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { settlementApi } from '@/lib/api';
import {
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
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
  Palette as PaletteIcon,
  TableChart as TableChartIcon,
  // 정산 도메인 아이콘
  Receipt as ReceiptIcon,
  AccountBalance as AccountBalanceIcon,
  CloudUpload as CloudUploadIcon,
  Lock as LockIcon,
  ManageSearch as ActivityIcon,
  SwapHoriz as SwapHorizIcon,
  Balance as BalanceIcon,
  AccountBalanceWallet as BankImportIcon,
} from '@mui/icons-material';
import { useAuthStore, useUIStore, useDomainStore, useThemeStore, type ThemeMode, type User } from '@/lib/store';
import { getDomainType, getDefaultPath } from '@/lib/domain';
import { Logo } from '@/components/ui/Logo';
import { authApi } from '@/lib/api';

const DRAWER_WIDTH = 240;       // 280 → 240px (데이터 영역 확보)
const DRAWER_MINI_WIDTH = 56;  // 64 → 56px

function formatKSTShort(isoStr: string): string {
  let dateStr = isoStr;
  if (dateStr.includes('T') && !dateStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dateStr)) dateStr += 'Z';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });
  } catch { return isoStr; }
}

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
  { id: 'price-dashboard', label: '판매가 대시보드', icon: <TableChartIcon />, path: '/admin/price-dashboard' },
  {
    id: 'ssot-models',
    label: '모델 관리',
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
  { id: 'appearance-settings', label: '외관 설정', icon: <PaletteIcon />, path: '/admin/settings/appearance' },
];

// 정산 도메인 메뉴 (settlement.dwt.price)
const settlementMenus: MenuItemType[] = [
  { id: 'stl-dashboard', label: '대시보드', icon: <DashboardIcon />, path: '/settlement/dashboard' },
  { id: 'stl-upload', label: 'UPM 업로드', icon: <CloudUploadIcon />, path: '/settlement/upload' },
  { id: 'stl-upload-history', label: '업로드 내역', icon: <HistoryIcon />, path: '/settlement/upload/jobs' },
  { id: 'stl-vouchers', label: '전표 목록', icon: <ReceiptIcon />, path: '/settlement/vouchers' },
  { id: 'stl-transactions', label: '입출금 관리', icon: <SwapHorizIcon />, path: '/settlement/transactions' },
  { id: 'stl-netting', label: '상계 관리', icon: <BalanceIcon />, path: '/settlement/netting' },
  { id: 'stl-bank-import', label: '은행 임포트', icon: <BankImportIcon />, path: '/settlement/bank-import' },
  { id: 'stl-status', label: '거래처 현황', icon: <AccountBalanceIcon />, path: '/settlement/status' },
  { id: 'stl-counterparties', label: '거래처 관리', icon: <BusinessIcon />, path: '/settlement/counterparties' },
  { id: 'stl-lock', label: '마감 관리', icon: <LockIcon />, path: '/settlement/lock' },
  { id: 'stl-activity', label: '작업 내역', icon: <ActivityIcon />, path: '/settlement/activity' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, setAuth } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { domainType, isAdminDomain, isSettlementDomain, setDomainType } = useDomainStore();
  const { mode, setMode } = useThemeStore();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['ssot-models']));
  const [miniMode, setMiniMode] = useState(false);
  const [latestSalesDate, setLatestSalesDate] = useState<string | null>(null);
  const [latestPurchaseDate, setLatestPurchaseDate] = useState<string | null>(null);
  // NProgress-style 경로 전환 로딩 상태
  const [navigating, setNavigating] = useState(false);
  const prevPathRef = useRef(pathname);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

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
      const detected = getDomainType(host, urlSearchParams, pathname);
      setDomainType(detected);
    }
  }, [setDomainType, pathname]);
  
  // 현재 경로에 맞는 메뉴 자동 확장
  useEffect(() => {
    const newExpanded = new Set(expandedMenus);

    if (pathname.startsWith('/admin/models')) {
      newExpanded.add('ssot-models');
      if (pathname.includes('/smartphone')) newExpanded.add('models-smartphone');
      if (pathname.includes('/tablet')) newExpanded.add('models-tablet');
      if (pathname.includes('/wearable')) newExpanded.add('models-wearable');
    }

    // 정산 도메인 메뉴 자동 확장
    if (pathname.startsWith('/settlement/upload')) newExpanded.add('stl-upload');
    if (pathname.startsWith('/settlement/vouchers')) newExpanded.add('stl-vouchers');
    if (pathname.startsWith('/settlement/verification')) newExpanded.add('stl-verification');
    if (pathname.startsWith('/settlement/receivables') || pathname.startsWith('/settlement/payables')) newExpanded.add('stl-status');
    if (pathname.startsWith('/settlement/counterparties')) newExpanded.add('stl-counterparties');
    if (pathname.startsWith('/settlement/lock')) newExpanded.add('stl-lock');

    setExpandedMenus(newExpanded);
  }, [pathname]);
  
  // 비동기 사용자 정보 로딩 (논블로킹)
  // Zustand persist가 복원한 user가 있으면 스킵.
  // 없으면 (새 서브도메인 방문 등) 쿠키 토큰으로 /auth/me 호출.
  // 실패 시 Axios 인터셉터가 /login 리다이렉트 처리 (단일 리다이렉트 지점).
  useEffect(() => {
    if (user) return;

    const cookieMatch = document.cookie.match(/(?:^|;\s*)token=([^;]*)/);
    if (!cookieMatch) return; // 미들웨어가 이미 리다이렉트했어야 함

    const cookieToken = decodeURIComponent(cookieMatch[1]);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('access_token', cookieToken);
    }

    let cancelled = false;
    authApi.getMe()
      .then((response) => {
        if (cancelled) return;
        const userData = response.data.data as User;
        setAuth(userData, cookieToken);
      })
      .catch(() => {
        // Axios 인터셉터가 401/403 → /login 리다이렉트 처리
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  
  // 관리자 도메인에서 admin 권한 강제
  useEffect(() => {
    if (user && isAdminDomain && user.role !== 'admin') {
      console.warn('[AppLayout] 관리자 도메인 권한 불일치 → 로그아웃', { role: user.role });
      logout();
      router.push('/login?error=admin_required');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdminDomain]);

  // 정산 도메인에서 settlement 또는 admin 권한 강제
  useEffect(() => {
    if (user && isSettlementDomain && user.role !== 'settlement' && user.role !== 'admin') {
      console.warn('[AppLayout] 정산 도메인 권한 불일치 → 로그아웃', { role: user.role, isSettlementDomain });
      logout();
      router.push('/login?error=settlement_required');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSettlementDomain]);

  // 최신 업로드 버전 확인 (정산 도메인)
  const checkLatestUploads = useCallback(async () => {
    try {
      const res = await settlementApi.listUploadJobs({ page_size: 20 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobs = (res.data as any).jobs || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const confirmed = jobs.filter((j: any) => j.is_confirmed);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latestSales = confirmed.filter((j: any) => j.job_type.toLowerCase().includes('sales'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => new Date(b.confirmed_at).getTime() - new Date(a.confirmed_at).getTime())[0] || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latestPurchase = confirmed.filter((j: any) => j.job_type.toLowerCase().includes('purchase'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => new Date(b.confirmed_at).getTime() - new Date(a.confirmed_at).getTime())[0] || null;

      if (latestSales?.confirmed_at) {
        const lastSeen = localStorage.getItem('dwt_lastSeen_sales_confirmed_at');
        if (lastSeen && lastSeen !== latestSales.confirmed_at) {
          const dateStr = formatKSTShort(latestSales.confirmed_at);
          enqueueSnackbar(`판매 데이터가 새로 업데이트되었습니다 (${dateStr})`, {
            variant: 'info',
            action: (key) => (
              <Button size="small" color="inherit" onClick={() => { router.push('/settlement/upload/jobs'); closeSnackbar(key); }}>
                보기
              </Button>
            ),
          });
        }
        localStorage.setItem('dwt_lastSeen_sales_confirmed_at', latestSales.confirmed_at);
        setLatestSalesDate(formatKSTShort(latestSales.confirmed_at));
      }

      if (latestPurchase?.confirmed_at) {
        const lastSeen = localStorage.getItem('dwt_lastSeen_purchase_confirmed_at');
        if (lastSeen && lastSeen !== latestPurchase.confirmed_at) {
          const dateStr = formatKSTShort(latestPurchase.confirmed_at);
          enqueueSnackbar(`매입 데이터가 새로 업데이트되었습니다 (${dateStr})`, {
            variant: 'info',
            action: (key) => (
              <Button size="small" color="inherit" onClick={() => { router.push('/settlement/upload/jobs'); closeSnackbar(key); }}>
                보기
              </Button>
            ),
          });
        }
        localStorage.setItem('dwt_lastSeen_purchase_confirmed_at', latestPurchase.confirmed_at);
        setLatestPurchaseDate(formatKSTShort(latestPurchase.confirmed_at));
      }
    } catch {
      // 조용히 실패 (헤더 기능이므로 오류 표시 불필요)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSettlementDomain) return;
    checkLatestUploads();
    const timer = setInterval(checkLatestUploads, 3 * 60 * 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettlementDomain]);

  // 경로 전환 시 navigating 해제
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      setNavigating(false);
      prevPathRef.current = pathname;
    }
  }, [pathname]);

  const isAdmin = user?.role === 'admin';
  const currentMenus = isSettlementDomain ? settlementMenus : isAdminDomain ? adminMenus : userMenus;
  
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
    const isLeaf = !hasChildren && !!menu.path;

    // 미니 모드: 서브메뉴 아이템 숨김
    if (miniMode && level > 0) return null;

    const selectedSx = {
      '&.Mui-selected': {
        bgcolor: isSettlementDomain ? 'info.light' : isAdminDomain ? 'error.light' : 'primary.light',
        color: 'white',
        '&:hover': {
          bgcolor: isSettlementDomain ? 'info.main' : isAdminDomain ? 'error.main' : 'primary.main',
        },
        '& .MuiListItemIcon-root': { color: 'white' },
      },
    };

    const buttonSx = {
      mx: 1,
      borderRadius: 2,
      ...(miniMode
        ? { justifyContent: 'center', px: 1, minHeight: 48 }
        : { pl: 2 + level * 2 }
      ),
      ...selectedSx,
      ...(!miniMode && hasChildren && isActive && {
        bgcolor: (theme: import('@mui/material').Theme) => theme.palette.mode === 'light' ? 'grey.100' : 'grey.800',
        '& .MuiListItemText-primary': { fontWeight: 600 },
      }),
      // Link 사용 시 기본 a 태그 스타일 제거
      ...(isLeaf && { textDecoration: 'none', color: 'inherit' }),
    };

    const buttonContent = (
      <>
        <ListItemIcon sx={{ minWidth: miniMode ? 0 : 36 }}>{menu.icon}</ListItemIcon>
        {!miniMode && (
          <>
            <ListItemText
              primary={menu.label}
              primaryTypographyProps={{
                variant: level > 0 ? 'body2' : 'body1',
                fontWeight: isActive ? 600 : 400,
              }}
            />
            {hasChildren && (isExpanded ? <ExpandLess /> : <ExpandMore />)}
          </>
        )}
      </>
    );

    return (
      <Fragment key={menu.id}>
        <ListItem disablePadding>
          <Tooltip
            title={miniMode ? menu.label : ''}
            placement="right"
            arrow
            disableHoverListener={!miniMode}
            disableFocusListener={!miniMode}
            disableTouchListener={!miniMode}
          >
            {isLeaf ? (
              /* Link로 감싸서 hover 시 prefetch → 클릭 시 즉시 전환 */
              <ListItemButton
                component={Link}
                href={menu.path!}
                prefetch={true}
                selected={isActive}
                onClick={() => {
                  if (pathname !== menu.path) setNavigating(true);
                }}
                sx={buttonSx}
              >
                {buttonContent}
              </ListItemButton>
            ) : (
              <ListItemButton
                selected={false}
                onClick={() => {
                  if (hasChildren) {
                    if (miniMode) {
                      const firstPath = menu.children?.find(c => c.path)?.path;
                      if (firstPath) handleNavigate(firstPath);
                    } else {
                      handleToggleExpand(menu.id);
                    }
                  }
                }}
                sx={buttonSx}
              >
                {buttonContent}
              </ListItemButton>
            )}
          </Tooltip>
        </ListItem>

        {!miniMode && hasChildren && (
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
          boxShadow: 1,
        }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 48 }}>
          <IconButton
            edge="start"
            onClick={() => {
              if (sidebarOpen) setMiniMode(false);
              toggleSidebar();
            }}
            sx={{ mr: 2 }}
          >
            {sidebarOpen ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>

          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Logo
              size="small"
              variant="auto"
              onClick={() => router.push(
                isSettlementDomain ? '/settlement/dashboard'
                  : isAdminDomain ? '/admin/price-dashboard'
                  : '/prices'
              )}
            />
            {isAdminDomain && (
              <Chip
                icon={<AdminIcon sx={{ fontSize: 16 }} />}
                label="관리자"
                size="small"
                color="error"
                onClick={() => router.push('/admin/price-dashboard')}
                sx={{ fontWeight: 600, cursor: 'pointer' }}
              />
            )}
            {isSettlementDomain && (
              <Chip
                icon={<AccountBalanceIcon sx={{ fontSize: 16 }} />}
                label="경영지원"
                size="small"
                color="info"
                onClick={() => router.push('/settlement/dashboard')}
                sx={{ fontWeight: 600, cursor: 'pointer' }}
              />
            )}
          </Box>

          {isSettlementDomain && latestSalesDate && (
            <Tooltip title="판매 데이터 최신 확정일 — 클릭하여 내역 보기">
              <Chip
                label={`판매 ${latestSalesDate}`}
                size="small"
                color="primary"
                variant="outlined"
                onClick={() => router.push('/settlement/upload/jobs')}
                sx={{ fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer', mr: 0.5 }}
              />
            </Tooltip>
          )}
          {isSettlementDomain && latestPurchaseDate && (
            <Tooltip title="매입 데이터 최신 확정일 — 클릭하여 내역 보기">
              <Chip
                label={`매입 ${latestPurchaseDate}`}
                size="small"
                color="secondary"
                variant="outlined"
                onClick={() => router.push('/settlement/upload/jobs')}
                sx={{ fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer', mr: 1 }}
              />
            </Tooltip>
          )}

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
                {user?.role === 'admin' ? '관리자' : user?.role === 'settlement' ? '경영지원' : '조회자'}
              </Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { handleUserMenuClose(); router.push('/settings/appearance'); }}>
              <ListItemIcon>
                <PaletteIcon fontSize="small" />
              </ListItemIcon>
              외관 설정
            </MenuItem>
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
          width: sidebarOpen ? (miniMode ? DRAWER_MINI_WIDTH : DRAWER_WIDTH) : 0,
          flexShrink: 0,
          transition: (theme) => theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          '& .MuiDrawer-paper': {
            width: miniMode ? DRAWER_MINI_WIDTH : DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: (theme) => `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
            overflowX: 'hidden',
            transition: (theme) => theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Toolbar />

        {/* 스크롤 가능한 메뉴 영역 */}
        <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 2 }}>
          {/* 도메인별 메뉴 렌더링 */}
          <List>
            {currentMenus.map((menu) => renderMenuItem(menu))}
          </List>

          {/* 정산 도메인에서 관리자/사용자 이동 */}
          {isSettlementDomain && !miniMode && isAdmin && (
            <>
              <Divider sx={{ my: 2 }} />
              <List>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => {
                      const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.dwt.price';
                      window.location.href = adminUrl;
                    }}
                    sx={{ mx: 1, borderRadius: 2 }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}><AdminIcon color="error" /></ListItemIcon>
                    <ListItemText primary="관리자 페이지" primaryTypographyProps={{ color: 'error.main', fontWeight: 600 }} />
                  </ListItemButton>
                </ListItem>
              </List>
            </>
          )}

          {/* 도메인 전환 링크 (관리자만, 사용자 도메인에서만) */}
          {!isAdminDomain && !isSettlementDomain && isAdmin && !miniMode && (
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
                      bgcolor: (theme) => alpha(theme.palette.error.main, theme.palette.mode === 'light' ? 0.08 : 0.1),
                      '&:hover': {
                        bgcolor: (theme) => alpha(theme.palette.error.main, theme.palette.mode === 'light' ? 0.12 : 0.2),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}><AdminIcon color="error" /></ListItemIcon>
                    <ListItemText
                      primary="관리자 페이지 이동"
                      primaryTypographyProps={{ color: 'error.main', fontWeight: 600 }}
                    />
                  </ListItemButton>
                </ListItem>
              </List>
            </>
          )}

          {/* 도메인 전환 링크 (관리자 도메인에서) */}
          {isAdminDomain && !miniMode && (
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
                      bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.08 : 0.1),
                      '&:hover': {
                        bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.12 : 0.2),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}><PriceCheckIcon color="primary" /></ListItemIcon>
                    <ListItemText
                      primary="사용자 페이지 이동"
                      primaryTypographyProps={{ color: 'primary.main', fontWeight: 600 }}
                    />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => {
                      const settlementUrl = process.env.NEXT_PUBLIC_SETTLEMENT_URL || 'https://settlement.dwt.price';
                      window.location.href = settlementUrl;
                    }}
                    sx={{
                      mx: 1,
                      mt: 0.5,
                      borderRadius: 2,
                      bgcolor: (theme) => alpha(theme.palette.info.main, theme.palette.mode === 'light' ? 0.08 : 0.1),
                      '&:hover': {
                        bgcolor: (theme) => alpha(theme.palette.info.main, theme.palette.mode === 'light' ? 0.12 : 0.2),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}><AccountBalanceIcon color="info" /></ListItemIcon>
                    <ListItemText
                      primary="정산 관리 이동"
                      primaryTypographyProps={{ color: 'info.main', fontWeight: 600 }}
                    />
                  </ListItemButton>
                </ListItem>
              </List>
            </>
          )}
        </Box>

        {/* 사이드바 최소화 토글 버튼 */}
        <Box
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            p: 0.5,
            display: 'flex',
            justifyContent: miniMode ? 'center' : 'flex-end',
          }}
        >
          <Tooltip title={miniMode ? '메뉴 펼치기' : '메뉴 접기'} placement="right">
            <IconButton size="small" onClick={() => setMiniMode((v) => !v)}>
              {miniMode ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>
      
      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0, // flex 자식이 부모를 넘지 않도록 (텍스트 말줄임/테이블 축소 등)
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          height: '100%', // 부모(100vh) flex 컨테이너 내에서 늘어남
          overflow: 'hidden',
        }}
      >
        {/* AppBar 높이(48px)만큼 공간 확보 */}
        <Box sx={{ minHeight: 48, flexShrink: 0 }} />
        {/* 경로 전환 로딩 바 */}
        {navigating && (
          <Box sx={{
            position: 'absolute',
            top: 48,
            left: 0,
            right: 0,
            zIndex: (theme) => theme.zIndex.drawer + 2,
            height: 2,
            bgcolor: 'primary.main',
            animation: 'navProgress 1.5s ease-in-out infinite',
            '@keyframes navProgress': {
              '0%': { width: '0%', ml: 0 },
              '50%': { width: '70%', ml: '15%' },
              '100%': { width: '100%', ml: 0 },
            },
          }} />
        )}
        <Box
          sx={{
            flex: 1,
            minHeight: 0, // flex 자식 내부 스크롤이 정상 작동하도록
            overflow: 'auto',
            p: 2,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
