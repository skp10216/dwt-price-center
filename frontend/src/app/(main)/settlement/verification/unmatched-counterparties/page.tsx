'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Stack, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, alpha, useTheme, IconButton, Tooltip,
  Chip, Autocomplete, Alert, CircularProgress,
} from '@mui/material';
import {
  Warning as WarningIcon,
} from '@mui/icons-material';
import {
  Link as LinkIcon,
  Refresh as RefreshIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
import { settlementApi } from '@/lib/api';
import { useSnackbar } from 'notistack';

interface UnmatchedItem {
  alias_name: string;
  count: number;
  first_seen: string;
}

interface CounterpartyOption {
  id: string;
  name: string;
}

/**
 * 미매칭 거래처 처리 (별칭 매핑)
 */
export default function UnmatchedCounterpartiesPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const [unmatched, setUnmatched] = useState<UnmatchedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAlias, setSelectedAlias] = useState('');
  const [selectedCounterparty, setSelectedCounterparty] = useState<CounterpartyOption | null>(null);
  const [newCounterpartyName, setNewCounterpartyName] = useState('');
  const [mapping, setMapping] = useState(false);

  // ── 확인 다이얼로그 ──
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const loadUnmatched = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.listUnmatchedCounterparties();
      const data = res.data as unknown as { unmatched: UnmatchedItem[]; total: number };
      setUnmatched(data.unmatched || []);
    } catch {
      // handle
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCounterparties = useCallback(async () => {
    try {
      const res = await settlementApi.listCounterparties({ page_size: 9999 });
      const data = res.data as unknown as { counterparties: CounterpartyOption[] };
      setCounterparties(data.counterparties || []);
    } catch {
      // handle
    }
  }, []);

  useEffect(() => { loadUnmatched(); loadCounterparties(); }, [loadUnmatched, loadCounterparties]);

  const openMapping = (aliasName: string) => {
    setSelectedAlias(aliasName);
    setSelectedCounterparty(null);
    setNewCounterpartyName('');
    setDialogOpen(true);
  };

  const executeMap = async () => {
    try {
      setMapping(true);
      if (selectedCounterparty) {
        await settlementApi.mapUnmatchedCounterparty(selectedAlias, { counterparty_id: selectedCounterparty.id });
        enqueueSnackbar(`"${selectedAlias}"을(를) "${selectedCounterparty.name}"에 매핑했습니다`, { variant: 'success' });
      } else if (newCounterpartyName) {
        await settlementApi.mapUnmatchedCounterparty(selectedAlias, { new_counterparty_name: newCounterpartyName });
        enqueueSnackbar(`"${selectedAlias}" → 새 거래처 "${newCounterpartyName}" 생성 및 매핑 완료`, { variant: 'success' });
      }
      setDialogOpen(false);
      setConfirmDialogOpen(false);
      loadUnmatched();
      loadCounterparties();
    } catch {
      enqueueSnackbar('매핑에 실패했습니다', { variant: 'error' });
    } finally {
      setMapping(false);
    }
  };

  const handleMap = () => {
    setConfirmDialogOpen(true);
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>미매칭 거래처 처리</Typography>
          <Typography variant="body2" color="text.secondary">
            업로드 시 기존 거래처와 매칭되지 않은 이름들을 확인하고, 별칭으로 매핑합니다.
          </Typography>
        </Box>
        <Tooltip title="새로고침"><IconButton onClick={loadUnmatched}><RefreshIcon /></IconButton></Tooltip>
      </Stack>

      {unmatched.length === 0 && !loading && (
        <Alert severity="success" sx={{ mb: 2 }}>모든 거래처가 매칭되었습니다. 미매칭 항목이 없습니다.</Alert>
      )}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.warning.main, 0.04) }}>
              <TableCell sx={{ fontWeight: 700 }}>미매칭 거래처명</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>발생 건수</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>최초 발견일</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>매핑</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 8 }}>로딩 중...</TableCell></TableRow>
            ) : unmatched.length === 0 ? (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 8 }}>
                <BusinessIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">미매칭 거래처가 없습니다</Typography>
              </TableCell></TableRow>
            ) : (
              unmatched.map((item) => (
                <TableRow key={item.alias_name} hover sx={{ bgcolor: alpha(theme.palette.warning.main, 0.04) }}>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <BusinessIcon fontSize="small" color="warning" />
                      <span>{item.alias_name}</span>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Chip label={`${item.count}건`} size="small" color="warning" />
                  </TableCell>
                  <TableCell>{item.first_seen ? new Date(item.first_seen).toLocaleDateString('ko-KR') : '-'}</TableCell>
                  <TableCell align="center">
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<LinkIcon />}
                      onClick={() => openMapping(item.alias_name)}
                    >
                      매핑
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 매핑 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>거래처 매핑</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
              <strong>&quot;{selectedAlias}&quot;</strong>을(를) 기존 거래처에 매핑하거나 새 거래처를 생성합니다.
            </Alert>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>기존 거래처에 매핑</Typography>
            <Autocomplete
              options={counterparties}
              getOptionLabel={(opt) => opt.name}
              value={selectedCounterparty}
              onChange={(_, val) => { setSelectedCounterparty(val); if (val) setNewCounterpartyName(''); }}
              renderInput={(params) => <TextField {...params} placeholder="거래처 검색..." size="small" />}
              sx={{ mb: 3 }}
            />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>또는 새 거래처 생성</Typography>
            <TextField
              placeholder="새 거래처명 입력"
              value={newCounterpartyName}
              onChange={(e) => { setNewCounterpartyName(e.target.value); if (e.target.value) setSelectedCounterparty(null); }}
              fullWidth
              size="small"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} color="inherit">취소</Button>
          <Button
            variant="contained"
            onClick={handleMap}
            disabled={!selectedCounterparty && !newCounterpartyName}
            sx={{ fontWeight: 700, borderRadius: 2 }}
          >
            매핑 확정
          </Button>
        </DialogActions>
      </Dialog>

      {/* 매핑 확인 다이얼로그 (프리미엄) */}
      <Dialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <Box sx={{ height: 4, bgcolor: 'primary.main' }} />
        <DialogTitle sx={{ pt: 2.5, pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{
              width: 40, height: 40, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: alpha(theme.palette.primary.main, 0.1),
            }}>
              <LinkIcon color="primary" />
            </Box>
            <Typography variant="h6" fontWeight={700}>거래처 매핑 확인</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {selectedCounterparty
              ? <>미매칭 거래처 <strong>&quot;{selectedAlias}&quot;</strong>을(를) 기존 거래처 <strong>&quot;{selectedCounterparty.name}&quot;</strong>에 매핑합니다.</>
              : <>미매칭 거래처 <strong>&quot;{selectedAlias}&quot;</strong>을(를) 새 거래처 <strong>&quot;{newCounterpartyName}&quot;</strong>으로 등록 및 매핑합니다.</>
            }
          </Typography>
          <Paper variant="outlined" sx={{
            p: 2, borderRadius: 2, borderColor: 'divider',
            bgcolor: alpha(theme.palette.warning.main, 0.03),
          }}>
            <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
              <WarningIcon sx={{ fontSize: 16, color: 'warning.main', mt: 0.2 }} />
              <Typography variant="caption" fontWeight={700} color="warning.dark">주의사항</Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ ml: 3, mb: 0.3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                •  매핑 후 해당 별칭의 모든 전표가 지정된 거래처로 연결됩니다.
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ ml: 3, mb: 0.3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                •  잘못된 매핑은 거래처 관리 페이지에서 수정할 수 있습니다.
              </Typography>
            </Stack>
            {!selectedCounterparty && newCounterpartyName && (
              <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ ml: 3, mb: 0.3 }}>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  •  새 거래처가 시스템에 등록됩니다.
                </Typography>
              </Stack>
            )}
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
          <Button onClick={() => setConfirmDialogOpen(false)} color="inherit" sx={{ fontWeight: 600, mr: 1 }}>
            취소
          </Button>
          <Button
            onClick={executeMap}
            color="primary"
            variant="contained"
            disabled={mapping}
            sx={{ fontWeight: 700, px: 3, borderRadius: 2 }}
            startIcon={mapping ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {mapping ? '처리중...' : '매핑 실행'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
