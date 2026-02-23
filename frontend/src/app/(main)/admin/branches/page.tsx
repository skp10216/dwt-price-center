'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminBranchesRedirect() {
  const router = useRouter();
  useEffect(() => {
    const settlementUrl = process.env.NEXT_PUBLIC_SETTLEMENT_URL || 'http://settlement.localhost:3000';
    window.location.href = `${settlementUrl}/settlement/counterparties?tab=branches`;
  }, [router]);
  return null;
}
