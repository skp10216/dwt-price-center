/**
 * 단가표 통합 관리 시스템 - 도메인 분리 설정
 * admin.dwt.price: 관리자 전용
 * dwt.price: 사용자 전용
 */

// 도메인 타입 정의
export type DomainType = 'admin' | 'user';

// 환경 변수에서 도메인 설정 로드
export const DOMAIN_CONFIG = {
  admin: process.env.NEXT_PUBLIC_ADMIN_DOMAIN || 'admin.dwt.price',
  user: process.env.NEXT_PUBLIC_USER_DOMAIN || 'dwt.price',
} as const;

// 관리자 도메인 패턴 (localhost 개발 환경 포함)
const ADMIN_DOMAIN_PATTERNS = [
  'admin.dwt.price',
  'admin.localhost',
  /^admin\./,
];

/**
 * Host 헤더에서 도메인 타입 추출
 * 개발 환경: ?domain=admin 쿼리 파라미터로 강제 설정 가능
 * localhost에서 /admin/* 경로 접근 시 자동으로 admin 도메인으로 인식
 */
export function getDomainType(host: string | null, searchParams?: URLSearchParams, pathname?: string): DomainType {
  // 개발 환경: 쿼리 파라미터로 도메인 강제 설정
  if (searchParams?.get('domain') === 'admin') {
    return 'admin';
  }

  // localhost 개발 환경에서 /admin/* 경로 접근 시 admin 도메인으로 인식
  if (pathname?.startsWith('/admin')) {
    return 'admin';
  }

  if (!host) return 'user';

  // admin 도메인 패턴 매칭
  const hostname = host.split(':')[0]; // 포트 제거

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
    // 관리자 도메인에서 허용되는 경로
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
      '/login',
    ],
    // 기본 리다이렉트 경로
    defaultPath: '/admin/models',
    // 로그인 후 리다이렉트
    afterLogin: '/admin/models',
  },
  user: {
    // 사용자 도메인에서 허용되는 경로
    allowed: [
      '/prices',
      '/compare',
      '/my-lists',
      '/search',
      '/login',
    ],
    // 기본 리다이렉트 경로
    defaultPath: '/prices',
    // 로그인 후 리다이렉트
    afterLogin: '/prices',
  },
} as const;

/**
 * 경로가 현재 도메인에서 허용되는지 확인
 */
export function isRouteAllowedForDomain(pathname: string, domainType: DomainType): boolean {
  const routes = DOMAIN_ROUTES[domainType];
  
  // 정확한 매칭 또는 접두사 매칭
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
