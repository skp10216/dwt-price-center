/**
 * 가격 변경 히스토리 모달
 * 
 * 모델별 가격 변경 이력을 고급스러운 타임라인 형태로 표시합니다.
 * - 누가 (사용자)
 * - 언제 (날짜/시간)
 * - 어떻게 (가격 변경 상세)
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
  Divider,
  Paper,
  Pagination,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Close as CloseIcon,
  History as HistoryIcon,
  TrendingUp as IncreaseIcon,
  TrendingDown as DecreaseIcon,
  TrendingFlat as NoChangeIcon,
  Person as PersonIcon,
  AccessTime as TimeIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { ssotModelsApi, PriceHistoryItem, PriceHistoryChange } from '@/lib/api';

interface PriceHistoryModalProps {
  open: boolean;
  onClose: () => void;
  modelId: string;
  modelName: string;
  grades: Array<{ id: string; name: string }>;
}

export function PriceHistoryModal({
  open,
  onClose,
  modelId,
  modelName,
  grades,
}: PriceHistoryModalProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PriceHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 등급 ID → 이름 매핑
  const gradeMap = new Map(grades.map((g) => [g.id, g.name]));

  // 히스토리 로드
  const loadHistory = useCallback(async () => {
    if (!modelId || !open) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await ssotModelsApi.getPriceHistory(modelId, { page, page_size: pageSize });
      setHistory(res.data.data.history);
      setTotal(res.data.data.total);
    } catch (err) {
      setError('히스토리를 불러오는데 실패했습니다');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [modelId, open, page]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 페이지 변경 시 리셋
  useEffect(() => {
    if (open) {
      setPage(1);
    }
  }, [open, modelId]);

  // 가격 차이 색상
  const getDiffColor = (diff: number) => {
    if (diff > 0) return theme.palette.success.main;
    if (diff < 0) return theme.palette.error.main;
    return theme.palette.text.secondary;
  };

  // 가격 차이 아이콘
  const getDiffIcon = (diff: number) => {
    if (diff > 0) return <IncreaseIcon fontSize="small" sx={{ color: 'success.main' }} />;
    if (diff < 0) return <DecreaseIcon fontSize="small" sx={{ color: 'error.main' }} />;
    return <NoChangeIcon fontSize="small" sx={{ color: 'text.secondary' }} />;
  };

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
    return formatDate(dateStr);
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
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: 'white',
          py: 2.5,
          px: 3,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <HistoryIcon />
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                가격 변경 히스토리
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                {modelName}
              </Typography>
            </Box>
          </Stack>
          <IconButton onClick={onClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

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
            <HistoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              가격 변경 히스토리가 없습니다
            </Typography>
            <Typography variant="body2" color="text.disabled">
              가격이 변경되면 이 곳에 기록됩니다
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 3 }}>
            {/* 타임라인 */}
            <Stack spacing={0}>
              {history.map((item, index) => (
                <Box
                  key={item.id}
                  sx={{
                    position: 'relative',
                    pb: index === history.length - 1 ? 0 : 3,
                    '&::before': index === history.length - 1 ? {} : {
                      content: '""',
                      position: 'absolute',
                      left: 20,
                      top: 48,
                      bottom: 0,
                      width: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.15),
                    },
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: 'primary.main',
                        boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.15)}`,
                      },
                    }}
                  >
                    {/* 헤더 */}
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                      <Avatar
                        sx={{
                          width: 40,
                          height: 40,
                          bgcolor: 'primary.100',
                          color: 'primary.main',
                        }}
                      >
                        <PersonIcon fontSize="small" />
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {item.user_name || item.user_email || '알 수 없음'}
                        </Typography>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <TimeIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                          <Tooltip title={formatDate(item.created_at)}>
                            <Typography variant="caption" color="text.secondary">
                              {getRelativeTime(item.created_at)}
                            </Typography>
                          </Tooltip>
                        </Stack>
                      </Box>
                      <Chip
                        icon={<MoneyIcon />}
                        label={`${item.changes.length}개 등급 변경`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </Stack>

                    {/* 변경 상세 */}
                    <Stack spacing={1}>
                      {item.changes.map((change, changeIdx) => (
                        <Box
                          key={`${item.id}-${changeIdx}`}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            p: 1.5,
                            bgcolor: alpha(theme.palette.background.default, 0.5),
                            borderRadius: 1.5,
                          }}
                        >
                          {/* 등급 */}
                          <Chip
                            label={`${gradeMap.get(change.grade_id) || '?'}등급`}
                            size="small"
                            sx={{
                              minWidth: 60,
                              fontWeight: 600,
                            }}
                          />

                          {/* 이전 가격 */}
                          <Typography
                            variant="body2"
                            sx={{
                              textDecoration: 'line-through',
                              color: 'text.disabled',
                              minWidth: 80,
                              textAlign: 'right',
                            }}
                          >
                            {change.old_price.toLocaleString()}원
                          </Typography>

                          {/* 화살표 */}
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {getDiffIcon(change.diff)}
                          </Box>

                          {/* 새 가격 */}
                          <Typography
                            variant="body2"
                            fontWeight={700}
                            sx={{
                              color: getDiffColor(change.diff),
                              minWidth: 80,
                            }}
                          >
                            {change.new_price.toLocaleString()}원
                          </Typography>

                          {/* 차이 */}
                          <Typography
                            variant="caption"
                            sx={{
                              color: getDiffColor(change.diff),
                              fontWeight: 600,
                              bgcolor: alpha(getDiffColor(change.diff), 0.1),
                              px: 1,
                              py: 0.25,
                              borderRadius: 1,
                            }}
                          >
                            {change.diff > 0 ? '+' : ''}{change.diff.toLocaleString()}원
                          </Typography>
                        </Box>
                      ))}
                    </Stack>

                    {/* 설명 */}
                    {item.description && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: 'block',
                          mt: 1.5,
                          fontStyle: 'italic',
                        }}
                      >
                        {item.description}
                      </Typography>
                    )}
                  </Paper>
                </Box>
              ))}
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
          총 {total}건의 변경 기록
        </Typography>
        <Button onClick={onClose} variant="outlined">
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  );
}
