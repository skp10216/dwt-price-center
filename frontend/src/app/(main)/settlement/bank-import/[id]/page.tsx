'use client';

/**
 * 은행 임포트 상세 페이지 → 위자드 통합으로 리다이렉트
 * 기존 URL 호환을 위해 유지
 */

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAppRouter } from '@/lib/navigation';

export default function BankImportDetailRedirect() {
  const router = useAppRouter();
  const params = useParams();
  const jobId = params.id as string;

  useEffect(() => {
    router.replace(`/settlement/bank-import?job=${jobId}`);
  }, [router, jobId]);

  return null;
}
