/**
 * SSOT 모델 관리 대시보드 페이지
 * 
 * 기능:
 * - 디바이스 타입별 카드 (스마트폰/태블릿/웨어러블)
 * - 각 카드에 브랜드별 통계 표시
 * - 클릭 시 해당 가격 관리 페이지로 이동
 */

'use client';

import { Box } from '@mui/material';
import { ModelsDashboard } from './_components';

export default function ModelsPage() {
  return (
    <Box>
      <ModelsDashboard />
    </Box>
  );
}
