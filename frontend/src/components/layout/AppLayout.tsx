/**
 * 단가표 통합 관리 시스템 - App Layout
 * 사이드바/상단바/컨텐츠 레이아웃
 * 도메인 기반 메뉴 분리:
 * - admin.dwt.price: 관리자 전용 메뉴
 * - dwt.price: 사용자 전용 메뉴
 */

'use client';

import { useState, useEffect, useRef, Fragment, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { settlementApi } from '@/lib/api';
// MUI 아이콘 개별 경로 임포트 (tree-shaking 보장)
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PriceCheckIcon from '@mui/icons-material/PriceCheck';
import CompareIcon from '@mui/icons-material/Compare';
import StarIcon from '@mui/icons-material/Star';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import UploadIcon from '@mui/icons-material/Upload';
import BusinessIcon from '@mui/icons-material/Business';
import GradeIcon from '@mui/icons-material/Grade';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import HistoryIcon from '@mui/icons-material/History';
import PeopleIcon from '@mui/icons-material/People';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import LogoutIcon from '@mui/icons-material/Logout';
import AdminIcon from '@mui/icons-material/AdminPanelSettings';
import SmartphoneIcon from '@mui/icons-material/Smartphone';
import TabletIcon from '@mui/icons-material/Tablet';
import WatchIcon from '@mui/icons-material/Watch';
import AppleIcon from '@mui/icons-material/Apple';
import SamsungIcon from '@mui/icons-material/PhoneAndroid';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import AutoModeIcon from '@mui/icons-material/SettingsBrightness';
import AddIcon from '@mui/icons-material/Add';
import PaletteIcon from '@mui/icons-material/Palette';
import TableChartIcon from '@mui/icons-material/TableChart';
// 정산 도메인 아이콘
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import LockIcon from '@mui/icons-material/Lock';
import ActivityIcon from '@mui/icons-material/ManageSearch';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import BalanceIcon from '@mui/icons-material/Balance';
import BankImportIcon from '@mui/icons-material/AccountBalanceWallet';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CorporateFareIcon from '@mui/icons-material/CorporateFare';
import BarChartIcon from '@mui/icons-material/BarChart';
import DonutSmallIcon from '@mui/icons-material/DonutSmall';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ScienceIcon from '@mui/icons-material/Science';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
// 관리자 메뉴 아이콘
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import VerifiedIcon from '@mui/icons-material/Verified';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WorkIcon from '@mui/icons-material/Work';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import { useAuthStore, useUIStore, useDomainStore, useThemeStore, type ThemeMode, type User } from '@/lib/store';
import { getDomainType, getDefaultPath } from '@/lib/domain';
import { NavigationProvider } from '@/lib/navigation';
import { Logo } from '@/components/ui/Logo';
import { authApi } from '@/lib/api';
import TransactionCreateDialog from '@/components/settlement/TransactionCreateDialog';

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

// 메뉴 그룹 (섹션 구분)
interface MenuGroup {
  label?: string;        // 섹션 헤더 (없으면 첫 그룹으로 간주)
  items: MenuItemType[];
}

// 사용자 도메인 메뉴 (dwt.price) - 4개로 그룹핑 불필요
const userMenuGroups: MenuGroup[] = [
  {
    items: [
      { id: 'prices', label: '본사 판매 단가', icon: <PriceCheckIcon />, path: '/prices' },
      { id: 'compare', label: '업체별 단가 비교', icon: <CompareIcon />, path: '/compare' },
      { id: 'my-lists', label: '내 리스트', icon: <StarIcon />, path: '/my-lists' },
      { id: 'search', label: '모델 검색', icon: <SearchIcon />, path: '/search' },
    ],
  },
];

// 관리자 도메인 메뉴 (admin.dwt.price)
const adminMenuGroups: MenuGroup[] = [
  {
    items: [
      { id: 'price-dashboard', label: '판매가 대시보드', icon: <TableChartIcon />, path: '/admin/price-dashboard' },
    ],
  },
  {
    label: '단가 관리',
    items: [
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
      { id: 'partner-upload', label: '거래처 단가표 업로드', icon: <UploadIcon />, path: '/admin/partner-upload' },
      { id: 'grades', label: '등급 관리', icon: <GradeIcon />, path: '/admin/grades' },
      { id: 'deductions', label: '차감 관리', icon: <RemoveCircleIcon />, path: '/admin/deductions' },
    ],
  },
  {
    label: '거래처',
    items: [
      { id: 'partners', label: '거래처 관리', icon: <BusinessIcon />, path: '/admin/partners' },
    ],
  },
  {
    label: '시스템',
    items: [
      { id: 'users', label: '사용자 관리', icon: <PeopleIcon />, path: '/admin/users' },
      { id: 'audit', label: '감사로그', icon: <HistoryIcon />, path: '/admin/audit' },
      { id: 'appearance-settings', label: '외관 설정', icon: <PaletteIcon />, path: '/admin/settings/appearance' },
    ],
  },
];

// 정산 도메인 메뉴 (settlement.dwt.price)
const settlementMenuGroups: MenuGroup[] = [
  {
    items: [
      { id: 'stl-dashboard', label: '대시보드', icon: <DashboardIcon />, path: '/settlement/dashboard' },
    ],
  },
  {
    label: '데이터 입력',
    items: [
      { id: 'stl-upload', label: 'UPM 업로드', icon: <CloudUploadIcon />, path: '/settlement/upload' },
      { id: 'stl-upload-history', label: '업로드 내역', icon: <HistoryIcon />, path: '/settlement/upload/jobs' },
      { id: 'stl-bank-import', label: '은행 임포트', icon: <BankImportIcon />, path: '/settlement/bank-import' },
    ],
  },
  {
    label: '정산 업무',
    items: [
      { id: 'stl-vouchers', label: '전표 목록', icon: <ReceiptIcon />, path: '/settlement/vouchers' },
      { id: 'stl-returns', label: '반품 내역', icon: <AssignmentReturnIcon />, path: '/settlement/returns' },
      { id: 'stl-intakes', label: '반입 내역', icon: <MoveToInboxIcon />, path: '/settlement/intakes' },
      { id: 'stl-transactions', label: '입출금 관리', icon: <SwapHorizIcon />, path: '/settlement/transactions' },
      { id: 'stl-netting', label: '상계 관리', icon: <BalanceIcon />, path: '/settlement/netting' },
    ],
  },
  {
    label: '거래처',
    items: [
      { id: 'stl-counterparties', label: '거래처 관리', icon: <BusinessIcon />, path: '/settlement/counterparties' },
      { id: 'stl-status', label: '거래처 현황', icon: <AccountBalanceIcon />, path: '/settlement/status' },
      { id: 'stl-branches', label: '지사 관리', icon: <AccountTreeIcon />, path: '/settlement/branches' },
      { id: 'stl-corporate-entities', label: '법인 관리', icon: <CorporateFareIcon />, path: '/settlement/corporate-entities' },
    ],
  },
  {
    label: '통계',
    items: [
      { id: 'stl-stats-overview', label: '정산 현황', icon: <BarChartIcon />, path: '/settlement/statistics' },
      { id: 'stl-stats-counterparty', label: '거래처 분석', icon: <DonutSmallIcon />, path: '/settlement/statistics/counterparty' },
      { id: 'stl-stats-profit', label: '수익률 분석', icon: <TrendingUpIcon />, path: '/settlement/statistics/profit' },
    ],
  },
  {
    label: '관리',
    items: [
      { id: 'stl-lock', label: '마감 관리', icon: <LockIcon />, path: '/settlement/lock' },
      { id: 'stl-activity', label: '작업 내역', icon: <ActivityIcon />, path: '/settlement/activity' },
    ],
  },
];

// 정산 관리자 전용 메뉴 (admin 역할에만 표시)
const settlementAdminMenuGroup: MenuGroup = {
  label: '시스템 관리',
  items: [
    { id: 'stl-admin-dashboard', label: '운영 대시보드', icon: <SpeedIcon />, path: '/settlement/admin/dashboard' },
    { id: 'stl-admin-system', label: '시스템 헬스', icon: <MonitorHeartIcon />, path: '/settlement/admin/system' },
    { id: 'stl-admin-integrity', label: '정합성 점검', icon: <VerifiedIcon />, path: '/settlement/admin/integrity' },
    { id: 'stl-admin-users', label: '사용자 계정', icon: <PeopleIcon />, path: '/settlement/admin/users' },
    { id: 'stl-admin-audit', label: '감사로그', icon: <SecurityIcon />, path: '/settlement/admin/audit' },
    { id: 'stl-admin-anomaly', label: '이상 활동 감지', icon: <WarningAmberIcon />, path: '/settlement/admin/anomaly' },
    { id: 'stl-admin-sessions', label: '로그인 이력', icon: <HistoryIcon />, path: '/settlement/admin/sessions' },
    { id: 'stl-admin-jobs', label: 'Worker 현황', icon: <WorkIcon />, path: '/settlement/admin/jobs' },
    { id: 'stl-admin-period-lock', label: '기간 마감', icon: <CalendarMonthIcon />, path: '/settlement/admin/period-lock' },
    { id: 'stl-admin-flow-test', label: '플로우 점검', icon: <ScienceIcon />, path: '/settlement/flow-test' },
  ],
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, logout, setAuth } = useAuthStore();
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  const { domainType, isAdminDomain, isSettlementDomain, setDomainType } = useDomainStore();
  const { mode, setMode } = useThemeStore();

  // 모바일 감지 (AppDetailDrawer.tsx 패턴 동일)
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['ssot-models']));
  const [miniMode, setMiniMode] = useState(false);
  const [latestSalesDate, setLatestSalesDate] = useState<string | null>(null);
  const [latestPurchaseDate, setLatestPurchaseDate] = useState<string | null>(null);
  // NProgress-style 경로 전환 로딩 상태
  const [navigating, setNavigating] = useState(false);
  const startNavigating = useCallback(() => setNavigating(true), []);
  // 정산 도메인 FAB
  const [fabTxnOpen, setFabTxnOpen] = useState(false);
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

  // /settlement/admin/* 경로에서 admin 권한 강제
  useEffect(() => {
    if (user && pathname.startsWith('/settlement/admin') && user.role !== 'admin') {
      console.warn('[AppLayout] 정산 관리자 경로 권한 불일치 → 로그아웃', { role: user.role });
      logout();
      router.push('/login?error=admin_required&redirect=/settlement/admin/dashboard');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pathname]);

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
      } else {
        localStorage.removeItem('dwt_lastSeen_sales_confirmed_at');
        setLatestSalesDate(null);
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
      } else {
        localStorage.removeItem('dwt_lastSeen_purchase_confirmed_at');
        setLatestPurchaseDate(null);
      }
    } catch {
      // 조용히 실패 (헤더 기능이므로 오류 표시 불필요)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSettlementDomain) return;
    checkLatestUploads();
    const timer = setInterval(() => {
      // 탭 비활성 시 폴링 중지
      if (!document.hidden) {
        checkLatestUploads();
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettlementDomain]);

  // 모바일 초기 진입 시 사이드바 닫기
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // 경로 전환 시 navigating 해제 + 모바일 사이드바 닫기
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      setNavigating(false);
      prevPathRef.current = pathname;
      if (isMobile) setSidebarOpen(false);
    }
  }, [pathname, isMobile, setSidebarOpen]);

  const isAdmin = user?.role === 'admin';
  const isSettlementAdminPath = pathname.startsWith('/settlement/admin');

  // /settlement/admin/* 경로: 관리자 전용 메뉴만 표시
  // 일반 settlement 경로: settlement 메뉴만 (admin 메뉴 미표시)
  const currentMenuGroups = isSettlementDomain
    ? (isSettlementAdminPath && isAdmin ? [settlementAdminMenuGroup] : settlementMenuGroups)
    : isAdminDomain ? adminMenuGroups : userMenuGroups;
  
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
  
  // from 파라미터 → 출발 메뉴 경로 매핑 (상세 페이지에서 사이드바 하이라이트 유지)
  const fromParam = searchParams.get('from');
  const FROM_MENU_PATHS: Record<string, string> = {
    status: '/settlement/status',
    dashboard: '/settlement/dashboard',
  };
  const activePathOverride = fromParam ? FROM_MENU_PATHS[fromParam] ?? null : null;

  // 메뉴가 현재 경로와 매칭되는지 확인
  const isMenuActive = (menu: MenuItemType, siblings?: MenuItemType[]): boolean => {
    if (menu.path) {
      // from 파라미터 오버라이드: 상세 페이지에서 출발 메뉴 유지
      if (activePathOverride) {
        if (menu.path === activePathOverride) return true;
        if (pathname.startsWith(menu.path + '/')) return false;
      }
      if (pathname === menu.path) return true;
      if (pathname.startsWith(menu.path + '/')) {
        // 더 구체적인 sibling 경로가 매칭되면 이 메뉴는 비활성
        if (siblings?.some(s => s.path && s.path !== menu.path && pathname.startsWith(s.path))) {
          return false;
        }
        return true;
      }
      return false;
    }
    if (menu.children) {
      return menu.children.some(child => isMenuActive(child, menu.children));
    }
    return false;
  };

  // 재귀적 메뉴 렌더링
  const renderMenuItem = (menu: MenuItemType, level: number = 0, siblings?: MenuItemType[]) => {
    const hasChildren = menu.children && menu.children.length > 0;
    const isExpanded = expandedMenus.has(menu.id);
    const isActive = isMenuActive(menu, siblings);
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
      py: 0.5,
      ...(miniMode
        ? { justifyContent: 'center', px: 1, minHeight: 40 }
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
        <ListItemIcon sx={{ minWidth: miniMode ? 0 : 32, '& .MuiSvgIcon-root': { fontSize: '1.2rem' } }}>{menu.icon}</ListItemIcon>
        {!miniMode && (
          <>
            <ListItemText
              primary={menu.label}
              primaryTypographyProps={{
                variant: 'body2',
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
              {menu.children!.map((child) => renderMenuItem(child, level + 1, menu.children))}
            </List>
          </Collapse>
        )}
      </Fragment>
    );
  };
  
  return (
    <NavigationProvider value={startNavigating}>
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
            {isAdminDomain && !isMobile && (
              <Chip
                icon={<AdminIcon sx={{ fontSize: 16 }} />}
                label="관리자"
                size="small"
                color="error"
                onClick={() => router.push('/admin/price-dashboard')}
                sx={{ fontWeight: 600, cursor: 'pointer' }}
              />
            )}
            {isSettlementDomain && !isMobile && (
              isSettlementAdminPath ? (
                <Chip
                  icon={<AdminIcon sx={{ fontSize: 16 }} />}
                  label="시스템 관리"
                  size="small"
                  color="error"
                  onClick={() => router.push('/settlement/admin/dashboard')}
                  sx={{ fontWeight: 600, cursor: 'pointer' }}
                />
              ) : (
                <Chip
                  icon={<AccountBalanceIcon sx={{ fontSize: 16 }} />}
                  label="경영지원"
                  size="small"
                  color="info"
                  onClick={() => router.push('/settlement/dashboard')}
                  sx={{ fontWeight: 600, cursor: 'pointer' }}
                />
              )
            )}
          </Box>

          {isSettlementDomain && latestSalesDate && !isMobile && (
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
          {isSettlementDomain && latestPurchaseDate && !isMobile && (
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
        variant={isMobile ? 'temporary' : 'persistent'}
        open={sidebarOpen}
        onClose={isMobile ? () => setSidebarOpen(false) : undefined}
        ModalProps={isMobile ? { keepMounted: true } : undefined}
        sx={{
          width: isMobile ? 0 : (sidebarOpen ? (miniMode ? DRAWER_MINI_WIDTH : DRAWER_WIDTH) : 0),
          flexShrink: 0,
          transition: (theme) => theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          '& .MuiDrawer-paper': {
            width: isMobile ? DRAWER_WIDTH : (miniMode ? DRAWER_MINI_WIDTH : DRAWER_WIDTH),
            boxSizing: 'border-box',
            borderRight: (theme) => `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
            overflowX: 'hidden',
            transition: isMobile ? undefined : (theme) => theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Toolbar />

        {/* 메뉴 영역 (compact: 스크롤 방지) */}
        <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1 }}>
          {/* 도메인별 메뉴 렌더링 (그룹 구조) */}
          {currentMenuGroups.map((group, groupIdx) => (
            <Fragment key={group.label ?? `group-${groupIdx}`}>
              {groupIdx > 0 && <Divider sx={{ my: 0.5, mx: 1.5 }} />}
              {group.label && !miniMode && (
                <Typography
                  variant="caption"
                  color="text.disabled"
                  fontWeight={700}
                  sx={{ px: 3, pt: 0, pb: 0.25, display: 'block', letterSpacing: '0.05em', fontSize: '0.65rem' }}
                >
                  {group.label}
                </Typography>
              )}
              <List disablePadding dense>
                {group.items.map((menu) => renderMenuItem(menu, 0, group.items))}
              </List>
            </Fragment>
          ))}


          {/* 정산 도메인에서 admin 역할 사용자에게 시스템 관리 링크 표시 */}
          {isSettlementDomain && !isSettlementAdminPath && isAdmin && !miniMode && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <List dense>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => router.push('/settlement/admin/dashboard')}
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
                      primary="시스템 관리"
                      primaryTypographyProps={{ color: 'error.main', fontWeight: 600 }}
                    />
                  </ListItemButton>
                </ListItem>
              </List>
            </>
          )}

          {/* 정산 관리자 모드에서 정산 포탈 이동 링크 */}
          {isSettlementDomain && isSettlementAdminPath && !miniMode && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <List dense>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => router.push('/settlement/dashboard')}
                    sx={{
                      mx: 1,
                      borderRadius: 2,
                      bgcolor: (theme) => alpha(theme.palette.info.main, theme.palette.mode === 'light' ? 0.08 : 0.1),
                      '&:hover': {
                        bgcolor: (theme) => alpha(theme.palette.info.main, theme.palette.mode === 'light' ? 0.12 : 0.2),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}><AccountBalanceIcon color="info" /></ListItemIcon>
                    <ListItemText
                      primary="정산 포탈 이동"
                      primaryTypographyProps={{ color: 'info.main', fontWeight: 600 }}
                    />
                  </ListItemButton>
                </ListItem>
              </List>
            </>
          )}

          {/* 도메인 전환 링크 (관리자만, 사용자 도메인에서만) */}
          {!isAdminDomain && !isSettlementDomain && isAdmin && !miniMode && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <Box sx={{ px: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                  관리자 기능
                </Typography>
              </Box>
              <List dense>
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
              <Divider sx={{ my: 0.5 }} />
              <List dense>
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

        {/* 사이드바 최소화 토글 버튼 (모바일에서는 숨김) */}
        {!isMobile && (
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
        )}
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
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            p: isMobile ? 1 : 2,
          }}
        >
          {children}
        </Box>

        {/* ─── 정산 도메인 플로팅 액션 버튼 ─── */}
        {pathname.startsWith('/settlement') && (
          <>
            <SpeedDial
              ariaLabel="빠른 작업"
              sx={{ position: 'fixed', bottom: 24, right: 24 }}
              icon={<SpeedDialIcon />}
            >
              <SpeedDialAction
                icon={<SwapHorizIcon />}
                tooltipTitle="입출금 등록"
                onClick={() => setFabTxnOpen(true)}
              />
              <SpeedDialAction
                icon={<ReceiptIcon />}
                tooltipTitle="전표 목록"
                onClick={() => router.push('/settlement/vouchers')}
              />
              <SpeedDialAction
                icon={<AccountBalanceIcon />}
                tooltipTitle="거래처 현황"
                onClick={() => router.push('/settlement/status')}
              />
            </SpeedDial>
            <TransactionCreateDialog
              open={fabTxnOpen}
              onClose={() => setFabTxnOpen(false)}
              onCreated={() => { /* 페이지별 refresh는 개별 페이지에서 처리 */ }}
            />
          </>
        )}
      </Box>
    </Box>
    </NavigationProvider>
  );
}
