'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Tooltip, Typography, IconButton, Button,
  Alert, Stack, Divider, FormControl, InputLabel, Select, MenuItem,
  TextField, Paper,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  AutoFixHigh as AutoMatchIcon,
  CheckCircle as ConfirmIcon,
  Edit as EditIcon,
  Warning as DuplicateIcon,
  Block as ExcludeIcon,
} from '@mui/icons-material';
import { useRouter, useParams } from 'next/navigation';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';
import {
  AppPageContainer,
  AppPageHeader,
  AppTableShell,
} from '@/components/ui';

// ─── 타입 ──────────────────────────────────────────────────────────

interface ImportLine {
  id: string;
  line_number: number;
  transaction_date: string;
  description: string;
  amount: number;
  balance_after: number | null;
  counterparty_name_raw: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  status: string;
  bank_reference: string | null;
  match_confidence: number | null;
  transaction_id: string | null;
}

interface ImportJobDetail {
  id: string;
  original_filename: string;
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
  lines: ImportLine[];
}

interface CounterpartyOption {
  id: string;
  name: string;
}

// ─── 상수 ──────────────────────────────────────────────────────────

const formatAmount = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

const JOB_STATUS_MAP: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  uploaded: { label: '업로드됨', color: 'default' },
  parsed: { label: '파싱완료', color: 'info' },
  reviewing: { label: '검수중', color: 'warning' },
  confirmed: { label: '확정', color: 'success' },
  failed: { label: '실패', color: 'error' },
};

const LINE_STATUS_MAP: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  unmatched: { label: '미매칭', color: 'error' },
  matched: { label: '매칭됨', color: 'info' },
  confirmed: { label: '확정', color: 'success' },
  duplicate: { label: '중복', color: 'warning' },
  excluded: { label: '제외', color: 'default' },
};

/**
 * 은행 임포트 상세/검수 페이지
 * 라인별 거래처 매칭 + 확정
 */
export default function BankImportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const { enqueueSnackbar } = useSnackbar();

  // 데이터
  const [job, setJob] = useState<ImportJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);

  // 수정 모드
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editCpId, setEditCpId] = useState('');

  // 액션
  const [matching, setMatching] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // ─── 데이터 로드 ──────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.getBankImportJob(jobId);
      setJob(res.data as unknown as ImportJobDetail);
    } catch {
      enqueueSnackbar('임포트 작업 상세 조회에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [jobId, enqueueSnackbar]);

  const loadCounterparties = useCallback(async () => {
    try {
      const res = await settlementApi.listCounterparties({ page_size: 200 });
      const data = res.data as unknown as { counterparties: CounterpartyOption[] };
      setCounterparties(data.counterparties || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadData();
    loadCounterparties();
  }, [loadData, loadCounterparties]);

  // ─── 자동 매칭 ────────────────────────────────────────────────

  const handleAutoMatch = async () => {
    setMatching(true);
    try {
      await settlementApi.autoMatchBankImport(jobId);
      enqueueSnackbar('자동 매칭이 완료되었습니다.', { variant: 'success' });
      loadData();
    } catch {
      enqueueSnackbar('자동 매칭에 실패했습니다.', { variant: 'error' });
    } finally {
      setMatching(false);
    }
  };

  // ─── 라인 수동 매핑 ──────────────────────────────────────────

  const handleSaveLineMapping = async (lineId: string) => {
    try {
      await settlementApi.updateBankImportLine(jobId, lineId, {
        counterparty_id: editCpId || null,
        status: editCpId ? 'matched' : 'unmatched',
      });
      enqueueSnackbar('거래처 매핑이 업데이트되었습니다.', { variant: 'success' });
      setEditingLineId(null);
      setEditCpId('');
      loadData();
    } catch {
      enqueueSnackbar('매핑 업데이트에 실패했습니다.', { variant: 'error' });
    }
  };

  const handleExcludeLine = async (lineId: string) => {
    try {
      await settlementApi.updateBankImportLine(jobId, lineId, { status: 'excluded' });
      enqueueSnackbar('라인이 제외되었습니다.', { variant: 'success' });
      loadData();
    } catch {
      enqueueSnackbar('제외 처리에 실패했습니다.', { variant: 'error' });
    }
  };

  // ─── 전체 확정 ────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!confirm('매칭 완료된 라인을 확정하시겠습니까? 확정 후 입출금이 자동 생성됩니다.')) return;
    setConfirming(true);
    try {
      await settlementApi.confirmBankImport(jobId);
      enqueueSnackbar('확정 완료 — 입출금이 생성되었습니다.', { variant: 'success' });
      loadData();
    } catch {
      enqueueSnackbar('확정에 실패했습니다.', { variant: 'error' });
    } finally {
      setConfirming(false);
    }
  };

  // ─── 통계 ──────────────────────────────────────────────────────

  const lines = job?.lines || [];
  const unmatchedCount = lines.filter((l) => l.status === 'unmatched').length;
  const matchedCount = lines.filter((l) => l.status === 'matched').length;
  const confirmedCount = lines.filter((l) => l.status === 'confirmed').length;
  const duplicateCount = lines.filter((l) => l.status === 'duplicate').length;
  const excludedCount = lines.filter((l) => l.status === 'excluded').length;
  const totalDeposit = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const totalWithdrawal = lines.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);
  const canConfirm = job?.status !== 'confirmed' && matchedCount > 0;

  const jobStatusInfo = job ? JOB_STATUS_MAP[job.status] || { label: job.status, color: 'default' as const } : null;

  // ─── 렌더 ──────────────────────────────────────────────────────

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={
          <IconButton size="small" onClick={() => router.push('/settlement/bank-import')}>
            <BackIcon />
          </IconButton>
        }
        title={job?.original_filename || '은행 임포트 상세'}
        description={
          job
            ? `${job.bank_name || '은행'} | ${job.account_number || '-'} | ${job.import_date_from || ''} ~ ${job.import_date_to || ''}`
            : ''
        }
        color="info"
        count={job?.total_lines}
        actions={
          job?.status !== 'confirmed'
            ? [
                {
                  label: matching ? '매칭 중...' : '자동 매칭',
                  onClick: handleAutoMatch,
                  variant: 'outlined' as const,
                  icon: <AutoMatchIcon />,
                  disabled: matching,
                },
                {
                  label: confirming ? '확정 중...' : '확정',
                  onClick: handleConfirm,
                  variant: 'contained' as const,
                  icon: <ConfirmIcon />,
                  disabled: !canConfirm || confirming,
                },
              ]
            : []
        }
      />

      {/* 상태 요약 */}
      {job && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">상태</Typography>
              <Box>
                {jobStatusInfo && (
                  <Chip label={jobStatusInfo.label} color={jobStatusInfo.color} size="small" />
                )}
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">전체</Typography>
              <Typography fontWeight={700}>{job.total_lines}건</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">미매칭</Typography>
              <Typography fontWeight={600} color="error.main">{unmatchedCount}건</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">매칭됨</Typography>
              <Typography fontWeight={600} color="info.main">{matchedCount}건</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">확정</Typography>
              <Typography fontWeight={600} color="success.main">{confirmedCount}건</Typography>
            </Box>
            {duplicateCount > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">중복</Typography>
                <Typography fontWeight={600} color="warning.main">{duplicateCount}건</Typography>
              </Box>
            )}
            {excludedCount > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">제외</Typography>
                <Typography fontWeight={600} color="text.disabled">{excludedCount}건</Typography>
              </Box>
            )}
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="caption" color="text.secondary">입금 합계</Typography>
              <Typography fontWeight={600} color="info.main">{formatAmount(totalDeposit)}원</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">출금 합계</Typography>
              <Typography fontWeight={600} color="secondary.main">{formatAmount(totalWithdrawal)}원</Typography>
            </Box>
          </Box>
          {job.error_message && (
            <Alert severity="error" sx={{ mt: 1 }}>{job.error_message}</Alert>
          )}
        </Paper>
      )}

      {/* 라인 테이블 */}
      <AppTableShell
        loading={loading}
        isEmpty={lines.length === 0}
        emptyMessage="파싱된 라인이 없습니다."
        hidePagination
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 50 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>거래일</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>적요</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>금액</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>원장 거래처명</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>매칭 거래처</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>상태</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>참조번호</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>액션</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line) => {
              const lineStatus = LINE_STATUS_MAP[line.status] || { label: line.status, color: 'default' as const };
              const isDeposit = line.amount > 0;
              const isEditing = editingLineId === line.id;
              const isExcluded = line.status === 'excluded';
              const isConfirmed = line.status === 'confirmed';

              return (
                <TableRow
                  key={line.id}
                  hover
                  sx={{
                    opacity: isExcluded ? 0.4 : 1,
                    bgcolor: line.status === 'duplicate' ? 'warning.50' : undefined,
                  }}
                >
                  <TableCell>{line.line_number}</TableCell>
                  <TableCell>{line.transaction_date}</TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {line.description}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: isDeposit ? 'info.main' : 'secondary.main',
                      }}
                    >
                      {isDeposit ? '+' : ''}{formatAmount(line.amount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 120 }}>
                      {line.counterparty_name_raw || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                          <Select
                            value={editCpId}
                            displayEmpty
                            onChange={(e) => setEditCpId(e.target.value)}
                          >
                            <MenuItem value=""><em>선택 안함</em></MenuItem>
                            {counterparties.map((cp) => (
                              <MenuItem key={cp.id} value={cp.id}>{cp.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Button size="small" variant="contained" onClick={() => handleSaveLineMapping(line.id)}>
                          저장
                        </Button>
                        <Button size="small" onClick={() => { setEditingLineId(null); setEditCpId(''); }}>
                          취소
                        </Button>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" fontWeight={line.counterparty_name ? 500 : 400}>
                          {line.counterparty_name || '-'}
                        </Typography>
                        {line.match_confidence != null && line.match_confidence < 1 && (
                          <Tooltip title={`매칭 신뢰도: ${Math.round(line.match_confidence * 100)}%`}>
                            <Typography variant="caption" color="warning.main">
                              ({Math.round(line.match_confidence * 100)}%)
                            </Typography>
                          </Tooltip>
                        )}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={lineStatus.label} color={lineStatus.color} size="small" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 100 }}>
                      {line.bank_reference || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {!isConfirmed && !isExcluded && (
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="거래처 매핑">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => {
                              setEditingLineId(line.id);
                              setEditCpId(line.counterparty_id || '');
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="제외">
                          <IconButton
                            size="small"
                            color="default"
                            onClick={() => handleExcludeLine(line.id)}
                          >
                            <ExcludeIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
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
