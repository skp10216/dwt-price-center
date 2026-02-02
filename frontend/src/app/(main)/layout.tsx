/**
 * 단가표 통합 관리 시스템 - Main Layout (인증 필요)
 */

import AppLayout from '@/components/layout/AppLayout';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
