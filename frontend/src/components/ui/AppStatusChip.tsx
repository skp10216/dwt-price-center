/**
 * AppStatusChip - Semantic 상태 칩 (통일 컴포넌트)
 *
 * 상태 표현 규칙 (SSOT):
 * - success: 완료/활성/설정됨/확정
 * - warning: 미설정/보류/주의/변경됨
 * - error: 오류/미정산/삭제/취소
 * - info: 정보/업데이트/신규/진행중
 * - neutral: 비활성/기본/마감
 *
 * 모든 페이지에서 상태 표시는 이 컴포넌트 또는 하위 래퍼만 사용
 *
 * 사용 예시:
 * <AppStatusChip semantic="success" label="정산완료" />
 * <AppStatusChip semantic="error" label="미정산" icon={<WarningIcon />} />
 * <AppStatusChip semantic="neutral" label="마감" variant="outlined" />
 */

'use client';

import { Chip, type ChipProps } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

// ─── Semantic 타입 정의 ──────────────────────────────────────────────────────

export type SemanticStatus = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface AppStatusChipProps {
  /** Semantic 상태 */
  semantic: SemanticStatus;
  /** 표시 라벨 */
  label: string;
  /** 좌측 아이콘 (선택) */
  icon?: React.ReactElement;
  /** 칩 변형 (기본: 'filled') */
  variant?: 'filled' | 'outlined';
  /** 크기 (기본: 'small') */
  size?: ChipProps['size'];
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 추가 sx */
  sx?: ChipProps['sx'];
}

// Semantic → MUI Chip color 매핑
const semanticToChipColor: Record<SemanticStatus, ChipProps['color']> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'info',
  neutral: 'default',
};

export function AppStatusChip({
  semantic,
  label,
  icon,
  variant = 'filled',
  size = 'small',
  onClick,
  sx,
}: AppStatusChipProps) {
  const theme = useTheme();
  const chipColor = semanticToChipColor[semantic];

  // neutral은 MUI 기본 'default'로 매핑하되, 시각적으로 구분
  const neutralSx =
    semantic === 'neutral'
      ? {
          bgcolor:
            variant === 'filled'
              ? theme.palette.mode === 'light'
                ? alpha(theme.palette.text.secondary, 0.12)
                : alpha(theme.palette.text.secondary, 0.2)
              : 'transparent',
          color: theme.palette.text.secondary,
          borderColor:
            variant === 'outlined'
              ? alpha(theme.palette.text.secondary, 0.3)
              : 'transparent',
        }
      : {};

  return (
    <Chip
      label={label}
      size={size}
      color={chipColor}
      variant={variant}
      icon={icon}
      onClick={onClick}
      sx={{
        fontWeight: 600,
        letterSpacing: '0.01em',
        ...neutralSx,
        ...sx,
      }}
    />
  );
}

// ─── 편의 래퍼들 ─────────────────────────────────────────────────────────────

/** 정산 상태 칩 */
export function SettlementStatusChip({
  status,
  ...props
}: {
  status: 'open' | 'settling' | 'settled' | 'locked';
} & Omit<AppStatusChipProps, 'semantic' | 'label'>) {
  const map: Record<string, { semantic: SemanticStatus; label: string }> = {
    open: { semantic: 'error', label: '미정산' },
    settling: { semantic: 'warning', label: '정산중' },
    settled: { semantic: 'success', label: '정산완료' },
    locked: { semantic: 'neutral', label: '마감' },
  };
  const config = map[status] ?? { semantic: 'neutral', label: status };
  return <AppStatusChip {...props} semantic={config.semantic} label={config.label} />;
}

/** 지급 상태 칩 */
export function PaymentStatusChip({
  status,
  ...props
}: {
  status: 'unpaid' | 'partial' | 'paid' | 'locked';
} & Omit<AppStatusChipProps, 'semantic' | 'label'>) {
  const map: Record<string, { semantic: SemanticStatus; label: string }> = {
    unpaid: { semantic: 'error', label: '미지급' },
    partial: { semantic: 'warning', label: '부분지급' },
    paid: { semantic: 'success', label: '지급완료' },
    locked: { semantic: 'neutral', label: '마감' },
  };
  const config = map[status] ?? { semantic: 'neutral', label: status };
  return <AppStatusChip {...props} semantic={config.semantic} label={config.label} />;
}

/** 업로드 작업 상태 칩 */
export function UploadJobStatusChip({
  status,
  ...props
}: {
  status: string;
} & Omit<AppStatusChipProps, 'semantic' | 'label'>) {
  const map: Record<string, { semantic: SemanticStatus; label: string }> = {
    pending: { semantic: 'warning', label: '대기' },
    running: { semantic: 'info', label: '진행중' },
    completed: { semantic: 'success', label: '완료' },
    confirmed: { semantic: 'success', label: '확정' },
    failed: { semantic: 'error', label: '실패' },
    cancelled: { semantic: 'neutral', label: '취소' },
  };
  const config = map[status] ?? { semantic: 'neutral', label: status };
  return <AppStatusChip {...props} semantic={config.semantic} label={config.label} />;
}

/** 활성/비활성 칩 */
export function ActiveChip({
  isActive,
  ...props
}: {
  isActive: boolean;
} & Omit<AppStatusChipProps, 'semantic' | 'label'>) {
  return (
    <AppStatusChip
      {...props}
      semantic={isActive ? 'success' : 'neutral'}
      label={isActive ? '활성' : '비활성'}
    />
  );
}

/** 가격 설정 상태 칩 */
export function PriceConfigChip({
  isConfigured,
  ...props
}: {
  isConfigured: boolean;
} & Omit<AppStatusChipProps, 'semantic' | 'label'>) {
  return (
    <AppStatusChip
      {...props}
      semantic={isConfigured ? 'success' : 'warning'}
      label={isConfigured ? '설정됨' : '미설정'}
    />
  );
}

export default AppStatusChip;
