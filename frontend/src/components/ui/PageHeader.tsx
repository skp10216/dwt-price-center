/**
 * PageHeader - 하위 호환용 래퍼
 *
 * 새로운 프로젝트에서는 AppPageHeader를 직접 사용하세요.
 * 기존 코드 호환을 위해 동일 인터페이스를 유지합니다.
 */

'use client';

import AppPageHeader from './AppPageHeader';
import type { AppPageHeaderProps, AppPageHeaderAction } from './AppPageHeader';

// 기존 인터페이스 그대로 re-export
export type PageHeaderAction = AppPageHeaderAction;
export type PageHeaderProps = AppPageHeaderProps;

export default function PageHeader(props: AppPageHeaderProps) {
  return <AppPageHeader {...props} />;
}
