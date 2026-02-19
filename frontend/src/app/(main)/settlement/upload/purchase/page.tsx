'use client';

import VoucherUploadPage from '@/components/upload/VoucherUploadPage';

/**
 * UPM 매입 전표 업로드 페이지
 * 공통 VoucherUploadPage 컴포넌트를 사용하여 매입 전표 업로드를 처리합니다.
 */
export default function UploadPurchasePage() {
  return <VoucherUploadPage voucherType="purchase" />;
}
