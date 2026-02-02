/**
 * 단가표 통합 관리 시스템 - Confirm Dialog 컴포넌트
 * 확정/적용/숨김 등 위험 동작 확인
 * 
 * - message: 단순 텍스트 메시지
 * - children: 복잡한 요약 정보 (일괄 등록 확정 등)
 */

'use client';

import { ReactNode } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  CircularProgress,
  Breakpoint,
} from '@mui/material';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** 단순 텍스트 메시지 (children이 있으면 무시됨) */
  message?: string;
  /** 복잡한 커스텀 컨텐츠 (일괄 등록 요약 등) */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  loading?: boolean;
  /** 다이얼로그 최대 너비 (기본: xs, 요약 정보 포함 시 sm 권장) */
  maxWidth?: Breakpoint | false;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmColor = 'primary',
  loading = false,
  maxWidth = 'xs',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onCancel}
      maxWidth={maxWidth}
      fullWidth
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {children ? (
          children
        ) : (
          <DialogContentText>{message}</DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onCancel}
          disabled={loading}
          color="inherit"
        >
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          color={confirmColor}
          variant="contained"
          autoFocus
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
