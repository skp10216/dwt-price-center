/**
 * 리사이즈 가능한 분할 패널 컴포넌트
 * - 드래그로 좌우 비율 조절
 * - localStorage에 비율 저장
 * - 더블클릭으로 50:50 리셋
 */

'use client';

import { useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { Box, alpha, useTheme } from '@mui/material';

interface ResizableSplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  storageKey?: string;
  defaultLeftWidth?: number; // 퍼센트 (0-100)
  minLeftWidth?: number;     // 퍼센트
  maxLeftWidth?: number;     // 퍼센트
}

export function ResizableSplitPane({
  left,
  right,
  storageKey = 'splitPane-leftWidth',
  defaultLeftWidth = 50,
  minLeftWidth = 25,
  maxLeftWidth = 75,
}: ResizableSplitPaneProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);

  // localStorage에서 저장된 비율 복원
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= minLeftWidth && parsed <= maxLeftWidth) {
        setLeftWidth(parsed);
      }
    }
  }, [storageKey, minLeftWidth, maxLeftWidth]);

  // 비율 변경 시 localStorage에 저장
  const saveWidth = useCallback((width: number) => {
    localStorage.setItem(storageKey, width.toString());
  }, [storageKey]);

  // 드래그 시작
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // 드래그 중
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = (x / rect.width) * 100;

      // 범위 제한
      const clampedWidth = Math.max(minLeftWidth, Math.min(maxLeftWidth, percentage));
      setLeftWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      saveWidth(leftWidth);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, leftWidth, minLeftWidth, maxLeftWidth, saveWidth]);

  // 더블클릭으로 50:50 리셋
  const handleDoubleClick = useCallback(() => {
    setLeftWidth(50);
    saveWidth(50);
  }, [saveWidth]);

  return (
    <Box
      ref={containerRef}
      sx={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        userSelect: isDragging ? 'none' : 'auto',
      }}
    >
      {/* 왼쪽 패널 */}
      <Box
        sx={{
          width: `${leftWidth}%`,
          height: '100%',
          overflow: 'hidden',
          transition: isDragging ? 'none' : 'width 0.1s ease',
        }}
      >
        {left}
      </Box>

      {/* 리사이즈 핸들 */}
      <Box
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        sx={{
          width: 8,
          height: '100%',
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: isDragging ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
          transition: 'background-color 0.2s',
          '&:hover': {
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            '& .resize-handle': {
              bgcolor: theme.palette.primary.main,
              height: 60,
            },
          },
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        {/* 시각적 핸들 바 */}
        <Box
          className="resize-handle"
          sx={{
            width: 4,
            height: 40,
            borderRadius: 2,
            bgcolor: isDragging ? theme.palette.primary.main : theme.palette.divider,
            transition: 'all 0.2s',
          }}
        />
      </Box>

      {/* 오른쪽 패널 */}
      <Box
        sx={{
          flex: 1,
          height: '100%',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {right}
      </Box>

      {/* 드래그 중 오버레이 (드래그 영역 확장) */}
      {isDragging && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            cursor: 'col-resize',
            zIndex: 9999,
          }}
        />
      )}
    </Box>
  );
}
