'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Stack, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, alpha, useTheme, IconButton, Tooltip,
  Chip, Autocomplete, Alert,
} from '@mui/material';
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

  const loadUnmatched = useCallback(async () => {
    try {
      setLoading(true);
      const res = await settlementApi.listUnmatchedCounterparties();
      const data = res.data as { unmatched: UnmatchedItem[]; total: number };
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
      const data = res.data as { counterparties: CounterpartyOption[] };
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

  const handleMap = async () => {
    try {
      if (selectedCounterparty) {
        await settlementApi.mapUnmatchedCounterparty(selectedAlias, selectedCounterparty.id);
        enqueueSnackbar(`"${selectedAlias}"을(를) "${selectedCounterparty.name}"에 매핑했습니다`, { variant: 'success' });
      } else if (newCounterpartyName) {
        // 새 거래처 생성 후 매핑
        const createRes = await settlementApi.createCounterparty({ name: newCounterpartyName });
        const newCp = createRes.data as CounterpartyOption;
        await settlementApi.mapUnmatchedCounterparty(selectedAlias, newCp.id);
        enqueueSnackbar(`"${selectedAlias}" → 새 거래처 "${newCounterpartyName}" 생성 및 매핑 완료`, { variant: 'success' });
      }
      setDialogOpen(false);
      loadUnmatched();
      loadCounterparties();
    } catch {
      enqueueSnackbar('매핑에 실패했습니다', { variant: 'error' });
    }
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
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>거래처 매핑</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
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
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleMap}
            disabled={!selectedCounterparty && !newCounterpartyName}
          >
            매핑 확정
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
