'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, TextField, Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Tooltip, Typography, IconButton, InputAdornment,
  Button, Alert, LinearProgress, Paper, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import {
  Search as SearchIcon,
  CloudUpload as UploadIcon,
  AccountBalanceWallet as BankImportIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import { useAppRouter } from '@/lib/navigation';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import {
  AppPageContainer,
  AppPageHeader,
  AppPageToolbar,
  AppTableShell,
} from '@/components/ui';

// ─── 타입 ──────────────────────────────────────────────────────────

interface ImportJobRow {
  id: string;
  original_filename: string;
  corporate_entity_id: string | null;
  corporate_entity_name: string | null;
  bank_name: string;
  account_number: string;
  import_date_from: string | null;
  import_date_to: string | null;
  status: string;
  total_lines: number;
  matched_lines: number;
  confirmed_lines: number;
  error_message: string | null;
  created_by_name: string;
  created_at: string;
  confirmed_at: string | null;
}

interface CorporateEntityOption {
  id: string;
  name: string;
}

// ─── 상수 ──────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  uploaded: { label: '업로드됨', color: 'default' },
  parsed: { label: '파싱완료', color: 'info' },
  reviewing: { label: '검수중', color: 'warning' },
  confirmed: { label: '확정', color: 'success' },
  failed: { label: '실패', color: 'error' },
};

/**
 * 은행 임포트 페이지
 * 은행 파일 업로드 + 작업 목록 관리
 */
export default function BankImportPage() {
  const router = useAppRouter();
  const { enqueueSnackbar } = useSnackbar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 데이터
  const [jobs, setJobs] = useState<ImportJobRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  // 법인
  const [corporateEntities, setCorporateEntities] = useState<CorporateEntityOption[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState('');

  // 필터
  const [search, setSearch] = useState('');
  const [filterEntityId, setFilterEntityId] = useState('');

  // 업로드
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ─── 법인 로드 ──────────────────────────────────────────────────

  const loadCorporateEntities = useCallback(async () => {
    try {
      const res = await settlementApi.listCorporateEntities({ page_size: 100, is_active: true });
      const data = res.data as unknown as { corporate_entities: CorporateEntityOption[] };
      setCorporateEntities(data.corporate_entities || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadCorporateEntities(); }, [loadCorporateEntities]);

  // ─── 데이터 로드 ──────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = {
        page: page + 1,
        page_size: pageSize,
      };
      if (search) params.search = search;
      if (filterEntityId) params.corporate_entity_id = filterEntityId;

      const res = await settlementApi.listBankImportJobs(params);
      const data = res.data as unknown as { jobs: ImportJobRow[]; total: number };
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
    } catch {
      enqueueSnackbar('임포트 작업 목록 조회에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterEntityId, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── 파일 업로드 ──────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xlsx', 'xls'].includes(ext)) {
      enqueueSnackbar('Excel(.xlsx, .xls) 파일만 업로드 가능합니다.', { variant: 'warning' });
      return;
    }

    if (!selectedEntityId) {
      enqueueSnackbar('법인을 먼저 선택해 주세요.', { variant: 'warning' });
      return;
    }

    setUploading(true);
    try {
      await settlementApi.uploadBankFile(file, selectedEntityId);
      enqueueSnackbar(`${file.name} 업로드 완료`, { variant: 'success' });
      loadData();
    } catch (err: unknown) {
      // 양식 오류 시 구체적인 메시지 표시
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const detail = axiosErr?.response?.data?.detail;
      if (detail) {
        enqueueSnackbar(detail, { variant: 'error', autoHideDuration: 8000 });
      } else {
        enqueueSnackbar('파일 업로드에 실패했습니다.', { variant: 'error' });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  // ─── 삭제 ──────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm('이 임포트 작업을 삭제하시겠습니까?')) return;
    try {
      await settlementApi.deleteBankImportJob(id);
      enqueueSnackbar('임포트 작업이 삭제되었습니다.', { variant: 'success' });
      loadData();
    } catch {
      enqueueSnackbar('삭제에 실패했습니다.', { variant: 'error' });
    }
  };

  // ─── 렌더 ──────────────────────────────────────────────────────

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<BankImportIcon />}
        title="은행 임포트"
        description="은행 거래내역 파일을 업로드하여 입출금을 일괄 등록"
        color="info"
        count={total}
        actions={[
          {
            label: '파일 업로드',
            onClick: () => fileInputRef.current?.click(),
            variant: 'contained' as const,
            icon: <UploadIcon />,
          },
        ]}
      />

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* 업로드 영역: 법인 선택 + 드래그 앤 드롭 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 0 }}>
        {/* 법인 선택 */}
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>법인 선택</InputLabel>
          <Select
            value={selectedEntityId}
            label="법인 선택"
            onChange={(e) => setSelectedEntityId(e.target.value)}
          >
            <MenuItem value=""><em>선택 안함</em></MenuItem>
            {corporateEntities.map((ce) => (
              <MenuItem key={ce.id} value={ce.id}>{ce.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 드래그 앤 드롭 영역 */}
        <Paper
          variant="outlined"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          sx={{
            flex: 1,
            p: 2,
            textAlign: 'center',
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: dragOver ? 'primary.main' : !selectedEntityId ? 'action.disabled' : 'divider',
            bgcolor: dragOver ? 'action.hover' : 'transparent',
            cursor: selectedEntityId ? 'pointer' : 'default',
            opacity: selectedEntityId ? 1 : 0.6,
            transition: 'all 0.2s',
          }}
          onClick={() => selectedEntityId && fileInputRef.current?.click()}
        >
          {uploading ? (
            <Box>
              <LinearProgress sx={{ mb: 1 }} />
              <Typography variant="body2" color="text.secondary">업로드 중...</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <FileIcon sx={{ fontSize: 24, color: 'text.disabled' }} />
              <Typography variant="body2" color="text.secondary">
                {selectedEntityId
                  ? '거래내역조회 Excel 파일을 드래그하거나 클릭하여 업로드 (.xlsx, .xls)'
                  : '왼쪽에서 법인을 먼저 선택해 주세요'}
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>

      {/* 필터 */}
      <AppPageToolbar
        left={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="파일명/은행명 검색"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              sx={{ minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select
                value={filterEntityId}
                displayEmpty
                onChange={(e) => { setFilterEntityId(e.target.value); setPage(0); }}
              >
                <MenuItem value="">전체 법인</MenuItem>
                {corporateEntities.map((ce) => (
                  <MenuItem key={ce.id} value={ce.id}>{ce.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        }
      />

      {/* 작업 목록 테이블 */}
      <AppTableShell
        loading={loading}
        isEmpty={jobs.length === 0}
        emptyMessage="임포트 작업이 없습니다. 은행 파일을 업로드하여 시작하세요."
        page={page}
        rowsPerPage={pageSize}
        count={total}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>파일명</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>법인</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>기간</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>상태</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>전체</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>매칭</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>확정</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>생성자</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>생성일</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>액션</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((job) => {
              const statusInfo = STATUS_MAP[job.status] || { label: job.status, color: 'default' as const };
              const matchRate = job.total_lines > 0
                ? Math.round((job.matched_lines / job.total_lines) * 100)
                : 0;

              return (
                <TableRow key={job.id} hover>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, fontWeight: 500 }}
                      onClick={() => router.push(`/settlement/bank-import/${job.id}`)}
                    >
                      {job.original_filename}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {job.corporate_entity_name || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {job.import_date_from && job.import_date_to
                      ? `${job.import_date_from} ~ ${job.import_date_to}`
                      : '-'}
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={statusInfo.label} color={statusInfo.color} size="small" />
                  </TableCell>
                  <TableCell align="center">{job.total_lines}</TableCell>
                  <TableCell align="center">
                    <Tooltip title={`매칭률 ${matchRate}%`}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: matchRate === 100 ? 'success.main' : matchRate > 0 ? 'warning.main' : 'text.secondary',
                        }}
                      >
                        {job.matched_lines}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: job.confirmed_lines === job.total_lines ? 'success.main' : 'text.secondary',
                      }}
                    >
                      {job.confirmed_lines}
                    </Typography>
                  </TableCell>
                  <TableCell>{job.created_by_name}</TableCell>
                  <TableCell>
                    {new Date(job.created_at).toLocaleDateString('ko-KR')}
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <Tooltip title="상세/검수">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => router.push(`/settlement/bank-import/${job.id}`)}
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {job.status !== 'confirmed' && (
                        <Tooltip title="삭제">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(job.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </AppTableShell>
    </AppPageContainer>
  );
}
