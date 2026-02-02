/**
 * 디바이스 타입/브랜드별 가격 관리 페이지
 * 
 * 동적 라우트: /admin/models/[deviceType]/[manufacturer]
 * 예: /admin/models/smartphone/apple
 */

'use client';

import { useParams, notFound } from 'next/navigation';
import { Box } from '@mui/material';
import { ModelPriceEditor } from '../../_components';
import { DeviceType, Manufacturer, deviceTypeLabels, manufacturerLabels } from '../../_components/types';

// 유효한 디바이스 타입
const validDeviceTypes: DeviceType[] = ['smartphone', 'tablet', 'wearable'];

// 유효한 제조사
const validManufacturers: Manufacturer[] = ['apple', 'samsung'];

export default function ModelPriceManagementPage() {
  const params = useParams();
  const deviceType = params.deviceType as string;
  const manufacturer = params.manufacturer as string;
  
  // 유효성 검사
  if (!validDeviceTypes.includes(deviceType as DeviceType)) {
    notFound();
  }
  
  if (!validManufacturers.includes(manufacturer as Manufacturer)) {
    notFound();
  }
  
  return (
    <Box>
      <ModelPriceEditor
        deviceType={deviceType as DeviceType}
        manufacturer={manufacturer as Manufacturer}
      />
    </Box>
  );
}
