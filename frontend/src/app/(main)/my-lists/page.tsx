/**
 * 단가표 통합 관리 시스템 - 내 리스트 페이지
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  IconButton,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Star as StarIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { myListsApi } from '@/lib/api';

interface UserList {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  item_count: number;
}

interface ListItem {
  id: string;
  model_id: string;
  model_code: string;
  model_name: string;
  storage_display: string;
}

export default function MyListsPage() {
  const { enqueueSnackbar } = useSnackbar();
  
  const [lists, setLists] = useState<UserList[]>([]);
  const [favorites, setFavorites] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<UserList | null>(null);
  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; list: UserList | null }>({
    open: false,
    list: null,
  });
  
  const [selectedList, setSelectedList] = useState<UserList | null>(null);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  
  // 리스트 목록 조회
  const fetchLists = async () => {
    try {
      const response = await myListsApi.list();
      setLists(response.data.data.lists as UserList[]);
    } catch (error) {
      enqueueSnackbar('리스트를 불러오는데 실패했습니다', { variant: 'error' });
    }
  };
  
  // 즐겨찾기 조회
  const fetchFavorites = async () => {
    try {
      const response = await myListsApi.getFavorites();
      setFavorites(response.data.data.favorites as ListItem[]);
    } catch (error) {
      // 조용히 실패
    }
  };
  
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchLists(), fetchFavorites()]);
      setLoading(false);
    };
    init();
  }, []);
  
  // 리스트 상세 조회
  const handleSelectList = async (list: UserList) => {
    setSelectedList(list);
    try {
      const response = await myListsApi.get(list.id);
      const data = response.data.data as any;
      setListItems(data.items || []);
    } catch (error) {
      enqueueSnackbar('리스트 상세를 불러오는데 실패했습니다', { variant: 'error' });
    }
  };
  
  // 리스트 생성/수정
  const handleSaveList = async () => {
    try {
      if (editingList) {
        await myListsApi.update(editingList.id, {
          name: listName,
          description: listDescription || null,
        });
        enqueueSnackbar('리스트가 수정되었습니다', { variant: 'success' });
      } else {
        await myListsApi.create({
          name: listName,
          description: listDescription || null,
        });
        enqueueSnackbar('리스트가 생성되었습니다', { variant: 'success' });
      }
      setDialogOpen(false);
      setEditingList(null);
      setListName('');
      setListDescription('');
      fetchLists();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '저장에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    }
  };
  
  // 리스트 삭제
  const handleDeleteList = async () => {
    if (!deleteDialog.list) return;
    
    try {
      await myListsApi.delete(deleteDialog.list.id);
      enqueueSnackbar('리스트가 삭제되었습니다', { variant: 'success' });
      setDeleteDialog({ open: false, list: null });
      if (selectedList?.id === deleteDialog.list.id) {
        setSelectedList(null);
        setListItems([]);
      }
      fetchLists();
    } catch (error) {
      enqueueSnackbar('삭제에 실패했습니다', { variant: 'error' });
    }
  };
  
  // 리스트에서 모델 제거
  const handleRemoveItem = async (modelId: string) => {
    if (!selectedList) return;
    
    try {
      await myListsApi.removeItems(selectedList.id, [modelId]);
      setListItems((prev) => prev.filter((item) => item.model_id !== modelId));
      fetchLists();
      enqueueSnackbar('모델이 제거되었습니다', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('제거에 실패했습니다', { variant: 'error' });
    }
  };
  
  const openEditDialog = (list: UserList) => {
    setEditingList(list);
    setListName(list.name);
    setListDescription(list.description || '');
    setDialogOpen(true);
  };
  
  const openCreateDialog = () => {
    setEditingList(null);
    setListName('');
    setListDescription('');
    setDialogOpen(true);
  };
  
  return (
    <Box>
      <PageHeader
        title="내 리스트"
        description="자주 보는 모델을 리스트로 관리하세요"
        actions={[{
          label: '리스트 만들기',
          onClick: openCreateDialog,
        }]}
      />
      
      <Grid container spacing={3}>
        {/* 즐겨찾기 */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <StarIcon color="warning" />
                <Typography variant="h6">즐겨찾기</Typography>
                <Chip label={favorites.length} size="small" />
              </Stack>
              {favorites.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  즐겨찾기한 모델이 없습니다
                </Typography>
              ) : (
                <List dense>
                  {favorites.slice(0, 10).map((item) => (
                    <ListItem key={item.id}>
                      <ListItemText
                        primary={item.model_name}
                        secondary={item.storage_display}
                      />
                    </ListItem>
                  ))}
                  {favorites.length > 10 && (
                    <Typography variant="caption" color="text.secondary">
                      외 {favorites.length - 10}개
                    </Typography>
                  )}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        {/* 리스트 목록 */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                내 리스트
              </Typography>
              {lists.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  생성된 리스트가 없습니다
                </Typography>
              ) : (
                <List>
                  {lists.map((list) => (
                    <ListItem
                      key={list.id}
                      button
                      selected={selectedList?.id === list.id}
                      onClick={() => handleSelectList(list)}
                    >
                      <ListItemText
                        primary={
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <span>{list.name}</span>
                            {list.is_default && (
                              <Chip label="기본" size="small" color="primary" />
                            )}
                          </Stack>
                        }
                        secondary={`${list.item_count}개 모델`}
                      />
                      <ListItemSecondaryAction>
                        <IconButton size="small" onClick={() => openEditDialog(list)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => setDeleteDialog({ open: true, list })}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        {/* 선택된 리스트 상세 */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              {selectedList ? (
                <>
                  <Typography variant="h6" mb={2}>
                    {selectedList.name}
                  </Typography>
                  {listItems.length === 0 ? (
                    <Typography color="text.secondary" variant="body2">
                      리스트가 비어 있습니다
                    </Typography>
                  ) : (
                    <List dense>
                      {listItems.map((item) => (
                        <ListItem key={item.id}>
                          <ListItemText
                            primary={item.model_name}
                            secondary={`${item.storage_display} | ${item.model_code}`}
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              size="small"
                              onClick={() => handleRemoveItem(item.model_id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </>
              ) : (
                <Typography color="text.secondary" variant="body2">
                  리스트를 선택하세요
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* 리스트 생성/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingList ? '리스트 수정' : '리스트 만들기'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="리스트 이름"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="설명 (선택)"
            value={listDescription}
            onChange={(e) => setListDescription(e.target.value)}
            margin="normal"
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button onClick={handleSaveList} variant="contained" disabled={!listName.trim()}>
            저장
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={deleteDialog.open}
        title="리스트 삭제"
        message={`"${deleteDialog.list?.name}" 리스트를 삭제하시겠습니까?`}
        confirmLabel="삭제"
        confirmColor="error"
        onConfirm={handleDeleteList}
        onCancel={() => setDeleteDialog({ open: false, list: null })}
      />
    </Box>
  );
}
