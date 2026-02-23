/**
 * 단가표 통합 관리 시스템 - 도메인 분리 설정
 * admin.dwt.price: 관리자 전용
 * settlement.dwt.price: 정산 관리 전용
 * dwt.price: 사용자 전용
 */

// 도메인 타입 정의
export type DomainType = 'admin' | 'user' | 'settlement';

// 환경 변수에서 도메인 설정 로드
export const DOMAIN_CONFIG = {
  admin: process.env.NEXT_PUBLIC_ADMIN_DOMAIN || 'admin.dwt.price',
  user: process.env.NEXT_PUBLIC_USER_DOMAIN || 'dwt.price',
  settlement: process.env.NEXT_PUBLIC_SETTLEMENT_DOMAIN || 'settlement.dwt.price',
} as const;

// 관리자 도메인 패턴 (localhost 개발 환경 포함)
const ADMIN_DOMAIN_PATTERNS = [
  'admin.dwt.price',
  'admin.localhost',
  /^admin\./,
];

// 정산 도메인 패턴
const SETTLEMENT_DOMAIN_PATTERNS = [
  'settlement.dwt.price',
  'settlement.localhost',
  /^settlement\./,
];

/**
 * Host 헤더에서 도메인 타입 추출
 * 개발 환경: ?domain=admin|settlement 쿼리 파라미터로 강제 설정 가능
 * localhost에서 /admin/* 또는 /settlement/* 경로 접근 시 자동 인식
 */
export function getDomainType(host: string | null, searchParams?: URLSearchParams, pathname?: string): DomainType {
  // 개발 환경: 쿼리 파라미터로 도메인 강제 설정
  const domainParam = searchParams?.get('domain');
  if (domainParam === 'admin') return 'admin';
  if (domainParam === 'settlement') return 'settlement';

  // localhost 개발 환경에서 경로 기반 도메인 인식
  if (pathname?.startsWith('/settlement')) return 'settlement';
  if (pathname?.startsWith('/admin')) return 'admin';

  if (!host) return 'user';

  const hostname = host.split(':')[0];

  // 정산 도메인 패턴 매칭
  for (const pattern of SETTLEMENT_DOMAIN_PATTERNS) {
    if (typeof pattern === 'string') {
      if (hostname === pattern) return 'settlement';
    } else {
      if (pattern.test(hostname)) return 'settlement';
    }
  }

  // admin 도메인 패턴 매칭
  for (const pattern of ADMIN_DOMAIN_PATTERNS) {
    if (typeof pattern === 'string') {
      if (hostname === pattern) return 'admin';
    } else {
      if (pattern.test(hostname)) return 'admin';
    }
  }

  return 'user';
}

/**
 * 도메인별 허용 경로 정의
 */
export const DOMAIN_ROUTES = {
  admin: {
    allowed: [
      '/admin/price-dashboard',
      '/admin/models',
      '/admin/hq-upload',
      '/admin/partners',
      '/admin/partner-upload',
      '/admin/grades',
      '/admin/deductions',
      '/admin/audit',
      '/admin/users',
      '/admin/settings',
      '/settings',
      '/login',
    ],
    defaultPath: '/admin/models',
    afterLogin: '/admin/models',
  },
  user: {
    allowed: [
      '/prices',
      '/compare',
      '/my-lists',
      '/search',
      '/settings',
      '/login',
    ],
    defaultPath: '/prices',
    afterLogin: '/prices',
  },
  settlement: {
    allowed: [
      '/settlement/dashboard',
      '/settlement/vouchers',
      '/settlement/upload',
      '/settlement/verification',
      '/settlement/status',
      '/settlement/counterparties',
      '/settlement/partners',
      '/settlement/lock',
      '/settlement/activity',
      '/settings',
      '/login',
    ],
    defaultPath: '/settlement/dashboard',
    afterLogin: '/settlement/dashboard',
  },
} as const;

/**
 * 경로가 현재 도메인에서 허용되는지 확인
 */
export function isRouteAllowedForDomain(pathname: string, domainType: DomainType): boolean {
  const routes = DOMAIN_ROUTES[domainType];
  return routes.allowed.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );
}

/**
 * 도메인별 기본 경로 반환
 */
export function getDefaultPath(domainType: DomainType): string {
  return DOMAIN_ROUTES[domainType].defaultPath;
}

/**
 * 도메인별 로그인 후 리다이렉트 경로
 */
export function getAfterLoginPath(domainType: DomainType): string {
  return DOMAIN_ROUTES[domainType].afterLogin;
}

/**
 * admin 도메인에서 admin 권한 필요 여부
 */
export function requiresAdminRole(domainType: DomainType): boolean {
  return domainType === 'admin';
}

/**
 * settlement 도메인에서 settlement 또는 admin 권한 필요 여부
 */
export function requiresSettlementRole(domainType: DomainType): boolean {
  return domainType === 'settlement';
}
