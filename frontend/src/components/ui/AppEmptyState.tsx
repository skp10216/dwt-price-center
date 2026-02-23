/**
 * AppEmptyStateCompact - 빈 상태 표시 컴포넌트 (컴팩트)
 *
 * 사용 목적: 테이블/리스트/카드 등에서 데이터가 없을 때 표시
 * 과도한 일러스트/애니메이션 없이, 아이콘 + 텍스트 + 선택적 액션만 표시
 *
 * 사용 예시:
 * <AppEmptyStateCompact
 *   icon={<InboxIcon />}
 *   message="전표가 없습니다"
 *   description="UPM 업로드를 통해 전표를 등록해주세요."
 *   action={{ label: 'UPM 업로드', onClick: () => router.push('/upload') }}
 * />
 */

'use client';

import { Box, Typography, Button, Stack, type SxProps, type Theme } from '@mui/material';
import { Inbox as InboxIcon } from '@mui/icons-material';

export interface AppEmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'text' | 'outlined' | 'contained';
  color?: 'primary' | 'secondary' | 'info';
}

export interface AppEmptyStateCompactProps {
  /** 아이콘 (기본: InboxIcon) */
  icon?: React.ReactNode;
  /** 주 메시지 */
  message: string;
  /** 보조 설명 */
  description?: string;
  /** 액션 버튼 */
  action?: AppEmptyStateAction;
  /** 높이 (기본: auto, 최소 120px) */
  minHeight?: number;
  /** 추가 sx */
  sx?: SxProps<Theme>;
}

export default function AppEmptyStateCompact({
  icon,
  message,
  description,
  action,
  minHeight = 120,
  sx,
}: AppEmptyStateCompactProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        py: 4,
        px: 2,
        color: 'text.secondary',
        ...sx,
      }}
    >
      <Box sx={{ mb: 1, opacity: 0.4 }}>
        {icon ?? <InboxIcon sx={{ fontSize: 36 }} />}
      </Box>
      <Typography variant="body2" fontWeight={500} color="text.secondary">
        {message}
      </Typography>
      {description && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.5, textAlign: 'center', maxWidth: 360, opacity: 0.8 }}
        >
          {description}
        </Typography>
      )}
      {action && (
        <Button
          size="small"
          variant={action.variant ?? 'outlined'}
          color={action.color ?? 'primary'}
          onClick={action.onClick}
          sx={{ mt: 1.5, fontSize: '0.8125rem' }}
        >
          {action.label}
        </Button>
      )}
    </Box>
  );
}
