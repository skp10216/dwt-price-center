/**
 * 단가표 통합 관리 시스템 - 등급 관리 페이지 (관리자)
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
  IconButton,
  Typography,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  DragIndicator as DragIndicatorIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import { gradesApi } from '@/lib/api';

interface Grade {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
}

export default function GradesPage() {
  const { enqueueSnackbar } = useSnackbar();
  
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_default: false,
  });
  
  // 등급 목록 조회
  const fetchGrades = async () => {
    setLoading(true);
    try {
      const response = await gradesApi.list();
      setGrades(response.data.data.grades as Grade[]);
    } catch (error) {
      enqueueSnackbar('등급 목록을 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchGrades();
  }, []);
  
  // 다이얼로그 열기
  const openDialog = (grade?: Grade) => {
    if (grade) {
      setEditingGrade(grade);
      setFormData({
        name: grade.name,
        description: grade.description || '',
        is_default: grade.is_default,
      });
    } else {
      setEditingGrade(null);
      setFormData({ name: '', description: '', is_default: false });
    }
    setDialogOpen(true);
  };
  
  // 등급 저장
  const handleSave = async () => {
    try {
      if (editingGrade) {
        await gradesApi.update(editingGrade.id, formData);
        enqueueSnackbar('등급이 수정되었습니다', { variant: 'success' });
      } else {
        await gradesApi.create(formData);
        enqueueSnackbar('등급이 생성되었습니다', { variant: 'success' });
      }
      setDialogOpen(false);
      fetchGrades();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '저장에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };
  
  // 등급 활성/비활성
  const handleToggleActive = async (grade: Grade) => {
    try {
      await gradesApi.update(grade.id, { is_active: !grade.is_active });
      enqueueSnackbar(
        grade.is_active ? '등급이 비활성화되었습니다' : '등급이 활성화되었습니다',
        { variant: 'success' }
      );
      fetchGrades();
    } catch (error) {
      enqueueSnackbar('상태 변경에 실패했습니다', { variant: 'error' });
    }
  };
  
  return (
    <Box>
      <PageHeader
        title="등급 관리"
        description="중고 기기 상태 등급을 관리합니다. 사용 중인 등급은 삭제할 수 없으며, 비활성화로 운영합니다."
        action={{
          label: '등급 추가',
          onClick: () => openDialog(),
        }}
      />
      
      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            등급은 정렬 순서대로 표시됩니다. 기본 등급은 비교 화면에서 기본으로 선택됩니다.
          </Typography>
          
          <List>
            {grades.map((grade) => (
              <ListItem
                key={grade.id}
                sx={{
                  bgcolor: grade.is_active ? 'transparent' : 'action.disabledBackground',
                  borderRadius: 1,
                  mb: 1,
                }}
              >
                <DragIndicatorIcon sx={{ mr: 2, color: 'text.disabled' }} />
                <ListItemText
                  primary={
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography fontWeight={600}>{grade.name}</Typography>
                      {grade.is_default && (
                        <Chip label="기본" size="small" color="primary" />
                      )}
                      {!grade.is_active && (
                        <Chip label="비활성" size="small" color="default" />
                      )}
                    </Stack>
                  }
                  secondary={grade.description}
                />
                <ListItemSecondaryAction>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={grade.is_active}
                        onChange={() => handleToggleActive(grade)}
                        size="small"
                      />
                    }
                    label=""
                  />
                  <IconButton onClick={() => openDialog(grade)}>
                    <EditIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
      
      {/* 등급 추가/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingGrade ? '등급 수정' : '등급 추가'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="등급명"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            margin="normal"
            required
            placeholder="예: A+, A, A-, B+"
          />
          <TextField
            fullWidth
            label="설명 (선택)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            margin="normal"
            multiline
            rows={2}
          />
          <FormControlLabel
            control={
              <Switch
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
              />
            }
            label="기본 등급으로 설정"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button onClick={handleSave} variant="contained" disabled={!formData.name.trim()}>
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
