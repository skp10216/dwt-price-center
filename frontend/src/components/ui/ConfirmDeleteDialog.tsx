/**
 * 삭제 확인 Dialog - 영향 요약 + 사유 입력
 */

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

interface AffectedItem {
  id: string;
  name: string;
}

interface ConfirmDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  targetName: string;
  affectedCount?: number;
  affectedItems?: AffectedItem[];
  loading?: boolean;
}

export default function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
  title,
  targetName,
  affectedCount,
  affectedItems,
  loading = false,
}: ConfirmDeleteDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    onConfirm(reason);
    setReason('');
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        {title}
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <strong>{targetName}</strong>을(를) 삭제하시겠습니까?
        </Alert>

        {affectedCount !== undefined && affectedCount > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              영향 범위
            </Typography>
            <Chip
              label={`소속 거래처 ${affectedCount}개`}
              color="warning"
              size="small"
              sx={{ mb: 1 }}
            />
            {affectedItems && affectedItems.length > 0 && (
              <List dense sx={{ maxHeight: 150, overflow: 'auto', bgcolor: 'grey.50', borderRadius: 1 }}>
                {affectedItems.map((item) => (
                  <ListItem key={item.id}>
                    <ListItemText primary={item.name} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}

        <TextField
          fullWidth
          label="삭제 사유 (선택)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          multiline
          rows={2}
          placeholder="삭제 사유를 입력하세요"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>취소</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          disabled={loading}
        >
          삭제
        </Button>
      </DialogActions>
    </Dialog>
  );
}
