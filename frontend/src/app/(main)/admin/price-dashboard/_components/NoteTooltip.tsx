/**
 * 판매가 대시보드 - 비고 툴팁 컴포넌트
 * - PC: 마우스 호버 시 툴팁
 * - 모바일: 탭 시 팝오버
 */

'use client';

import { useState, MouseEvent, TouchEvent } from 'react';
import {
  Tooltip,
  IconButton,
  Popover,
  Typography,
  Box,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { ChatBubbleOutline as NoteIcon } from '@mui/icons-material';

interface NoteTooltipProps {
  content: string;
}

export function NoteTooltip({ content }: NoteTooltipProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  // 모바일: 팝오버 열기
  const handleClick = (event: MouseEvent<HTMLElement> | TouchEvent<HTMLElement>) => {
    if (isMobile) {
      setAnchorEl(event.currentTarget as HTMLElement);
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  // PC: 툴팁
  if (!isMobile) {
    return (
      <Tooltip
        title={
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {content}
          </Typography>
        }
        arrow
        placement="top"
      >
        <IconButton size="small" sx={{ p: 0.5 }}>
          <NoteIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        </IconButton>
      </Tooltip>
    );
  }

  // 모바일: 팝오버
  return (
    <>
      <IconButton size="small" sx={{ p: 0.5 }} onClick={handleClick}>
        <NoteIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
      >
        <Box sx={{ p: 2, maxWidth: 280 }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {content}
          </Typography>
        </Box>
      </Popover>
    </>
  );
}
