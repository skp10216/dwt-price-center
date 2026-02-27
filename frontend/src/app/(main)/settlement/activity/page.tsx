'use client';

/**
 * 정산 작업 내역 페이지
 * - 깔끔한 좌측 컬러 보더 기반 타임라인 (배경색 최소화)
 * - 동일 trace_id 일괄 처리는 1건으로 묶어 표시, 클릭 시 상세 내역 조회
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, alpha, useTheme,
  TextField, InputAdornment, IconButton, Tooltip, LinearProgress,
  ToggleButtonGroup, ToggleButton, Avatar, Divider, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Table, TableHead, TableBody, TableCell, TableRow, TablePagination,
  Select, MenuItem, FormControl, InputLabel, CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CloudUpload as UploadIcon,
  Receipt as ReceiptIcon,
  Lock as LockIcon,
  AttachMoney as PaymentIcon,
  Business as BusinessIcon,
  SwapHoriz as ChangeIcon,
  AccessTime as TimeIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  PlayArrow as StartIcon,
  DoneAll as DoneAllIcon,
  ErrorOutline as ErrorIcon,
  History as HistoryIcon,
  ChevronRight as ChevronRightIcon,
  Layers as LayersIcon,
  RestoreFromTrash,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { AppPageContainer, AppPageHeader } from '@/components/ui';

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface ActivityLog {
  id: string;
  trace_id: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  description: string | null;
  ip_address: string | null;
  created_at: string;
  item_count: number;
}

interface TraceLog {
  id: string;
  action: string | null;
  user_name: string | null;
  target_type: string | null;
  target_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  description: string | null;
  created_at: string;
}

// ─── 카테고리 & 액션 메타 ─────────────────────────────────────────────────────

type CategoryKey = 'all' | 'upload' | 'voucher' | 'lock' | 'payment' | 'counterparty' | 'change';

const CATEGORY_META: Record<CategoryKey, { label: string; color: string; icon: React.ReactNode }> = {
  all:          { label: '전체',      color: '#64748b', icon: <HistoryIcon sx={{ fontSize: 15 }} /> },
  upload:       { label: '업로드',    color: '#1565c0', icon: <UploadIcon sx={{ fontSize: 15 }} /> },
  voucher:      { label: '전표',      color: '#6a1b9a', icon: <ReceiptIcon sx={{ fontSize: 15 }} /> },
  lock:         { label: '마감',      color: '#b71c1c', icon: <LockIcon sx={{ fontSize: 15 }} /> },
  payment:      { label: '입금/지급', color: '#1b5e20', icon: <PaymentIcon sx={{ fontSize: 15 }} /> },
  counterparty: { label: '거래처',    color: '#006064', icon: <BusinessIcon sx={{ fontSize: 15 }} /> },
  change:       { label: '변경감지',  color: '#e65100', icon: <ChangeIcon sx={{ fontSize: 15 }} /> },
};

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; category: CategoryKey }> = {
  UPLOAD_START:               { label: '업로드 시작',        icon: <StartIcon />,   category: 'upload' },
  UPLOAD_COMPLETE:            { label: '업로드 완료',        icon: <DoneAllIcon />, category: 'upload' },
  UPLOAD_REVIEW:              { label: '업로드 검토',        icon: <InfoIcon />,    category: 'upload' },
  UPLOAD_CONFIRM:             { label: '업로드 확정',        icon: <CheckIcon />,   category: 'upload' },
  UPLOAD_APPLY:               { label: '업로드 적용',        icon: <CheckIcon />,   category: 'upload' },
  UPLOAD_DELETE:              { label: '업로드 삭제',        icon: <DeleteIcon />,  category: 'upload' },
  UPLOAD_TEMPLATE_CREATE:     { label: '템플릿 생성',        icon: <AddIcon />,     category: 'upload' },
  UPLOAD_TEMPLATE_UPDATE:     { label: '템플릿 수정',        icon: <EditIcon />,    category: 'upload' },
  VOUCHER_CREATE:             { label: '전표 생성',          icon: <AddIcon />,     category: 'voucher' },
  VOUCHER_UPDATE:             { label: '전표 수정',          icon: <EditIcon />,    category: 'voucher' },
  VOUCHER_DELETE:             { label: '전표 삭제',          icon: <DeleteIcon />,  category: 'voucher' },
  VOUCHER_UPSERT:             { label: '전표 일괄처리',      icon: <DoneAllIcon />, category: 'voucher' },
  VOUCHER_LOCK:               { label: '전표 마감',          icon: <LockIcon />,    category: 'lock' },
  VOUCHER_UNLOCK:             { label: '마감 해제',          icon: <LockIcon />,    category: 'lock' },
  VOUCHER_BATCH_LOCK:         { label: '일괄 마감',          icon: <LockIcon />,    category: 'lock' },
  VOUCHER_BATCH_UNLOCK:       { label: '일괄 마감 해제',     icon: <LockIcon />,    category: 'lock' },
  RECEIPT_CREATE:             { label: '입금 등록',          icon: <AddIcon />,     category: 'payment' },
  RECEIPT_DELETE:             { label: '입금 삭제',          icon: <DeleteIcon />,  category: 'payment' },
  PAYMENT_CREATE:             { label: '지급 등록',          icon: <AddIcon />,     category: 'payment' },
  PAYMENT_DELETE:             { label: '지급 삭제',          icon: <DeleteIcon />,  category: 'payment' },
  COUNTERPARTY_CREATE:        { label: '거래처 등록',        icon: <AddIcon />,     category: 'counterparty' },
  COUNTERPARTY_UPDATE:        { label: '거래처 수정',        icon: <EditIcon />,    category: 'counterparty' },
  COUNTERPARTY_DELETE:        { label: '거래처 삭제',        icon: <DeleteIcon />,  category: 'counterparty' },
  COUNTERPARTY_BATCH_CREATE:  { label: '거래처 일괄 등록',   icon: <DoneAllIcon />, category: 'counterparty' },
  COUNTERPARTY_BATCH_DELETE:  { label: '거래처 일괄 삭제',   icon: <DeleteIcon />,  category: 'counterparty' },
  COUNTERPARTY_ALIAS_CREATE:  { label: '거래처 별칭 추가',   icon: <AddIcon />,     category: 'counterparty' },
  COUNTERPARTY_ALIAS_DELETE:  { label: '거래처 별칭 삭제',   icon: <DeleteIcon />,  category: 'counterparty' },
  BRANCH_CREATE:              { label: '지사 생성',          icon: <AddIcon />,     category: 'counterparty' },
  BRANCH_UPDATE:              { label: '지사 수정',          icon: <EditIcon />,    category: 'counterparty' },
  BRANCH_DELETE:              { label: '지사 삭제',          icon: <DeleteIcon />,  category: 'counterparty' },
  BRANCH_RESTORE:             { label: '지사 복구',          icon: <RestoreFromTrash />, category: 'counterparty' },
  VOUCHER_CHANGE_DETECTED:    { label: '변경사항 감지',      icon: <ErrorIcon />,   category: 'change' },
  VOUCHER_CHANGE_APPROVED:    { label: '변경사항 승인',      icon: <CheckIcon />,   category: 'change' },
  VOUCHER_CHANGE_REJECTED:    { label: '변경사항 거부',      icon: <CancelIcon />,  category: 'change' },
};

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────

function toKST(isoStr: string): Date {
  let s = isoStr;
  if (s.includes('T') && !s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
  return new Date(s);
}

function formatTime(isoStr: string): string {
  try {
    return toKST(isoStr).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch { return isoStr; }
}

function formatDateTime(isoStr: string): string {
  try {
    return toKST(isoStr).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch { return isoStr; }
}

function getDateKey(isoStr: string): string {
  return toKST(isoStr).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function formatDateLabel(isoStr: string): string {
  const d = toKST(isoStr);
  const today = new Date();
  const diffDays = Math.floor(
    (today.setHours(0,0,0,0) - new Date(d).setHours(0,0,0,0)) / 86400000
  );
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
}

function getInitials(name: string): string {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function getUserColor(seed: string): string {
  const colors = ['#1565c0', '#2e7d32', '#c62828', '#6a1b9a', '#00695c', '#e65100', '#4527a0', '#ad1457'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

// ─── 날짜 프리셋 ──────────────────────────────────────────────────────────────

function getPresetDates(preset: string): { start: string; end: string } | null {
  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  switch (preset) {
    case 'today': {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      return { start: start.toISOString(), end: todayEnd.toISOString() };
    }
    case 'week': {
      const start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
      return { start: start.toISOString(), end: todayEnd.toISOString() };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: start.toISOString(), end: todayEnd.toISOString() };
    }
    default: return null;
  }
}

// ─── JSON Diff 뷰어 ───────────────────────────────────────────────────────────

function JsonBlock({ label, data, color }: { label: string; data: Record<string, unknown>; color: string }) {
  return (
    <Box>
      <Typography variant="caption" fontWeight={700} color={color} sx={{ display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Box sx={{
        p: 1.5, borderRadius: 1.5,
        bgcolor: alpha(color, 0.04),
        border: `1px solid ${alpha(color, 0.18)}`,
        fontFamily: 'monospace', fontSize: '0.72rem',
        overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        maxHeight: 280, overflowY: 'auto', lineHeight: 1.6,
      }}>
        {JSON.stringify(data, null, 2)}
      </Box>
    </Box>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<CategoryKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<string>('month');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // 단건 상세 다이얼로그
  const [detailLog, setDetailLog] = useState<ActivityLog | null>(null);

  // 전체 삭제 (테스트)
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const res = await settlementApi.clearActivityLogs();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (res.data as any)?.data ?? res.data;
      enqueueSnackbar(`작업 내역 ${result.deleted_count}건 삭제 완료`, { variant: 'success' });
      setClearDialogOpen(false);
      loadLogs();
    } catch {
      enqueueSnackbar('작업 내역 삭제에 실패했습니다', { variant: 'error' });
    } finally {
      setClearing(false);
    }
  };

  // 일괄 처리 상세 다이얼로그
  const [traceLog, setTraceLog] = useState<ActivityLog | null>(null);
  const [traceLogs, setTraceLogs] = useState<TraceLog[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);

  // ─── 데이터 로드 ────────────────────────────────────────────────────────────

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, unknown> = { page: page + 1, page_size: rowsPerPage };
      if (category !== 'all') params.category = category;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      const dates = getPresetDates(datePreset);
      if (dates) { params.start_date = dates.start; params.end_date = dates.end; }

      const res = await settlementApi.listActivityLogs(params);
      const raw = res.data as unknown as Record<string, unknown>;
      const items = (raw.logs ?? []) as ActivityLog[];
      setLogs(Array.isArray(items) ? items : []);
      setTotal((raw.total ?? 0) as number);
    } catch (e: unknown) {
      console.error('[Activity] API error:', e);
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? '작업 내역을 불러오는 중 오류가 발생했습니다.';
      setError(String(msg));
      setLogs([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [category, searchQuery, datePreset, page, rowsPerPage]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { setPage(0); }, [category, datePreset, searchQuery]);

  // ─── 일괄 처리 상세 로드 ────────────────────────────────────────────────────

  const openTraceDetail = useCallback(async (log: ActivityLog) => {
    if (!log.trace_id) return;
    setTraceLog(log);
    setTraceLogs([]);
    setTraceLoading(true);
    try {
      const res = await settlementApi.listTraceActivityLogs(log.trace_id);
      const raw = res.data as unknown as Record<string, unknown>;
      setTraceLogs((raw.logs ?? []) as TraceLog[]);
    } catch (e) {
      console.error('[Activity] Trace fetch error:', e);
    } finally {
      setTraceLoading(false);
    }
  }, []);

  // ─── 날짜 그룹핑 ─────────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: ActivityLog[] }>();
    for (const log of logs) {
      const key = getDateKey(log.created_at);
      if (!map.has(key)) map.set(key, { label: formatDateLabel(log.created_at), items: [] });
      map.get(key)!.items.push(log);
    }
    return Array.from(map.values());
  }, [logs]);

  // ─── 클릭 핸들러 ─────────────────────────────────────────────────────────────

  const handleRowClick = useCallback((log: ActivityLog) => {
    if (log.item_count > 1 && log.trace_id) {
      openTraceDetail(log);
    } else if (log.before_data || log.after_data) {
      setDetailLog(log);
    }
  }, [openTraceDetail]);

  const isClickable = (log: ActivityLog) =>
    (log.item_count > 1 && !!log.trace_id) || !!(log.before_data || log.after_data);

  // ─── 렌더: 액션 레이블 ───────────────────────────────────────────────────────

  const ActionLabel = ({ action, isBatch }: { action: string; isBatch?: boolean }) => {
    const meta = ACTION_META[action];
    const catMeta = meta ? CATEGORY_META[meta.category] : CATEGORY_META.all;
    return (
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Box sx={{ color: catMeta.color, display: 'flex', alignItems: 'center', '& svg': { fontSize: 14 } }}>
          {meta?.icon ?? <HistoryIcon />}
        </Box>
        <Typography variant="caption" sx={{ fontWeight: 700, color: catMeta.color, whiteSpace: 'nowrap' }}>
          {meta?.label ?? action}
        </Typography>
        {isBatch && (
          <LayersIcon sx={{ fontSize: 13, color: catMeta.color, opacity: 0.7 }} />
        )}
      </Stack>
    );
  };

  // ─── 렌더: 타임라인 아이템 ───────────────────────────────────────────────────

  const renderItem = (log: ActivityLog) => {
    const meta = ACTION_META[log.action];
    const catMeta = meta ? CATEGORY_META[meta.category] : CATEGORY_META.all;
    const clickable = isClickable(log);
    const isBatch = log.item_count > 1;

    return (
      <Box
        key={log.id}
        onClick={() => clickable && handleRowClick(log)}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          px: 2,
          py: 1.2,
          borderLeft: `3px solid ${catMeta.color}`,
          cursor: clickable ? 'pointer' : 'default',
          transition: 'background 0.12s',
          '&:hover': clickable ? { bgcolor: alpha(theme.palette.action.hover, 1) } : {},
          borderBottom: `1px solid ${theme.palette.divider}`,
          '&:last-child': { borderBottom: 'none' },
        }}
      >
        {/* 아바타 */}
        <Avatar
          sx={{
            width: 30, height: 30, fontSize: '0.65rem', flexShrink: 0, mt: 0.2,
            bgcolor: getUserColor(log.user_email ?? log.user_name ?? ''),
          }}
        >
          {log.user_name ? getInitials(log.user_name) : '?'}
        </Avatar>

        {/* 내용 */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <ActionLabel action={log.action} isBatch={isBatch} />

            {/* 일괄 처리 건수 배지 */}
            {isBatch && (
              <Chip
                label={`${log.item_count.toLocaleString()}건`}
                size="small"
                sx={{
                  fontWeight: 700,
                  bgcolor: alpha(catMeta.color, 0.1),
                  color: catMeta.color,
                  border: `1px solid ${alpha(catMeta.color, 0.25)}`,
                }}
              />
            )}

            {/* 설명 */}
            {log.description && (
              <Typography
                variant="body2"
                color="text.primary"
                noWrap
                sx={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}
              >
                {log.description}
              </Typography>
            )}
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.3 }} flexWrap="wrap" useFlexGap>
            {log.user_name && (
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {log.user_name}
              </Typography>
            )}
            {log.target_type && (
              <Typography variant="caption" color="text.disabled">
                · {log.target_type}
                {log.target_id && !isBatch && ` ${log.target_id.slice(0, 8)}…`}
              </Typography>
            )}
          </Stack>
        </Box>

        {/* 우측: 시간 + 상세보기 */}
        <Box sx={{ flexShrink: 0, textAlign: 'right', pt: 0.2 }}>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontSize: '0.72rem' }}>
            {formatTime(log.created_at)}
          </Typography>
          {clickable && (
            <Stack direction="row" alignItems="center" justifyContent="flex-end" sx={{ mt: 0.2 }}>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: catMeta.color, fontWeight: 600 }}>
                상세
              </Typography>
              <ChevronRightIcon sx={{ fontSize: 12, color: catMeta.color }} />
            </Stack>
          )}
        </Box>
      </Box>
    );
  };

  // ─── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <AppPageContainer>

      {/* 헤더 */}
      <AppPageHeader
        icon={<HistoryIcon />}
        title="작업 내역"
        description="정산 시스템의 모든 작업을 투명하게 추적합니다"
        color="primary"
        highlight
        count={loading ? null : total}
        onRefresh={loadLogs}
        loading={loading}
        actions={[{
          label: '전체 삭제 (테스트)',
          onClick: () => setClearDialogOpen(true),
          variant: 'outlined' as const,
          color: 'error' as const,
          icon: <DeleteIcon />,
        }]}
      />

      {/* 필터 */}
      <Paper elevation={0} sx={{ mb: 1.5, px: 2, py: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack spacing={1.5}>
          {/* 카테고리 토글 */}
          <ToggleButtonGroup
            value={category}
            exclusive
            size="small"
            onChange={(_, v) => { if (v) setCategory(v as CategoryKey); }}
            sx={{ flexWrap: 'wrap', gap: 0.5 }}
          >
            {(Object.entries(CATEGORY_META) as [CategoryKey, typeof CATEGORY_META[CategoryKey]][]).map(([key, meta]) => (
              <ToggleButton
                key={key}
                value={key}
                sx={{
                  px: 1.5, py: 0.4, fontWeight: 600, fontSize: '0.73rem',
                  gap: 0.5, borderRadius: '6px !important', lineHeight: 1.4,
                  color: 'text.secondary',
                  '&.Mui-selected': {
                    bgcolor: alpha(meta.color, 0.1),
                    color: meta.color,
                    borderColor: alpha(meta.color, 0.35),
                  },
                }}
              >
                {meta.icon}
                {meta.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              placeholder="설명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17, color: 'text.secondary' }} /></InputAdornment>,
              }}
              sx={{ width: 240 }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>기간</InputLabel>
              <Select value={datePreset} label="기간" onChange={(e) => setDatePreset(e.target.value)}>
                <MenuItem value="today">오늘</MenuItem>
                <MenuItem value="week">최근 7일</MenuItem>
                <MenuItem value="month">이번 달</MenuItem>
                <MenuItem value="all">전체</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      {/* 타임라인 */}
      <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        {loading && <LinearProgress />}

        {!loading && logs.length === 0 ? (
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <HistoryIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1.5 }} />
            <Typography variant="h6" fontWeight={600} color="text.secondary">작업 내역이 없습니다</Typography>
            <Typography variant="body2" color="text.disabled">기간이나 카테고리 필터를 변경해보세요</Typography>
          </Box>
        ) : (
          <>
            {grouped.map((group, gi) => (
              <Box key={gi}>
                {/* 날짜 구분 */}
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{ px: 2, py: 1, bgcolor: alpha(theme.palette.grey[500], 0.06), borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <TimeIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    {group.label}
                  </Typography>
                  <Divider sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.disabled">{group.items.length}건</Typography>
                </Stack>

                {/* 아이템 목록 */}
                {group.items.map(renderItem)}
              </Box>
            ))}

            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[25, 50, 100]}
              labelRowsPerPage="페이지당:"
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
            />
          </>
        )}
      </Paper>

      {/* ── 단건 상세 다이얼로그 ─────────────────────────────────────────────── */}
      <Dialog open={!!detailLog} onClose={() => setDetailLog(null)} maxWidth="md" fullWidth>
        {detailLog && (() => {
          const meta = ACTION_META[detailLog.action];
          const catMeta = meta ? CATEGORY_META[meta.category] : CATEGORY_META.all;
          return (
            <>
              <DialogTitle sx={{ pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Box sx={{
                    width: 34, height: 34, borderRadius: 1.5,
                    bgcolor: alpha(catMeta.color, 0.1),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: catMeta.color,
                  }}>
                    {meta?.icon ?? <InfoIcon />}
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>{meta?.label ?? detailLog.action}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDateTime(detailLog.created_at)}</Typography>
                  </Box>
                </Stack>
              </DialogTitle>
              <DialogContent sx={{ pt: 2 }}>
                <Table size="small" sx={{ mb: 2 }}>
                  <TableBody>
                    {[
                      { label: '작업자', value: detailLog.user_name ? `${detailLog.user_name}${detailLog.user_email ? ` (${detailLog.user_email})` : ''}` : '—' },
                      { label: '대상 유형', value: detailLog.target_type ?? '—' },
                      { label: '대상 ID', value: detailLog.target_id ?? '—' },
                      { label: '설명', value: detailLog.description ?? '—' },
                      { label: 'IP 주소', value: detailLog.ip_address ?? '—' },
                    ].map(({ label, value }) => (
                      <TableRow key={label} sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={{ width: 90, color: 'text.secondary', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {label}
                        </TableCell>
                        <TableCell sx={{ fontFamily: label === '대상 ID' ? 'monospace' : 'inherit' }}>
                          {value}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {(detailLog.before_data || detailLog.after_data) && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>변경 내용</Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      {detailLog.before_data && (
                        <Box sx={{ flex: 1 }}>
                          <JsonBlock label="변경 전" data={detailLog.before_data} color="#c62828" />
                        </Box>
                      )}
                      {detailLog.after_data && (
                        <Box sx={{ flex: 1 }}>
                          <JsonBlock label="변경 후" data={detailLog.after_data} color="#2e7d32" />
                        </Box>
                      )}
                    </Stack>
                  </>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setDetailLog(null)}>닫기</Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* ── 일괄 처리 상세 다이얼로그 ────────────────────────────────────────── */}
      <Dialog open={!!traceLog} onClose={() => { setTraceLog(null); setTraceLogs([]); }} maxWidth="lg" fullWidth>
        {traceLog && (() => {
          const meta = ACTION_META[traceLog.action];
          const catMeta = meta ? CATEGORY_META[meta.category] : CATEGORY_META.all;
          return (
            <>
              <DialogTitle sx={{ pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Box sx={{
                    width: 34, height: 34, borderRadius: 1.5,
                    bgcolor: alpha(catMeta.color, 0.1),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: catMeta.color,
                  }}>
                    <LayersIcon />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {meta?.label ?? traceLog.action}
                      </Typography>
                      <Chip
                        label={`${traceLog.item_count.toLocaleString()}건`}
                        size="small"
                        sx={{
                          fontWeight: 700,
                          bgcolor: alpha(catMeta.color, 0.1), color: catMeta.color,
                        }}
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(traceLog.created_at)} · {traceLog.user_name ?? '—'}
                    </Typography>
                  </Box>
                </Stack>
              </DialogTitle>

              <DialogContent sx={{ p: 0 }}>
                {traceLoading ? (
                  <Box sx={{ py: 6, textAlign: 'center' }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      상세 내역 불러오는 중...
                    </Typography>
                  </Box>
                ) : (
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', width: 40, bgcolor: alpha(theme.palette.grey[100], 1) }}>No</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', bgcolor: alpha(theme.palette.grey[100], 1) }}>작업</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', bgcolor: alpha(theme.palette.grey[100], 1) }}>대상 ID</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', bgcolor: alpha(theme.palette.grey[100], 1) }}>설명</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', bgcolor: alpha(theme.palette.grey[100], 1), whiteSpace: 'nowrap' }}>시각</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {traceLogs.map((tl, idx) => {
                        const tlMeta = tl.action ? ACTION_META[tl.action] : null;
                        const tlCatMeta = tlMeta ? CATEGORY_META[tlMeta.category] : CATEGORY_META.all;
                        return (
                          <TableRow key={tl.id} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                            <TableCell sx={{ color: 'text.disabled' }}>{idx + 1}</TableCell>
                            <TableCell>
                              <Typography variant="caption" sx={{ fontWeight: 700, color: tlCatMeta.color }}>
                                {tlMeta?.label ?? tl.action ?? '—'}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                              {tl.target_id ? tl.target_id.slice(0, 12) + '…' : '—'}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 320 }}>
                              <Typography variant="caption" noWrap sx={{ display: 'block', maxWidth: 300 }}>
                                {tl.description ?? '—'}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                              {formatTime(tl.created_at)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </DialogContent>

              <DialogActions>
                <Button onClick={() => { setTraceLog(null); setTraceLogs([]); }}>닫기</Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* ── 전체 삭제 확인 다이얼로그 ─────────────────────────────────────── */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ErrorIcon color="error" />
          테스트용 작업 내역 전체 삭제
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            정산 관련 모든 작업 내역 <strong>{total}건</strong>을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setClearDialogOpen(false)} disabled={clearing}>취소</Button>
          <Button variant="contained" color="error" onClick={handleClearAll} disabled={clearing}>
            {clearing ? '삭제 중...' : '전체 삭제'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
}

