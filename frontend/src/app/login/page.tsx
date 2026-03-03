/**
 * 단가표 통합 관리 시스템 - 로그인 페이지 (Server Component)
 *
 * 미들웨어가 설정한 x-domain-type 헤더를 읽어
 * Client Component에 initialDomainType으로 전달합니다.
 * → SSR 시점부터 올바른 도메인별 UI가 렌더링되어 플래시 방지
 */

import { headers } from 'next/headers';
import LoginClient from './LoginClient';
import type { DomainType } from '@/lib/domain';

export default function LoginPage() {
  const headersList = headers();
  const domainType = (headersList.get('x-domain-type') as DomainType) || 'user';
  return <LoginClient initialDomainType={domainType} />;
}
