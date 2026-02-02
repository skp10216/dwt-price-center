/**
 * 단가표 통합 관리 시스템 - Page Header 컴포넌트
 * 제목/설명/CTA/상태 표시
 */

'use client';

import { Box, Typography, Chip, Button, Stack } from '@mui/material';

interface PageHeaderProps {
  title: string;
  description?: string;
  status?: {
    label: string;
    color: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  };
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'contained' | 'outlined' | 'text';
    color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
    disabled?: boolean;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    variant?: 'contained' | 'outlined' | 'text';
    color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
    disabled?: boolean;
  };
}

export default function PageHeader({
  title,
  description,
  status,
  action,
  secondaryAction,
}: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        mb: 3,
      }}
    >
      <Box>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h4" component="h1" fontWeight={700}>
            {title}
          </Typography>
          {status && (
            <Chip
              label={status.label}
              color={status.color}
              size="small"
            />
          )}
        </Stack>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        )}
      </Box>
      
      <Stack direction="row" spacing={1}>
        {secondaryAction && (
          <Button
            variant={secondaryAction.variant || 'outlined'}
            color={secondaryAction.color || 'primary'}
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
          >
            {secondaryAction.label}
          </Button>
        )}
        {action && (
          <Button
            variant={action.variant || 'contained'}
            color={action.color || 'primary'}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
