/**
 * 상태 표시 칩 컴포넌트
 *
 * SSOT: 모든 상태 표시는 이 컴포넌트를 사용
 * - Semantic 색상 원칙 준수
 * - 일관된 크기/스타일
 *
 * 상태 종류:
 * - configured: 설정됨 (success)
 * - unconfigured: 미설정 (warning)
 * - changed: 변경됨 (info)
 * - pending: 보류 중 (secondary)
 * - error: 오류 (error)
 * - active: 활성 (success)
 * - inactive: 비활성 (text.secondary)
 *
 * 사용 예시:
 * <StatusChip status="configured" />              // 설정됨
 * <StatusChip status="unconfigured" size="small" /> // 미설정 (작은 크기)
 */

'use client';

import { Chip, type ChipProps } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  HourglassEmpty as PendingIcon,
  Error as ErrorIcon,
  Circle as CircleIcon,
  RemoveCircle as InactiveIcon,
  ChangeCircle as ChangedIcon,
} from '@mui/icons-material';

export type StatusType =
  | 'configured'    // 설정됨
  | 'unconfigured'  // 미설정
  | 'changed'       // 변경됨
  | 'pending'       // 보류 중
  | 'error'         // 오류
  | 'active'        // 활성
  | 'inactive'      // 비활성
  | 'new'           // 신규
  | 'updated'       // 업데이트됨
  | 'deleted';      // 삭제됨

export interface StatusChipProps {
  /** 상태 타입 */
  status: StatusType;
  /** 칩 크기 (기본값: 'small') */
  size?: ChipProps['size'];
  /** 변형 (기본값: 'filled') */
  variant?: ChipProps['variant'];
  /** 커스텀 라벨 (기본값: 상태별 기본 라벨) */
  label?: string;
  /** 아이콘 표시 여부 (기본값: true) */
  showIcon?: boolean;
  /** 추가 sx props */
  sx?: ChipProps['sx'];
  /** 클릭 핸들러 */
  onClick?: () => void;
}

// 상태별 설정
const statusConfig: Record<
  StatusType,
  {
    label: string;
    color: ChipProps['color'];
    icon: React.ReactElement;
  }
> = {
  configured: {
    label: '설정됨',
    color: 'success',
    icon: <CheckCircleIcon />,
  },
  unconfigured: {
    label: '미설정',
    color: 'warning',
    icon: <WarningIcon />,
  },
  changed: {
    label: '변경됨',
    color: 'info',
    icon: <ChangedIcon />,
  },
  pending: {
    label: '보류',
    color: 'secondary',
    icon: <PendingIcon />,
  },
  error: {
    label: '오류',
    color: 'error',
    icon: <ErrorIcon />,
  },
  active: {
    label: '활성',
    color: 'success',
    icon: <CircleIcon />,
  },
  inactive: {
    label: '비활성',
    color: 'default',
    icon: <InactiveIcon />,
  },
  new: {
    label: '신규',
    color: 'primary',
    icon: <CircleIcon />,
  },
  updated: {
    label: '업데이트됨',
    color: 'info',
    icon: <InfoIcon />,
  },
  deleted: {
    label: '삭제됨',
    color: 'error',
    icon: <ErrorIcon />,
  },
};

export function StatusChip({
  status,
  size = 'small',
  variant = 'filled',
  label,
  showIcon = true,
  sx,
  onClick,
}: StatusChipProps) {
  const config = statusConfig[status];

  return (
    <Chip
      label={label || config.label}
      size={size}
      color={config.color}
      variant={variant}
      icon={showIcon ? config.icon : undefined}
      onClick={onClick}
      sx={{
        fontWeight: 600,
        ...sx,
      }}
    />
  );
}

/**
 * 가격 설정 상태 칩 (StatusChip 래퍼)
 *
 * 사용 예시:
 * <PriceStatusChip isConfigured={true} />   // 설정됨 (success)
 * <PriceStatusChip isConfigured={false} />  // 미설정 (warning)
 */
export interface PriceStatusChipProps {
  /** 가격 설정 여부 */
  isConfigured: boolean;
  /** 칩 크기 */
  size?: ChipProps['size'];
  /** 추가 sx props */
  sx?: ChipProps['sx'];
}

export function PriceStatusChip({
  isConfigured,
  size = 'small',
  sx,
}: PriceStatusChipProps) {
  return (
    <StatusChip
      status={isConfigured ? 'configured' : 'unconfigured'}
      size={size}
      sx={sx}
    />
  );
}

/**
 * 활성/비활성 상태 칩 (StatusChip 래퍼)
 *
 * 사용 예시:
 * <ActiveStatusChip isActive={true} />   // 활성 (success)
 * <ActiveStatusChip isActive={false} />  // 비활성 (default)
 */
export interface ActiveStatusChipProps {
  /** 활성 여부 */
  isActive: boolean;
  /** 칩 크기 */
  size?: ChipProps['size'];
  /** 추가 sx props */
  sx?: ChipProps['sx'];
}

export function ActiveStatusChip({
  isActive,
  size = 'small',
  sx,
}: ActiveStatusChipProps) {
  return (
    <StatusChip
      status={isActive ? 'active' : 'inactive'}
      size={size}
      sx={sx}
    />
  );
}

export default StatusChip;
