/**
 * 변경 추적 바 (상단 고정)
 * 
 * 기능:
 * - 변경된 항목 수 표시
 * - 저장/취소 버튼
 * - 설정됨/미설정 통계
 */

'use client';

import { memo } from 'react';
import {
  Box,
  Paper,
  Stack,
  Chip,
  Button,
  Typography,
  Divider,
  CircularProgress,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  Save as SaveIcon,
  Undo as UndoIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { PriceStats, PriceChange } from './types';

interface ChangeTrackerProps {
  stats: PriceStats;
  changes: Map<string, PriceChange>;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  disabled?: boolean;
}

function ChangeTrackerComponent({
  stats,
  changes,
  onSave,
  onCancel,
  saving = false,
  disabled = false,
}: ChangeTrackerProps) {
  const changeCount = changes.size;
  const hasChanges = changeCount > 0;
  
  return (
    <Paper
      elevation={0}
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        p: 2,
        mb: 2,
        border: '1px solid',
        borderColor: hasChanges ? 'warning.main' : 'divider',
        borderRadius: 2,
        bgcolor: hasChanges ? 'warning.50' : 'background.paper',
        transition: 'all 0.2s ease',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={2}
      >
        {/* 좌측: 통계 */}
        <Stack direction="row" spacing={2} alignItems="center">
          {/* 설정됨 */}
          <Tooltip title="가격이 설정된 항목 수">
            <Chip
              icon={<CheckCircleIcon />}
              label={`설정됨 ${stats.configuredCount}`}
              color="success"
              variant="filled"
              sx={{ fontWeight: 600, fontSize: '0.85rem' }}
            />
          </Tooltip>
          
          {/* 미설정 */}
          <Tooltip title="가격이 설정되지 않은 항목 수">
            <Chip
              icon={stats.unconfiguredCount > 0 ? <ErrorIcon /> : <CheckCircleIcon />}
              label={`미설정 ${stats.unconfiguredCount}`}
              color={stats.unconfiguredCount > 0 ? 'error' : 'default'}
              variant={stats.unconfiguredCount > 0 ? 'filled' : 'outlined'}
              sx={{ fontWeight: 600, fontSize: '0.85rem' }}
            />
          </Tooltip>
          
          <Divider orientation="vertical" flexItem />
          
          <Typography variant="body2" color="text.secondary">
            총 {stats.totalModels}개 모델 · {stats.totalConfigurations}개 구성
          </Typography>
        </Stack>
        
        {/* 우측: 변경 상태 및 액션 */}
        <Stack direction="row" spacing={2} alignItems="center">
          {/* 변경 표시 */}
          {hasChanges ? (
            <Chip
              icon={<WarningIcon />}
              label={`${changeCount}개 변경됨`}
              color="warning"
              variant="filled"
              sx={{ 
                fontWeight: 700, 
                fontSize: '0.9rem',
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%, 100%': { transform: 'scale(1)' },
                  '50%': { transform: 'scale(1.02)' },
                },
              }}
            />
          ) : (
            <Chip
              icon={<CheckCircleIcon />}
              label="변경 없음"
              color="default"
              variant="outlined"
              sx={{ fontWeight: 500 }}
            />
          )}
          
          {/* 저장 버튼 */}
          <Button
            variant="contained"
            color="primary"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={onSave}
            disabled={!hasChanges || saving || disabled}
            sx={{ 
              fontWeight: 700,
              minWidth: 100,
              boxShadow: hasChanges ? '0 2px 8px rgba(25, 118, 210, 0.3)' : 'none',
            }}
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
          
          {/* 취소 버튼 */}
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<UndoIcon />}
            onClick={onCancel}
            disabled={!hasChanges || saving || disabled}
            sx={{ fontWeight: 600 }}
          >
            취소
          </Button>
        </Stack>
      </Stack>
      
      {/* 변경 내역 상세 (변경이 있을 때만) */}
      {hasChanges && (
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed', borderColor: 'warning.300' }}>
          <Typography variant="caption" color="warning.dark" fontWeight={600}>
            변경 내역 미리보기
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            {Array.from(changes.values()).slice(0, 5).map((change, idx) => (
              <Chip
                key={idx}
                size="small"
                label={`${change.gradeName}등급: ${change.originalPrice.toLocaleString()} → ${change.newPrice.toLocaleString()}`}
                variant="outlined"
                sx={{ fontSize: '0.7rem' }}
              />
            ))}
            {changes.size > 5 && (
              <Chip
                size="small"
                label={`외 ${changes.size - 5}개...`}
                variant="outlined"
                color="warning"
                sx={{ fontSize: '0.7rem' }}
              />
            )}
          </Stack>
        </Box>
      )}
    </Paper>
  );
}

export const ChangeTracker = memo(ChangeTrackerComponent);
