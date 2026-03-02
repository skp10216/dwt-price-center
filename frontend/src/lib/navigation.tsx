'use client';

import { createContext, useContext, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

type StartNavigating = () => void;

const NavigationContext = createContext<StartNavigating>(() => {});

export const NavigationProvider = NavigationContext.Provider;

/**
 * router.push 시 자동으로 전역 로딩 바를 트리거하는 훅.
 * AppLayout의 navigating 상태와 연동됨.
 */
export function useAppRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const startNavigating = useContext(NavigationContext);

  const push = useCallback(
    (href: string) => {
      if (href !== pathname) {
        startNavigating();
      }
      router.push(href);
    },
    [router, pathname, startNavigating],
  );

  return { ...router, push };
}
