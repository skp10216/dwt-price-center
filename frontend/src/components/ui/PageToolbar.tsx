/**
 * PageToolbar - 하위 호환용 래퍼
 *
 * 새로운 프로젝트에서는 AppPageToolbar를 직접 사용하세요.
 * 기존 코드 호환을 위해 동일 인터페이스를 유지합니다.
 */

'use client';

import AppPageToolbar from './AppPageToolbar';
import type { AppPageToolbarProps } from './AppPageToolbar';

export type PageToolbarProps = AppPageToolbarProps;

export default function PageToolbar(props: AppPageToolbarProps) {
  return <AppPageToolbar {...props} />;
}
