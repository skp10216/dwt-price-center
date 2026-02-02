/**
 * 단가표 통합 관리 시스템 - 차감 관리 페이지 (관리자)
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import { deductionsApi } from '@/lib/api';

interface DeductionLevel {
  id: string;
  item_id: string;
  name: string;
  amount: number;
  sort_order: number;
  is_active: boolean;
}

interface DeductionItem {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  levels: DeductionLevel[];
}

export default function DeductionsPage() {
  const { enqueueSnackbar } = useSnackbar();
  
  const [items, setItems] = useState<DeductionItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DeductionItem | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', description: '' });
  
  const [levelDialogOpen, setLevelDialogOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<DeductionLevel | null>(null);
  const [levelItemId, setLevelItemId] = useState<string | null>(null);
  const [levelForm, setLevelForm] = useState({ name: '', amount: 0 });
  
  // 차감 항목 목록 조회
  const fetchItems = async () => {
    setLoading(true);
    try {
      const response = await deductionsApi.list();
      setItems(response.data.data.items as DeductionItem[]);
    } catch (error) {
      enqueueSnackbar('차감 항목을 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchItems();
  }, []);
  
  // 항목 다이얼로그 열기
  const openItemDialog = (item?: DeductionItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({ name: item.name, description: item.description || '' });
    } else {
      setEditingItem(null);
      setItemForm({ name: '', description: '' });
    }
    setItemDialogOpen(true);
  };
  
  // 레벨 다이얼로그 열기
  const openLevelDialog = (itemId: string, level?: DeductionLevel) => {
    setLevelItemId(itemId);
    if (level) {
      setEditingLevel(level);
      setLevelForm({ name: level.name, amount: level.amount });
    } else {
      setEditingLevel(null);
      setLevelForm({ name: '', amount: 0 });
    }
    setLevelDialogOpen(true);
  };
  
  // 항목 저장
  const handleSaveItem = async () => {
    try {
      if (editingItem) {
        await deductionsApi.update(editingItem.id, itemForm);
        enqueueSnackbar('항목이 수정되었습니다', { variant: 'success' });
      } else {
        await deductionsApi.create(itemForm);
        enqueueSnackbar('항목이 생성되었습니다', { variant: 'success' });
      }
      setItemDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '저장에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };
  
  // 레벨 저장
  const handleSaveLevel = async () => {
    if (!levelItemId) return;
    
    try {
      if (editingLevel) {
        await deductionsApi.updateLevel(levelItemId, editingLevel.id, levelForm);
        enqueueSnackbar('레벨이 수정되었습니다', { variant: 'success' });
      } else {
        await deductionsApi.createLevel(levelItemId, levelForm);
        enqueueSnackbar('레벨이 생성되었습니다', { variant: 'success' });
      }
      setLevelDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '저장에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };
  
  // 항목 활성/비활성
  const handleToggleItemActive = async (item: DeductionItem) => {
    try {
      await deductionsApi.update(item.id, { is_active: !item.is_active });
      enqueueSnackbar(
        item.is_active ? '항목이 비활성화되었습니다' : '항목이 활성화되었습니다',
        { variant: 'success' }
      );
      fetchItems();
    } catch (error) {
      enqueueSnackbar('상태 변경에 실패했습니다', { variant: 'error' });
    }
  };
  
  return (
    <Box>
      <PageHeader
        title="차감 관리"
        description="상태 이슈별 고정 금액 차감 항목을 관리합니다. 최종가 = 등급별 기본가 - Σ(선택된 차감 금액)"
        action={{
          label: '항목 추가',
          onClick: () => openItemDialog(),
        }}
      />
      
      {items.length === 0 && !loading ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary" align="center">
              등록된 차감 항목이 없습니다
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {items.map((item) => (
            <Accordion key={item.id} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%', pr: 2 }}>
                  <Typography fontWeight={600}>{item.name}</Typography>
                  {!item.is_active && <Chip label="비활성" size="small" color="default" />}
                  <Box sx={{ flexGrow: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    {item.levels.length}개 레벨
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="body2" color="text.secondary">
                    {item.description || '설명 없음'}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={item.is_active}
                          onChange={() => handleToggleItemActive(item)}
                          size="small"
                        />
                      }
                      label="활성"
                    />
                    <IconButton size="small" onClick={() => openItemDialog(item)}>
                      <EditIcon />
                    </IconButton>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => openLevelDialog(item.id)}
                    >
                      레벨 추가
                    </Button>
                  </Stack>
                </Stack>
                
                {item.levels.length > 0 && (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>레벨명</TableCell>
                        <TableCell align="right">차감 금액</TableCell>
                        <TableCell align="center">상태</TableCell>
                        <TableCell align="right">수정</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {item.levels.map((level) => (
                        <TableRow key={level.id}>
                          <TableCell>{level.name}</TableCell>
                          <TableCell align="right">{level.amount.toLocaleString()}원</TableCell>
                          <TableCell align="center">
                            <Chip
                              label={level.is_active ? '활성' : '비활성'}
                              size="small"
                              color={level.is_active ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <IconButton size="small" onClick={() => openLevelDialog(item.id, level)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      )}
      
      {/* 항목 추가/수정 다이얼로그 */}
      <Dialog open={itemDialogOpen} onClose={() => setItemDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingItem ? '항목 수정' : '항목 추가'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="항목명"
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            margin="normal"
            required
            placeholder="예: 내부 잔상, 서브 잔상, 줄감"
          />
          <TextField
            fullWidth
            label="설명 (선택)"
            value={itemForm.description}
            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
            margin="normal"
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDialogOpen(false)}>취소</Button>
          <Button onClick={handleSaveItem} variant="contained" disabled={!itemForm.name.trim()}>
            저장
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* 레벨 추가/수정 다이얼로그 */}
      <Dialog open={levelDialogOpen} onClose={() => setLevelDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingLevel ? '레벨 수정' : '레벨 추가'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="레벨명"
            value={levelForm.name}
            onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })}
            margin="normal"
            required
            placeholder="예: L1, L2, L3 또는 중상, 상"
          />
          <TextField
            fullWidth
            label="차감 금액"
            type="number"
            value={levelForm.amount}
            onChange={(e) => setLevelForm({ ...levelForm, amount: parseInt(e.target.value) || 0 })}
            margin="normal"
            required
            InputProps={{ endAdornment: <Typography variant="body2">원</Typography> }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLevelDialogOpen(false)}>취소</Button>
          <Button onClick={handleSaveLevel} variant="contained" disabled={!levelForm.name.trim()}>
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
