/**
 * 단가표 통합 관리 시스템 - Job Status Banner 컴포넌트
 * 업로드 작업 상태 표시 (queued/running/succeeded/failed)
 */

'use client';

import { Box, Typography, LinearProgress, Chip, Stack, Alert } from '@mui/material';
import {
  HourglassEmpty as QueuedIcon,
  Sync as RunningIcon,
  CheckCircle as SucceededIcon,
  Error as FailedIcon,
} from '@mui/icons-material';

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

interface JobStatusBannerProps {
  status: JobStatus;
  progress: number;
  error?: string | null;
  filename?: string;
  summary?: {
    total_rows?: number;
    matched_count?: number;
    unmatched_count?: number;
    low_confidence_count?: number;
  } | null;
}

const statusConfig: Record<
  JobStatus,
  { label: string; color: 'default' | 'info' | 'success' | 'error'; Icon: typeof QueuedIcon }
> = {
  queued: { label: '대기 중', color: 'default', Icon: QueuedIcon },
  running: { label: '처리 중', color: 'info', Icon: RunningIcon },
  succeeded: { label: '완료', color: 'success', Icon: SucceededIcon },
  failed: { label: '실패', color: 'error', Icon: FailedIcon },
};

export default function JobStatusBanner({
  status,
  progress,
  error,
  filename,
  summary,
}: JobStatusBannerProps) {
  const config = statusConfig[status];
  const Icon = config.Icon;

  return (
    <Box sx={{ mb: 3 }}>
      <Alert
        severity={
          status === 'succeeded'
            ? 'success'
            : status === 'failed'
            ? 'error'
            : status === 'running'
            ? 'info'
            : 'warning'
        }
        icon={<Icon />}
      >
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography fontWeight={600}>{config.label}</Typography>
            {filename && (
              <Typography variant="body2" color="text.secondary">
                {filename}
              </Typography>
            )}
          </Stack>

          {status === 'running' && (
            <Box sx={{ width: '100%' }}>
              <LinearProgress
                variant={progress > 0 ? 'determinate' : 'indeterminate'}
                value={progress}
              />
              <Typography variant="caption" color="text.secondary">
                {progress}% 완료
              </Typography>
            </Box>
          )}

          {status === 'failed' && error && (
            <Typography color="error.dark" variant="body2">
              {error}
            </Typography>
          )}

          {status === 'succeeded' && summary && (
            <Stack direction="row" spacing={1}>
              <Chip
                label={`전체 ${summary.total_rows}행`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`매핑 ${summary.matched_count}`}
                size="small"
                color="success"
              />
              {(summary.low_confidence_count || 0) > 0 && (
                <Chip
                  label={`저신뢰 ${summary.low_confidence_count}`}
                  size="small"
                  color="warning"
                />
              )}
              {(summary.unmatched_count || 0) > 0 && (
                <Chip
                  label={`미매핑 ${summary.unmatched_count}`}
                  size="small"
                  color="error"
                />
              )}
            </Stack>
          )}
        </Stack>
      </Alert>
    </Box>
  );
}
