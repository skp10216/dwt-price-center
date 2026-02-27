'use client';

import { useState, Suspense } from 'react';
import {
  Box, Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, AlertTitle, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import {
  SwapHoriz as SwapHorizIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { settlementApi } from '@/lib/api';
import { AppPageContainer, AppPageHeader } from '@/components/ui';
import TransactionCreateDialog from '@/components/settlement/TransactionCreateDialog';
import AllocationDialog from '@/components/settlement/AllocationDialog';

import CashEventProvider, { useCashEvent } from './_components/CashEventProvider';
import CashEventToolbar from './_components/CashEventToolbar';
import CashEventGridView from './_components/CashEventGridView';
import CashEventTimelineView from './_components/CashEventTimelineView';
import CashEventDetailDrawer from './_components/CashEventDetailDrawer';

// ─── 내부 컴포넌트 (Provider 내부에서 사용) ──────────────────────

function TransactionsPageContent() {
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const {
    total, loading, viewMode, detailId, selected, setSelected,
    loadData,
  } = useCashEvent();

  // 다이얼로그
  const [createOpen, setCreateOpen] = useState(false);
  const [allocDialogOpen, setAllocDialogOpen] = useState(false);
  const [selectedTxnId, setSelectedTxnId] = useState('');

  // 일괄 취소
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // 보류/숨김 (그리드에서 직접 호출)
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [holdTargetId, setHoldTargetId] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdLoading, setHoldLoading] = useState(false);

  const [hideDialogOpen, setHideDialogOpen] = useState(false);
  const [hideTargetId, setHideTargetId] = useState('');
  const [hideReason, setHideReason] = useState('');
  const [hideLoading, setHideLoading] = useState(false);

  // 배분 열기
  const handleAllocate = (id: string) => {
    setSelectedTxnId(id);
    setAllocDialogOpen(true);
  };

  // 개별 취소
  const handleCancel = async (id: string) => {
    if (!confirm('이 입출금을 취소하시겠습니까? 연결된 배분도 모두 해제됩니다.')) return;
    try {
      await settlementApi.cancelTransaction(id);
      enqueueSnackbar('입출금이 취소되었습니다.', { variant: 'success' });
      loadData();
    } catch {
      enqueueSnackbar('취소에 실패했습니다.', { variant: 'error' });
    }
  };

  // 일괄 취소
  const handleBatchCancel = async () => {
    if (selected.size === 0) return;
    setCancelling(true);
    try {
      const res = await settlementApi.batchCancelTransactions(Array.from(selected));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (res.data as any)?.data ?? res.data;
      enqueueSnackbar(
        `${result.cancelled_count}건 취소 완료${result.skipped_count > 0 ? ` / ${result.skipped_count}건 건너뜀` : ''}`,
        { variant: result.cancelled_count > 0 ? 'success' : 'warning' },
      );
      setCancelDialogOpen(false);
      setSelected(new Set());
      loadData();
    } catch {
      enqueueSnackbar('일괄 취소에 실패했습니다.', { variant: 'error' });
    } finally {
      setCancelling(false);
    }
  };

  // 보류 (그리드 메뉴에서 호출)
  const handleHold = (id: string) => {
    setHoldTargetId(id);
    setHoldReason('');
    setHoldDialogOpen(true);
  };
  const executeHold = async () => {
    if (!holdReason.trim()) return;
    setHoldLoading(true);
    try {
      await settlementApi.holdTransaction(holdTargetId, holdReason);
      enqueueSnackbar('보류 처리되었습니다.', { variant: 'success' });
      setHoldDialogOpen(false);
      loadData();
    } catch {
      enqueueSnackbar('보류 처리에 실패했습니다.', { variant: 'error' });
    } finally {
      setHoldLoading(false);
    }
  };

  // 숨김 (그리드 메뉴에서 호출)
  const handleHide = (id: string) => {
    setHideTargetId(id);
    setHideReason('');
    setHideDialogOpen(true);
  };
  const executeHide = async () => {
    setHideLoading(true);
    try {
      await settlementApi.hideTransaction(hideTargetId, hideReason || undefined);
      enqueueSnackbar('숨김 처리되었습니다.', { variant: 'success' });
      setHideDialogOpen(false);
      loadData();
    } catch {
      enqueueSnackbar('숨김 처리에 실패했습니다.', { variant: 'error' });
    } finally {
      setHideLoading(false);
    }
  };

  // Drawer 열려있을 때 메인 컨텐츠 폭 조정
  const drawerWidth = 440;
  const hasDrawer = !!detailId && !isMobile;

  const headerActions = [
    ...(selected.size > 0 ? [{
      label: `${selected.size}건 취소`,
      onClick: () => setCancelDialogOpen(true),
      variant: 'contained' as const,
      color: 'error' as const,
      icon: <DeleteIcon />,
    }] : []),
    {
      label: '입출금 등록',
      onClick: () => setCreateOpen(true),
      variant: 'contained' as const,
      icon: <AddIcon />,
    },
  ];

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* 메인 컨텐츠 */}
      <Box
        sx={{
          flex: 1,
          transition: 'margin-right 0.2s',
          marginRight: hasDrawer ? `${drawerWidth}px` : 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <AppPageContainer>
          <AppPageHeader
            icon={<SwapHorizIcon />}
            title="입출금 관리"
            description="거래처 수준 입출금 이벤트 등록 및 전표 배분"
            color="info"
            count={loading ? null : total}
            onRefresh={loadData}
            loading={loading}
            actions={headerActions}
          />

          <CashEventToolbar />

          {/* 뷰 전환 */}
          {viewMode === 'grid' ? (
            <CashEventGridView
              onAllocate={handleAllocate}
              onCancel={handleCancel}
              onHold={handleHold}
              onHide={handleHide}
            />
          ) : (
            <CashEventTimelineView />
          )}
        </AppPageContainer>
      </Box>

      {/* Detail Drawer */}
      <CashEventDetailDrawer onAllocate={handleAllocate} />

      {/* 일괄 취소 다이얼로그 */}
      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="error" />
          입출금 일괄 취소
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>주의</AlertTitle>
            선택한 <strong>{selected.size}건</strong>의 입출금을 취소합니다.
          </Alert>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            • 연결된 전표 배분이 모두 해제됩니다.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • 이미 취소된 건은 건너뜁니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCancelDialogOpen(false)} disabled={cancelling}>닫기</Button>
          <Button variant="contained" color="error" onClick={handleBatchCancel} disabled={cancelling}>
            {cancelling ? '취소 중...' : `${selected.size}건 취소`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 보류 사유 다이얼로그 */}
      <Dialog open={holdDialogOpen} onClose={() => setHoldDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>보류 처리</DialogTitle>
        <DialogContent>
          <Box component="label" sx={{ mt: 1, display: 'block' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              보류 사유를 입력하세요.
            </Typography>
            <textarea
              rows={3}
              style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 4, border: '1px solid #ccc' }}
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHoldDialogOpen(false)} disabled={holdLoading}>닫기</Button>
          <Button variant="contained" color="warning" onClick={executeHold} disabled={holdLoading || !holdReason.trim()}>
            {holdLoading ? '처리 중...' : '보류 처리'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 숨김 사유 다이얼로그 */}
      <Dialog open={hideDialogOpen} onClose={() => setHideDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>숨김 처리</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            숨김 처리된 항목은 기본 목록에서 표시되지 않습니다.
          </Typography>
          <textarea
            rows={2}
            style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 4, border: '1px solid #ccc' }}
            placeholder="숨김 사유 (선택)"
            value={hideReason}
            onChange={(e) => setHideReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHideDialogOpen(false)} disabled={hideLoading}>닫기</Button>
          <Button variant="contained" onClick={executeHide} disabled={hideLoading}>
            {hideLoading ? '처리 중...' : '숨김 처리'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 등록 다이얼로그 */}
      <TransactionCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={loadData}
      />

      {/* 배분 다이얼로그 */}
      <AllocationDialog
        open={allocDialogOpen}
        onClose={() => setAllocDialogOpen(false)}
        onAllocated={loadData}
        transactionId={selectedTxnId}
      />
    </Box>
  );
}

// ─── 페이지 (래퍼) ──────────────────────────────────────────────

export default function TransactionsPage() {
  return (
    <Suspense>
      <CashEventProvider>
        <TransactionsPageContent />
      </CashEventProvider>
    </Suspense>
  );
}
