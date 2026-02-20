'use client';

/**
 * UPM 전표 업로드 공통 컴포넌트 (판매/매입 통합)
 * - 드래그 앤 드롭 파일 선택
 * - 미리보기 검증 (합계행 자동 제외, 오류/경고 필터, 정렬)
 * - 업로드 확정
 */

import { useState, useRef, useCallback, useMemo, DragEvent } from 'react';
import {
  Box, Typography, Paper, Button, Stack, Alert, LinearProgress,
  alpha, useTheme, Stepper, Step, StepLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel,
  Chip, Divider, Tooltip, IconButton, Fade,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  CheckCircle as CheckCircleIcon,
  Description as DescriptionIcon,
  Preview as PreviewIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  RemoveCircleOutline as ExcludedIcon,
  Refresh as RefreshIcon,
  FileUpload as FileUploadIcon,
  FilterList as FilterIcon,
  Info as InfoIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import { useRouter } from 'next/navigation';

// ─── 타입 ───
interface PreviewRow {
  row_number: number;
  trade_date: string;
  counterparty_name: string;
  voucher_number: string;
  quantity: number;
  amount: number;
  memo?: string;
  status: 'ok' | 'warning' | 'error' | 'excluded';
  message?: string;
}

type SortField = 'row_number' | 'trade_date' | 'counterparty_name' | 'voucher_number' | 'quantity' | 'amount' | 'memo' | 'status';
type SortDirection = 'asc' | 'desc';
type FilterType = 'all' | 'ok' | 'error' | 'warning' | 'excluded';

interface VoucherUploadPageProps {
  /** 전표 유형: 'sales' | 'purchase' */
  voucherType: 'sales' | 'purchase';
}

// ─── 설정 상수 ───
const VOUCHER_CONFIG = {
  sales: {
    title: 'UPM 판매 전표 업로드',
    description: 'UPM에서 내보낸 판매 전표 Excel 파일을 업로드합니다. 기존 전표는 UPSERT(갱신 또는 생성)로 처리됩니다.',
    color: 'primary' as const,
    completeTitle: '판매 전표 업로드 완료',
    successMsg: '판매 전표 업로드가 완료되었습니다',
  },
  purchase: {
    title: 'UPM 매입 전표 업로드',
    description: 'UPM에서 내보낸 매입 전표 Excel 파일을 업로드합니다. 기존 전표는 UPSERT(갱신 또는 생성)로 처리됩니다.',
    color: 'primary' as const,
    completeTitle: '매입 전표 업로드 완료',
    successMsg: '매입 전표 업로드가 완료되었습니다',
  },
};

// ─── 메인 컴포넌트 ───
export default function VoucherUploadPage({ voucherType }: VoucherUploadPageProps) {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const config = VOUCHER_CONFIG[voucherType];

  // ── 상태 ──
  const [activeStep, setActiveStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [templateId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{ total: number; success: number; error: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── 필터 & 정렬 상태 ──
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<SortField>('row_number');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  // ── 확인 다이얼로그 상태 ──
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    cautions: string[];
    confirmLabel: string;
    confirmColor: 'primary' | 'error' | 'warning' | 'success' | 'info';
    loading: boolean;
    onConfirm: () => void;
  }>({
    open: false, title: '', description: '', cautions: [], confirmLabel: '확인', confirmColor: 'primary', loading: false, onConfirm: () => {},
  });

  const openConfirmDialog = (opts: Omit<typeof confirmDialog, 'open' | 'loading'>) => {
    setConfirmDialog({ ...opts, open: true, loading: false });
  };
  const closeConfirmDialog = () => setConfirmDialog((prev) => ({ ...prev, open: false }));

  const steps = ['파일 선택', '미리보기 · 검증', '업로드 완료'];

  // ── 통계 (excluded 제외) ──
  const stats = useMemo(() => {
    const dataRows = preview.filter((r) => r.status !== 'excluded');
    return {
      total: dataRows.length,
      ok: dataRows.filter((r) => r.status === 'ok').length,
      error: dataRows.filter((r) => r.status === 'error').length,
      warning: dataRows.filter((r) => r.status === 'warning').length,
      excluded: preview.filter((r) => r.status === 'excluded').length,
    };
  }, [preview]);

  // ── 필터링 + 정렬 된 데이터 ──
  const filteredRows = useMemo(() => {
    let rows = [...preview];
    // 필터 적용
    if (filter !== 'all') {
      rows = rows.filter((r) => r.status === filter);
    }
    // 정렬 적용
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'row_number': cmp = a.row_number - b.row_number; break;
        case 'trade_date': cmp = a.trade_date.localeCompare(b.trade_date); break;
        case 'counterparty_name': cmp = a.counterparty_name.localeCompare(b.counterparty_name); break;
        case 'voucher_number': cmp = a.voucher_number.localeCompare(b.voucher_number); break;
        case 'quantity': cmp = a.quantity - b.quantity; break;
        case 'amount': cmp = a.amount - b.amount; break;
        case 'memo': cmp = (a.memo || '').localeCompare(b.memo || ''); break;
        case 'status': {
          const order = { error: 0, warning: 1, excluded: 2, ok: 3 };
          cmp = (order[a.status] ?? 3) - (order[b.status] ?? 3);
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [preview, filter, sortField, sortDir]);

  // ── 핸들러 ──
  const validateAndSetFile = useCallback((selectedFile: File) => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setError('지원하는 파일 형식: .xlsx, .xls, .csv');
      return;
    }
    setFile(selectedFile);
    setError(null);
    setActiveStep(0);
    setPreview([]);
    setFilter('all');
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    validateAndSetFile(selected);
  };

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) validateAndSetFile(droppedFile);
  }, [validateAndSetFile]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractErrorMessage = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'object' && detail?.message) return detail.message;
    if (err?.message) return err.message;
    return fallback;
  };

  const executePreview = async () => {
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const res = await settlementApi.previewUpload(file, voucherType, templateId || undefined);
      const data = res.data as unknown as { rows: PreviewRow[] };
      setPreview(data.rows || []);
      setActiveStep(1);
      setFilter('all');
      setSortField('row_number');
      setSortDir('asc');
    } catch (err) {
      setError(extractErrorMessage(err, '파일 미리보기에 실패했습니다. 파일 형식을 확인해주세요.'));
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = () => {
    if (!file) return;
    openConfirmDialog({
      title: '미리보기 검증 실행',
      description: `"${file.name}" 파일을 분석하여 데이터를 검증합니다. 이 단계에서는 실제 업로드가 진행되지 않습니다.`,
      cautions: [
        '파일 크기에 따라 수 초에서 수십 초가 소요될 수 있습니다.',
        '합계/소계 행은 자동으로 감지되어 제외됩니다.',
        '오류가 있는 행은 업로드 전에 확인하실 수 있습니다.',
      ],
      confirmLabel: '검증 시작',
      confirmColor: 'primary',
      onConfirm: () => { closeConfirmDialog(); executePreview(); },
    });
  };

  const executeUpload = async () => {
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const res = await settlementApi.uploadVoucherExcel(file, voucherType, templateId || undefined);
      // 백엔드가 UploadJobResponse를 반환 (id, job_type, status, ...)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = res.data as any;
      // UploadJobResponse 또는 기존 형식 모두 대응
      const jobIdValue = data.job_id || data.id || null;
      setJobId(jobIdValue ? String(jobIdValue) : null);
      // 미리보기 통계를 기반으로 업로드 결과 표시
      const dataRows = preview.filter((r) => r.status !== 'excluded');
      setUploadResult({
        total: data.total ?? dataRows.length,
        success: data.success ?? dataRows.filter((r) => r.status === 'ok' || r.status === 'warning').length,
        error: data.error ?? dataRows.filter((r) => r.status === 'error').length,
      });
      setActiveStep(2);
      enqueueSnackbar(config.successMsg, { variant: 'success' });
    } catch (err) {
      setError(extractErrorMessage(err, '업로드에 실패했습니다.'));
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = () => {
    if (!file) return;
    const dataRows = preview.filter((r) => r.status !== 'excluded');
    const warningCount = dataRows.filter((r) => r.status === 'warning').length;
    const cautions = [
      '업로드 후 작업 내역 페이지에서 확정 처리가 필요합니다.',
      '기존 전표와 동일한 데이터가 있으면 UPSERT(갱신)로 처리됩니다.',
    ];
    if (warningCount > 0) cautions.push(`경고 ${warningCount}건이 포함되어 있습니다. 업로드 후 확인해주세요.`);
    if (stats.excluded > 0) cautions.push(`합계/소계 ${stats.excluded}건은 자동 제외됩니다.`);
    openConfirmDialog({
      title: '업로드 실행',
      description: `"${file.name}" 파일의 ${dataRows.length}건 데이터를 업로드합니다.`,
      cautions,
      confirmLabel: '업로드 시작',
      confirmColor: 'success',
      onConfirm: () => { closeConfirmDialog(); executeUpload(); },
    });
  };

  const handleReset = () => {
    setFile(null);
    setActiveStep(0);
    setPreview([]);
    setJobId(null);
    setUploadResult(null);
    setError(null);
    setFilter('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleChipFilter = (type: FilterType) => {
    setFilter((prev) => (prev === type ? 'all' : type));
  };

  // ── 상태 아이콘 렌더 ──
  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />;
      case 'warning': return <WarningIcon fontSize="small" sx={{ color: 'warning.main' }} />;
      case 'error': return <ErrorIcon fontSize="small" sx={{ color: 'error.main' }} />;
      case 'excluded': return <ExcludedIcon fontSize="small" sx={{ color: 'text.disabled' }} />;
      default: return null;
    }
  };

  // ── 숫자 포매팅 ──
  const fmtNum = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

  // ── 테이블 헤더 셀 ──
  const SortableCell = ({ field, label, align }: { field: SortField; label: string; align?: 'left' | 'right' | 'center' }) => (
    <TableCell
      align={align}
      sortDirection={sortField === field ? sortDir : false}
      sx={{
        fontWeight: 700,
        fontSize: '0.75rem',
        color: 'text.secondary',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        bgcolor: alpha(theme.palette.background.default, 0.6),
        borderBottom: `2px solid ${theme.palette.divider}`,
        py: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <TableSortLabel
        active={sortField === field}
        direction={sortField === field ? sortDir : 'asc'}
        onClick={() => handleSort(field)}
        sx={{ '&.Mui-active': { color: 'text.secondary' } }}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );

  // ── 행 배경색 ──
  const getRowBg = (status: string) => {
    switch (status) {
      case 'error': return alpha(theme.palette.error.main, 0.04);
      case 'warning': return alpha(theme.palette.warning.main, 0.03);
      case 'excluded': return alpha(theme.palette.action.disabled, 0.04);
      default: return 'transparent';
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* ─── 헤더 ─── */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            {config.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {config.description}
          </Typography>
        </Box>
        <Button
          variant="text"
          size="small"
          startIcon={<HistoryIcon />}
          onClick={() => router.push('/settlement/upload/jobs')}
          sx={{ whiteSpace: 'nowrap', mt: 0.5 }}
        >
          작업 내역
        </Button>
      </Stack>

      {/* ─── 스테퍼 ─── */}
      <Paper elevation={0} sx={{ px: 4, py: 2.5, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Stepper activeStep={activeStep} alternativeLabel>
          {steps.map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {uploading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      {/* ════════════════════════════════════════
          Step 0: 파일 선택 (드래그 앤 드롭)
         ════════════════════════════════════════ */}
      {activeStep === 0 && (
        <Fade in timeout={300}>
          <Box>
            <Paper
              elevation={0}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              sx={{
                p: 6,
                border: '2px dashed',
                borderColor: isDragging ? 'primary.main' : file ? 'primary.main' : 'divider',
                borderRadius: 3,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: isDragging
                  ? alpha(theme.palette.primary.main, 0.08)
                  : file
                    ? alpha(theme.palette.primary.main, 0.03)
                    : 'background.paper',
                transition: 'all 0.2s ease-in-out',
                transform: isDragging ? 'scale(1.005)' : 'scale(1)',
                '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.03) },
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileSelect} />
              {file ? (
                <Stack alignItems="center" spacing={1.5}>
                  <DescriptionIcon sx={{ fontSize: 52, color: 'primary.main' }} />
                  <Typography variant="h6" fontWeight={600}>{file.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{(file.size / 1024).toFixed(1)} KB</Typography>
                  <Button variant="text" size="small" color="inherit" onClick={(e) => { e.stopPropagation(); handleReset(); }}>
                    다른 파일 선택
                  </Button>
                </Stack>
              ) : (
                <Stack alignItems="center" spacing={1}>
                  <CloudUploadIcon sx={{ fontSize: 52, color: isDragging ? 'primary.main' : 'text.disabled' }} />
                  <Typography variant="h6" color={isDragging ? 'primary.main' : 'text.secondary'}>
                    {isDragging ? '여기에 파일을 놓으세요' : '클릭하거나 파일을 드래그하세요'}
                  </Typography>
                  <Typography variant="body2" color="text.disabled">.xlsx, .xls, .csv 파일 지원 (최대 50MB)</Typography>
                </Stack>
              )}
            </Paper>

            {file && (
              <Stack direction="row" spacing={2} sx={{ mt: 3 }} justifyContent="center">
                <Button variant="contained" size="large" startIcon={<PreviewIcon />} onClick={handlePreview} disabled={uploading}>
                  미리보기 · 검증
                </Button>
              </Stack>
            )}
          </Box>
        </Fade>
      )}

      {/* ════════════════════════════════════════
          Step 1: 미리보기 · 검증 (프리미엄)
         ════════════════════════════════════════ */}
      {activeStep === 1 && (
        <Fade in timeout={300}>
          <Box>
            {/* ── 상단 액션 바 (버튼 + 통계) ── */}
            <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              {/* 버튼 행 */}
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                <Button variant="outlined" color="inherit" size="small" onClick={handleReset} startIcon={<RefreshIcon />}>
                  다시 선택
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={stats.error > 0 ? <ErrorIcon /> : <FileUploadIcon />}
                  onClick={handleUpload}
                  disabled={uploading || stats.error > 0}
                  sx={{ px: 3 }}
                >
                  {stats.error > 0 ? `오류 ${stats.error}건 수정 필요` : '업로드 확정'}
                </Button>
                <Box sx={{ flex: 1 }} />
                <Typography variant="caption" color="text.disabled">
                  {filter !== 'all'
                    ? `${filteredRows.length}건 표시 (전체 ${preview.length}건 중)`
                    : `${preview.length}건`
                  }
                </Typography>
              </Stack>
              <Divider sx={{ mb: 1.5 }} />
              {/* 필터 Chip 행 */}
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip
                  label={`전체 ${stats.total}건`}
                  variant={filter === 'all' ? 'filled' : 'outlined'}
                  onClick={() => handleChipFilter('all')}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    cursor: 'pointer',
                    ...(filter === 'all' && { bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', borderColor: 'primary.main' }),
                  }}
                />
                <Chip
                  icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                  label={`정상 ${stats.ok}`}
                  variant={filter === 'ok' ? 'filled' : 'outlined'}
                  color="success"
                  onClick={() => handleChipFilter('ok')}
                  size="small"
                  sx={{ fontWeight: 600, cursor: 'pointer' }}
                />
                {stats.error > 0 && (
                  <Chip
                    icon={<ErrorIcon sx={{ fontSize: 14 }} />}
                    label={`오류 ${stats.error}`}
                    variant={filter === 'error' ? 'filled' : 'outlined'}
                    color="error"
                    onClick={() => handleChipFilter('error')}
                    size="small"
                    sx={{ fontWeight: 600, cursor: 'pointer' }}
                  />
                )}
                {stats.warning > 0 && (
                  <Chip
                    icon={<WarningIcon sx={{ fontSize: 14 }} />}
                    label={`경고 ${stats.warning}`}
                    variant={filter === 'warning' ? 'filled' : 'outlined'}
                    color="warning"
                    onClick={() => handleChipFilter('warning')}
                    size="small"
                    sx={{ fontWeight: 600, cursor: 'pointer' }}
                  />
                )}
                {stats.excluded > 0 && (
                  <Chip
                    icon={<ExcludedIcon sx={{ fontSize: 14 }} />}
                    label={`제외 ${stats.excluded}`}
                    variant={filter === 'excluded' ? 'filled' : 'outlined'}
                    onClick={() => handleChipFilter('excluded')}
                    size="small"
                    sx={{ fontWeight: 600, cursor: 'pointer', color: 'text.secondary' }}
                  />
                )}
                <Box sx={{ flex: 1 }} />
                {filter !== 'all' && (
                  <Chip
                    icon={<FilterIcon sx={{ fontSize: 14 }} />}
                    label={`필터: ${filter === 'ok' ? '정상' : filter === 'error' ? '오류' : filter === 'warning' ? '경고' : '제외'}`}
                    size="small"
                    onDelete={() => setFilter('all')}
                    sx={{ fontWeight: 500 }}
                  />
                )}
                {stats.excluded > 0 && (
                  <Tooltip title="합계/소계 행은 자동으로 감지되어 업로드에서 제외됩니다" arrow>
                    <IconButton size="small"><InfoIcon fontSize="small" sx={{ color: 'text.disabled' }} /></IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Paper>

            {/* ── 데이터 테이블 ── */}
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                // 화면 높이에서 상단 요소 높이를 뺀 나머지를 테이블에 할당
                maxHeight: 'calc(100vh - 380px)',
                minHeight: 300,
              }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <SortableCell field="row_number" label="#" />
                    <SortableCell field="trade_date" label="거래일" />
                    <SortableCell field="counterparty_name" label="거래처" />
                    <SortableCell field="voucher_number" label="전표번호" />
                    <SortableCell field="quantity" label="수량" align="right" />
                    <SortableCell field="amount" label="금액" align="right" />
                    <SortableCell field="memo" label="비고" />
                    <SortableCell field="status" label="상태" align="center" />
                    <TableCell sx={{
                      fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      bgcolor: alpha(theme.palette.background.default, 0.6),
                      borderBottom: `2px solid ${theme.palette.divider}`, py: 1.2,
                    }}>
                      메시지
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow
                      key={row.row_number}
                      hover
                      sx={{
                        bgcolor: getRowBg(row.status),
                        opacity: row.status === 'excluded' ? 0.55 : 1,
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                        // 컴팩트 행 높이
                        '& .MuiTableCell-root': { py: 0.7, fontSize: '0.82rem' },
                      }}
                    >
                      <TableCell sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{row.row_number}</TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{row.trade_date || '—'}</TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.counterparty_name || '—'}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', bgcolor: alpha(theme.palette.text.primary, 0.04), px: 0.8, py: 0.2, borderRadius: 0.5 }}>
                          {row.voucher_number || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(row.quantity)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtNum(row.amount)}</TableCell>
                      <TableCell sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.memo ? (
                          <Tooltip title={row.memo} arrow placement="top" disableHoverListener={row.memo.length <= 15}>
                            <Typography variant="body2" component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary' }} noWrap>
                              {row.memo}
                            </Typography>
                          </Tooltip>
                        ) : '—'}
                      </TableCell>
                      <TableCell align="center">{renderStatusIcon(row.status)}</TableCell>
                      <TableCell sx={{ color: row.status === 'error' ? 'error.main' : row.status === 'warning' ? 'warning.dark' : 'text.secondary', fontSize: '0.78rem' }}>
                        {row.message || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.disabled' }}>
                        {filter !== 'all' ? '해당 조건에 맞는 데이터가 없습니다' : '데이터가 없습니다'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* 하단 여백 */}
            <Box sx={{ mt: 1 }} />
          </Box>
        </Fade>
      )}

      {/* ════════════════════════════════════════
          Step 2: 완료
         ════════════════════════════════════════ */}
      {activeStep === 2 && uploadResult && (
        <Fade in timeout={300}>
          <Paper elevation={0} sx={{ p: 6, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
              {config.completeTitle}
            </Typography>
            <Stack direction="row" spacing={4} justifyContent="center" sx={{ my: 3 }}>
              <Box>
                <Typography variant="h4" fontWeight={700}>{fmtNum(uploadResult.total)}</Typography>
                <Typography variant="body2" color="text.secondary">전체</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography variant="h4" fontWeight={700} color="success.main">{fmtNum(uploadResult.success)}</Typography>
                <Typography variant="body2" color="text.secondary">성공</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography variant="h4" fontWeight={700} color="error.main">{fmtNum(uploadResult.error)}</Typography>
                <Typography variant="body2" color="text.secondary">실패</Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button variant="outlined" onClick={handleReset} startIcon={<RefreshIcon />}>추가 업로드</Button>
              <Button variant="contained" onClick={() => router.push('/settlement/vouchers')}>전표 원장 보기</Button>
              {jobId && <Button variant="text" onClick={() => router.push('/settlement/upload/jobs')}>작업 내역 보기</Button>}
            </Stack>
          </Paper>
        </Fade>
      )}

      {/* ════════════════════════════════════════
          공통 확인 다이얼로그 (프리미엄)
         ════════════════════════════════════════ */}
      <Dialog
        open={confirmDialog.open}
        onClose={closeConfirmDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, overflow: 'hidden' },
        }}
      >
        {/* 상단 색상 바 */}
        <Box sx={{
          height: 4,
          bgcolor: confirmDialog.confirmColor === 'error' ? 'error.main'
            : confirmDialog.confirmColor === 'warning' ? 'warning.main'
            : confirmDialog.confirmColor === 'info' ? 'info.main'
            : confirmDialog.confirmColor === 'success' ? 'success.main'
            : 'primary.main',
        }} />
        <DialogTitle sx={{ pt: 2.5, pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{
              width: 40, height: 40, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: confirmDialog.confirmColor === 'error' ? alpha(theme.palette.error.main, 0.1)
                : confirmDialog.confirmColor === 'warning' ? alpha(theme.palette.warning.main, 0.1)
                : confirmDialog.confirmColor === 'success' ? alpha(theme.palette.success.main, 0.1)
                : confirmDialog.confirmColor === 'info' ? alpha(theme.palette.info.main, 0.1)
                : alpha(theme.palette.primary.main, 0.1),
            }}>
              {confirmDialog.confirmColor === 'error' ? <ErrorIcon color="error" />
                : confirmDialog.confirmColor === 'warning' ? <WarningIcon color="warning" />
                : confirmDialog.confirmColor === 'success' ? <CheckCircleIcon color="success" />
                : confirmDialog.confirmColor === 'info' ? <InfoIcon color="info" />
                : <PreviewIcon color="primary" />}
            </Box>
            <Typography variant="h6" fontWeight={700}>{confirmDialog.title}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {confirmDialog.description}
          </Typography>
          {confirmDialog.cautions.length > 0 && (
            <Paper variant="outlined" sx={{
              p: 2, borderRadius: 2, borderColor: 'divider',
              bgcolor: alpha(theme.palette.warning.main, 0.03),
            }}>
              <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
                <WarningIcon sx={{ fontSize: 16, color: 'warning.main', mt: 0.2 }} />
                <Typography variant="caption" fontWeight={700} color="warning.dark">주의사항</Typography>
              </Stack>
              {confirmDialog.cautions.map((caution, idx) => (
                <Stack key={idx} direction="row" spacing={1} alignItems="flex-start" sx={{ ml: 3, mb: 0.3 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    •  {caution}
                  </Typography>
                </Stack>
              ))}
            </Paper>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
          <Button onClick={closeConfirmDialog} color="inherit" sx={{ fontWeight: 600, mr: 1 }}>
            취소
          </Button>
          <Button
            onClick={confirmDialog.onConfirm}
            color={confirmDialog.confirmColor}
            variant="contained"
            sx={{ fontWeight: 700, px: 3, borderRadius: 2 }}
            disabled={uploading}
            startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {uploading ? '처리중...' : confirmDialog.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
