/**
 * 삭제된 모델 히스토리 모달
 * 
 * 삭제된 모델의 이력을 조회하고 확인할 수 있습니다.
 * - 삭제 일시
 * - 삭제한 사용자
 * - 삭제된 모델 정보
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  IconButton,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Stack,
  Avatar,
  Paper,
  Pagination,
  Tooltip,
  TextField,
  InputAdornment,
  Collapse,
  useTheme,
  alpha,
  Badge,
} from '@mui/material';
import {
  Close as CloseIcon,
  DeleteForever as DeleteIcon,
  Person as PersonIcon,
  AccessTime as TimeIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Storage as StorageIcon,
  Smartphone as SmartphoneIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { ssotModelsApi, DeletedModelHistoryItem } from '@/lib/api';

interface DeletedHistoryModalProps {
  open: boolean;
  onClose: () => void;
  deviceType?: string;
  manufacturer?: string;
}

export function DeletedHistoryModal({
  open,
  onClose,
  deviceType,
  manufacturer,
}: DeletedHistoryModalProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DeletedModelHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const pageSize = 20;

  // 히스토리 로드
  const loadHistory = useCallback(async () => {
    if (!open) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await ssotModelsApi.getDeletedHistory({
        page,
        page_size: pageSize,
        device_type: deviceType,
        manufacturer: manufacturer,
        search: search || undefined,
      });
      setHistory(res.data.data.history);
      setTotal(res.data.data.total);
    } catch (err) {
      setError('삭제 히스토리를 불러오는데 실패했습니다');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [open, page, deviceType, manufacturer, search]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 모달 열릴 때 리셋
  useEffect(() => {
    if (open) {
      setPage(1);
      setSearch('');
      setExpandedItems(new Set());
    }
  }, [open]);

  // 검색 핸들러 (디바운스)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (open) loadHistory();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 날짜 포맷팅
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // 상대 시간
  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    if (days < 30) return `${Math.floor(days / 7)}주 전`;
    return formatDate(dateStr);
  };

  // 확장 토글
  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxHeight: '90vh',
        },
      }}
    >
      {/* 헤더 */}
      <DialogTitle
        sx={{
          background: `linear-gradient(135deg, ${theme.palette.error.main} 0%, ${theme.palette.error.dark} 100%)`,
          color: 'white',
          py: 2.5,
          px: 3,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={2}>
            <Badge
              badgeContent={total}
              color="warning"
              max={999}
              sx={{
                '& .MuiBadge-badge': {
                  bgcolor: alpha('#ffffff', 0.9),
                  color: theme.palette.error.main,
                  fontWeight: 700,
                },
              }}
            >
              <Avatar
                sx={{
                  bgcolor: alpha('#ffffff', 0.2),
                  backdropFilter: 'blur(10px)',
                }}
              >
                <DeleteIcon />
              </Avatar>
            </Badge>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                삭제된 모델 히스토리
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                삭제된 모델 정보를 확인할 수 있습니다
              </Typography>
            </Box>
          </Stack>
          <IconButton onClick={onClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      {/* 검색 바 */}
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="모델명, 코드로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* 내용 */}
      <DialogContent sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 3 }}>
            {error}
          </Alert>
        ) : history.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <DeleteIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              삭제된 모델이 없습니다
            </Typography>
            <Typography variant="body2" color="text.disabled">
              삭제된 모델 정보가 이 곳에 기록됩니다
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 3 }}>
            <Stack spacing={2}>
              {history.map((item) => {
                const isExpanded = expandedItems.has(item.id);
                const isBulk = item.action === 'bulk';

                return (
                  <Paper
                    key={item.id}
                    elevation={0}
                    sx={{
                      border: '1px solid',
                      borderColor: isExpanded ? 'error.main' : 'divider',
                      borderRadius: 2,
                      overflow: 'hidden',
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: 'error.main',
                        boxShadow: `0 4px 20px ${alpha(theme.palette.error.main, 0.15)}`,
                      },
                    }}
                  >
                    {/* 헤더 (클릭 가능) */}
                    <Box
                      onClick={() => toggleExpanded(item.id)}
                      sx={{
                        p: 2,
                        cursor: 'pointer',
                        bgcolor: isExpanded ? alpha(theme.palette.error.main, 0.04) : 'transparent',
                        '&:hover': {
                          bgcolor: alpha(theme.palette.error.main, 0.08),
                        },
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={2}>
                        <Avatar
                          sx={{
                            width: 44,
                            height: 44,
                            bgcolor: (theme) => alpha(
                              isBulk ? theme.palette.warning.main : theme.palette.error.main,
                              0.12
                            ),
                            color: isBulk ? 'warning.main' : 'error.main',
                          }}
                        >
                          {isBulk ? <WarningIcon /> : <DeleteIcon />}
                        </Avatar>
                        
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            {isBulk ? (
                              <Typography variant="subtitle1" fontWeight={700}>
                                일괄 삭제 ({item.deleted_count}개 모델)
                              </Typography>
                            ) : (
                              <Typography variant="subtitle1" fontWeight={700}>
                                {(item.model_data as any)?.full_name || '알 수 없음'}
                              </Typography>
                            )}
                            <Chip
                              label={isBulk ? '일괄' : '단일'}
                              size="small"
                              color={isBulk ? 'warning' : 'error'}
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          </Stack>
                          <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 0.5 }}>
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <PersonIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                              <Typography variant="caption" color="text.secondary">
                                {item.deleted_by.name || item.deleted_by.email || '알 수 없음'}
                              </Typography>
                            </Stack>
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <TimeIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                              <Tooltip title={formatDate(item.deleted_at)}>
                                <Typography variant="caption" color="text.secondary">
                                  {getRelativeTime(item.deleted_at)}
                                </Typography>
                              </Tooltip>
                            </Stack>
                          </Stack>
                        </Box>

                        <IconButton size="small">
                          {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </Stack>
                    </Box>

                    {/* 상세 내용 */}
                    <Collapse in={isExpanded}>
                      <Box
                        sx={{
                          p: 2,
                          pt: 0,
                          borderTop: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        {isBulk ? (
                          // 일괄 삭제 상세
                          <Box>
                            <Typography variant="caption" color="text.secondary" gutterBottom>
                              삭제된 모델 목록:
                            </Typography>
                            <Stack spacing={1} sx={{ mt: 1 }}>
                              {item.deleted_models?.map((dm, idx) => (
                                <Box
                                  key={idx}
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    p: 1,
                                    bgcolor: alpha(theme.palette.background.default, 0.5),
                                    borderRadius: 1,
                                  }}
                                >
                                  <SmartphoneIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                                  <Typography variant="body2">
                                    {dm.full_name}
                                  </Typography>
                                  <Typography variant="caption" color="text.disabled">
                                    ({dm.model_code})
                                  </Typography>
                                </Box>
                              ))}
                            </Stack>
                          </Box>
                        ) : (
                          // 단일 삭제 상세
                          <Box>
                            <Stack spacing={1.5}>
                              <DetailRow label="모델 코드" value={(item.model_data as any)?.model_code} />
                              <DetailRow label="시리즈" value={(item.model_data as any)?.series} />
                              <DetailRow label="디바이스 타입" value={(item.model_data as any)?.device_type} />
                              <DetailRow label="제조사" value={(item.model_data as any)?.manufacturer} />
                              <DetailRow 
                                label="스토리지" 
                                value={`${(item.model_data as any)?.storage_gb}GB`} 
                              />
                              
                              {/* 삭제된 가격 정보 */}
                              {(item.model_data as any)?.grade_prices?.length > 0 && (
                                <Box sx={{ mt: 1 }}>
                                  <Typography variant="caption" color="text.secondary" gutterBottom>
                                    삭제된 가격 정보:
                                  </Typography>
                                  <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 1 }}>
                                    {(item.model_data as any)?.grade_prices?.map((gp: any, idx: number) => (
                                      <Chip
                                        key={idx}
                                        icon={<StorageIcon sx={{ fontSize: '14px !important' }} />}
                                        label={`${gp.grade_name || '?'}등급: ${gp.price?.toLocaleString()}원`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ fontSize: '0.75rem' }}
                                      />
                                    ))}
                                  </Stack>
                                </Box>
                              )}
                            </Stack>
                          </Box>
                        )}

                        {/* 설명 */}
                        {item.description && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              mt: 2,
                              pt: 1.5,
                              borderTop: '1px dashed',
                              borderColor: 'divider',
                              fontStyle: 'italic',
                            }}
                          >
                            📝 {item.description}
                          </Typography>
                        )}
                      </Box>
                    </Collapse>
                  </Paper>
                );
              })}
            </Stack>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                />
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      {/* 푸터 */}
      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          총 {total}건의 삭제 기록
        </Typography>
        <Button onClick={onClose} variant="outlined">
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// 상세 정보 행 컴포넌트
function DetailRow({ label, value }: { label: string; value: string | undefined | null }) {
  if (!value) return null;
  
  return (
    <Stack direction="row" spacing={2}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80 }}>
        {label}:
      </Typography>
      <Typography variant="body2" fontWeight={500}>
        {value}
      </Typography>
    </Stack>
  );
}
