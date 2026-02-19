/**
 * 단가표 통합 관리 시스템 - Next.js Middleware
 * Host 기반 도메인 분리 라우팅
 * 
 * admin.dwt.price -> 관리자 전용 (role=admin 필수)
 * dwt.price -> 사용자 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getDomainType, 
  isRouteAllowedForDomain, 
  getDefaultPath,
  requiresAdminRole,
  requiresSettlementRole,
  type DomainType 
} from '@/lib/domain';

// 미들웨어 적용 제외 경로
const PUBLIC_PATHS = ['/login', '/_next', '/favicon.ico', '/api'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');
  
  // 정적 파일 및 API 경로 제외
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    // 로그인 페이지는 도메인 컨텍스트를 헤더로 전달
    if (pathname === '/login') {
      const domainType = getDomainType(host);
      const response = NextResponse.next();
      response.headers.set('x-domain-type', domainType);
      return response;
    }
    return NextResponse.next();
  }
  
  // 도메인 타입 결정 (pathname 전달 → localhost에서 /settlement/* 경로 인식)
  const domainType = getDomainType(host, undefined, pathname);
  
  // 인증 토큰 확인 (쿠키에서)
  const token = request.cookies.get('token')?.value;
  const userRole = request.cookies.get('user_role')?.value;
  
  // 미인증 사용자 -> 로그인 페이지
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // Admin 도메인에서 admin role 강제
  if (requiresAdminRole(domainType) && userRole !== 'admin') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'admin_required');
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('token');
    response.cookies.delete('user_role');
    return response;
  }
  
  // Settlement 도메인에서 settlement 또는 admin role 강제
  if (requiresSettlementRole(domainType) && userRole !== 'settlement' && userRole !== 'admin') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'settlement_required');
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('token');
    response.cookies.delete('user_role');
    return response;
  }
  
  // 루트 경로 -> 도메인별 기본 경로로 리다이렉트
  if (pathname === '/' || pathname === '') {
    return NextResponse.redirect(new URL(getDefaultPath(domainType), request.url));
  }
  
  // 경로 허용 여부 확인
  if (!isRouteAllowedForDomain(pathname, domainType)) {
    const defaultPath = getDefaultPath(domainType);
    return NextResponse.redirect(new URL(defaultPath, request.url));
  }
  
  // 도메인 타입을 헤더로 전달 (클라이언트에서 사용)
  const response = NextResponse.next();
  response.headers.set('x-domain-type', domainType);
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
