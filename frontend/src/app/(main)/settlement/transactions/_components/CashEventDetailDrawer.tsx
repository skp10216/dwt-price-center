'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Chip, LinearProgress, Button, Divider,
  Skeleton, Link as MuiLink, Collapse, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import {
  PauseCircle as HoldIcon,
  PlayCircle as UnholdIcon,
  VisibilityOff as HideIcon,
  Visibility as UnhideIcon,
  Cancel as CancelIcon,
  AccountTree as AllocIcon,
  OpenInNew as OpenIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import NextLink from 'next/link';
import { useSnackbar } from 'notistack';
import { settlementApi } from '@/lib/api';
import { AppDetailDrawer } from '@/components/ui';
import { useCashEvent } from './CashEventProvider';
import { STATUS_LABELS, TYPE_LABELS, SOURCE_LABELS, formatAmount } from './constants';

// ─── 타입 ──────────────────────────────────────────────────────

interface AllocationItem {
  id: string;
  voucher_id: string;
  voucher_number: string | null;
  voucher_trade_date: string | null;
  voucher_total_amount: number | null;
  allocated_amount: number;
  allocation_order: number;
  created_at: string;
}

interface TransactionDetail {
  id: string;
  counterparty_id: string;
  counterparty_name: string | null;
  transaction_type: string;
  transaction_date: string;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  memo: string | null;
  source: string;
  bank_reference: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  allocations: AllocationItem[];
}

interface AuditLogItem {
  id: string;
  action: string;
  description: string | null;
  user_name: string | null;
  user_email: string | null;
  created_at: string;
}

// ─── 접기/펼치기 섹션 컴포넌트 ──────────────────────────────────

function CollapsibleSection({
  title,
  defaultOpen = false,
  count,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Box>
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          py: 0.75,
          px: 0.5,
          mx: -0.5,
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
          userSelect: 'none',
        }}
      >
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1, lineHeight: 1.5 }}>
          {title}
          {count !== undefined && count > 0 && (
            <Chip label={count} size="small" sx={{ ml: 1, height: 18, fontSize: '0.7rem' }} />
          )}
        </Typography>
        <IconButton size="small" sx={{ p: 0 }}>
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box sx={{ pt: 0.5, pb: 1 }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── 메인 ──────────────────────────────────────────────────────

interface CashEventDetailDrawerProps {
  onAllocate: (id: string) => void;
}

export default function CashEventDetailDrawer({ onAllocate }: CashEventDetailDrawerProps) {
  const { detailId, setDetailId, loadData } = useCashEvent();
  const { enqueueSnackbar } = useSnackbar();

  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 보류 다이얼로그
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [holdLoading, setHoldLoading] = useState(false);

  // 숨김 다이얼로그
  const [hideOpen, setHideOpen] = useState(false);
  const [hideReason, setHideReason] = useState('');
  const [hideLoading, setHideLoading] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const [txnRes, logRes] = await Promise.all([
        settlementApi.getTransaction(id),
        settlementApi.listActivityLogs({
          target_type: 'counterparty_transaction',
          target_id: id,
          page_size: 20,
        }),
      ]);
      const txn = (txnRes.data as unknown as { data: TransactionDetail })?.data ?? txnRes.data;
      setDetail(txn as TransactionDetail);
      const logs = (logRes.data as unknown as { data: { logs: AuditLogItem[] } })?.data?.logs
        ?? (logRes.data as unknown as { logs: AuditLogItem[] })?.logs
        ?? [];
      setAuditLogs(logs);
    } catch {
      enqueueSnackbar('상세 정보 로드에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    if (detailId) loadDetail(detailId);
    else setDetail(null);
  }, [detailId, loadDetail]);

  // ── 액션 ──

  const handleHold = async () => {
    if (!detail || !holdReason.trim()) return;
    setHoldLoading(true);
    try {
      await settlementApi.holdTransaction(detail.id, holdReason);
      enqueueSnackbar('보류 처리되었습니다.', { variant: 'success' });
      setHoldOpen(false);
      setHoldReason('');
      loadDetail(detail.id);
      loadData();
    } catch {
      enqueueSnackbar('보류 처리에 실패했습니다.', { variant: 'error' });
    } finally {
      setHoldLoading(false);
    }
  };

  const handleUnhold = async () => {
    if (!detail) return;
    try {
      await settlementApi.unholdTransaction(detail.id);
      enqueueSnackbar('보류가 해제되었습니다.', { variant: 'success' });
      loadDetail(detail.id);
      loadData();
    } catch {
      enqueueSnackbar('보류 해제에 실패했습니다.', { variant: 'error' });
    }
  };

  const handleHide = async () => {
    if (!detail) return;
    setHideLoading(true);
    try {
      await settlementApi.hideTransaction(detail.id, hideReason || undefined);
      enqueueSnackbar('숨김 처리되었습니다.', { variant: 'success' });
      setHideOpen(false);
      setHideReason('');
      setDetailId(null);
      loadData();
    } catch {
      enqueueSnackbar('숨김 처리에 실패했습니다.', { variant: 'error' });
    } finally {
      setHideLoading(false);
    }
  };

  const handleUnhide = async () => {
    if (!detail) return;
    try {
      await settlementApi.unhideTransaction(detail.id);
      enqueueSnackbar('숨김이 해제되었습니다.', { variant: 'success' });
      loadDetail(detail.id);
      loadData();
    } catch {
      enqueueSnackbar('숨김 해제에 실패했습니다.', { variant: 'error' });
    }
  };

  const handleCancel = async () => {
    if (!detail) return;
    if (!confirm('이 입출금을 취소하시겠습니까? 연결된 배분도 모두 해제됩니다.')) return;
    try {
      await settlementApi.cancelTransaction(detail.id);
      enqueueSnackbar('취소되었습니다.', { variant: 'success' });
      setDetailId(null);
      loadData();
    } catch {
      enqueueSnackbar('취소에 실패했습니다.', { variant: 'error' });
    }
  };

  const allocPct = detail && detail.amount > 0
    ? Math.min(100, (detail.allocated_amount / detail.amount) * 100)
    : 0;

  const isDeposit = detail?.transaction_type === 'deposit';

  return (
    <>
      <AppDetailDrawer
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title="입출금 상세"
      >
        {loading || !detail ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Skeleton variant="rounded" height={100} />
            <Skeleton variant="rounded" height={60} />
            <Skeleton variant="rounded" height={60} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>

            {/* ━━ 상단 요약 카드 (항상 표시) ━━ */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: isDeposit ? 'info.50' : 'error.50',
                border: '1px solid',
                borderColor: isDeposit ? 'info.200' : 'error.200',
                background: (theme) => isDeposit
                  ? `linear-gradient(135deg, ${theme.palette.info.main}08, ${theme.palette.info.main}15)`
                  : `linear-gradient(135deg, ${theme.palette.error.main}08, ${theme.palette.error.main}15)`,
              }}
            >
              {/* 유형 + 상태 */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Chip
                  label={TYPE_LABELS[detail.transaction_type]?.label ?? detail.transaction_type}
                  color={TYPE_LABELS[detail.transaction_type]?.color ?? 'default'}
                  size="small"
                  variant="filled"
                />
                <Chip
                  label={STATUS_LABELS[detail.status]?.label ?? detail.status}
                  color={STATUS_LABELS[detail.status]?.color ?? 'default'}
                  size="small"
                />
                <Chip
                  label={SOURCE_LABELS[detail.source] || detail.source}
                  size="small"
                  variant="outlined"
                  sx={{ ml: 'auto' }}
                />
              </Box>

              {/* 거래처명 */}
              <MuiLink
                component={NextLink}
                href={`/settlement/counterparties/${detail.counterparty_id}`}
                underline="hover"
                variant="body1"
                fontWeight={700}
                color="text.primary"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
              >
                {detail.counterparty_name}
                <OpenIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              </MuiLink>

              {/* 금액 (대형) */}
              <Typography
                variant="h4"
                fontWeight={800}
                color={isDeposit ? 'info.main' : 'error.main'}
                sx={{ letterSpacing: '-0.5px', my: 0.5 }}
              >
                {isDeposit ? '+' : '-'}{formatAmount(detail.amount)}
              </Typography>

              {/* 일자 */}
              <Typography variant="body2" color="text.secondary">
                {detail.transaction_date}
                {detail.memo && <> &middot; {detail.memo}</>}
              </Typography>
            </Box>

            {/* ━━ 배분 현황 바 (항상 표시) ━━ */}
            <Box sx={{ px: 0.5, pt: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>배분</Typography>
                <LinearProgress
                  variant="determinate"
                  value={allocPct}
                  sx={{ flex: 1, height: 8, borderRadius: 4 }}
                  color={allocPct >= 100 ? 'success' : 'primary'}
                />
                <Typography variant="caption" fontWeight={700}>
                  {Math.round(allocPct)}%
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography variant="caption" color="success.main">
                  배분 {formatAmount(detail.allocated_amount)}
                </Typography>
                <Typography
                  variant="caption"
                  fontWeight={detail.unallocated_amount > 0 ? 700 : 400}
                  color={detail.unallocated_amount > 0 ? 'error.main' : 'text.secondary'}
                >
                  미배분 {formatAmount(detail.unallocated_amount)}
                </Typography>
              </Box>

              {/* 배분 가능 상태면 버튼 */}
              {!['cancelled', 'hidden', 'allocated', 'on_hold'].includes(detail.status) && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<AllocIcon />}
                  onClick={() => onAllocate(detail.id)}
                  fullWidth
                  sx={{ mt: 1.5 }}
                >
                  배분 관리
                </Button>
              )}
            </Box>

            <Divider sx={{ my: 1 }} />

            {/* ━━ 접기/펼치기 섹션들 ━━ */}

            {/* 연결 전표 */}
            <CollapsibleSection
              title="연결 전표"
              defaultOpen={detail.allocations?.length > 0}
              count={detail.allocations?.length}
            >
              {detail.allocations && detail.allocations.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {detail.allocations.map((a) => (
                    <Box
                      key={a.id}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1,
                        p: 1, bgcolor: 'grey.50', borderRadius: 1,
                        borderLeft: '3px solid',
                        borderLeftColor: 'primary.main',
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          #{a.voucher_number || '?'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {a.voucher_trade_date}
                          {a.voucher_total_amount != null && ` / 전표액 ${formatAmount(a.voucher_total_amount)}`}
                        </Typography>
                      </Box>
                      <Typography variant="body2" fontWeight={700}>
                        {formatAmount(a.allocated_amount)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  배분 내역 없음
                </Typography>
              )}
            </CollapsibleSection>

            <Divider />

            {/* 상세 정보 */}
            <CollapsibleSection title="상세 정보" defaultOpen={false}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 0.75 }}>
                {detail.bank_reference && (
                  <>
                    <Typography variant="caption" color="text.secondary">은행참조</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {detail.bank_reference}
                    </Typography>
                  </>
                )}
                <Typography variant="caption" color="text.secondary">등록일시</Typography>
                <Typography variant="caption">
                  {new Date(detail.created_at).toLocaleString('ko-KR')}
                </Typography>
                <Typography variant="caption" color="text.secondary">수정일시</Typography>
                <Typography variant="caption">
                  {new Date(detail.updated_at).toLocaleString('ko-KR')}
                </Typography>
              </Box>
            </CollapsibleSection>

            <Divider />

            {/* 작업 */}
            <CollapsibleSection title="작업" defaultOpen={false}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {detail.status === 'on_hold' ? (
                  <Button size="small" variant="outlined" color="success" startIcon={<UnholdIcon />} onClick={handleUnhold}>
                    보류 해제
                  </Button>
                ) : !['cancelled', 'hidden'].includes(detail.status) && (
                  <Button size="small" variant="outlined" color="warning" startIcon={<HoldIcon />} onClick={() => setHoldOpen(true)}>
                    보류 처리
                  </Button>
                )}

                {detail.status === 'hidden' ? (
                  <Button size="small" variant="outlined" startIcon={<UnhideIcon />} onClick={handleUnhide}>
                    숨김 해제
                  </Button>
                ) : !['cancelled'].includes(detail.status) && (
                  <Button size="small" variant="outlined" startIcon={<HideIcon />} onClick={() => setHideOpen(true)}>
                    숨김 처리
                  </Button>
                )}

                {detail.status === 'pending' && (
                  <Button size="small" variant="outlined" color="error" startIcon={<CancelIcon />} onClick={handleCancel}>
                    취소
                  </Button>
                )}
              </Box>
            </CollapsibleSection>

            <Divider />

            {/* 감사 이력 */}
            <CollapsibleSection title="감사 이력" defaultOpen={false} count={auditLogs.length}>
              {auditLogs.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {auditLogs.map((log) => (
                    <Box key={log.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90, flexShrink: 0 }}>
                        {new Date(log.created_at).toLocaleString('ko-KR', {
                          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </Typography>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption">
                          {log.action.replace('transaction_', '').replace('allocation_', '배분 ')}
                        </Typography>
                        {log.user_name && (
                          <Typography variant="caption" color="text.secondary"> ({log.user_name})</Typography>
                        )}
                        {log.description && (
                          <Typography variant="caption" color="text.secondary" display="block" noWrap>
                            {log.description}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="caption" color="text.secondary">이력 없음</Typography>
              )}
            </CollapsibleSection>

          </Box>
        )}
      </AppDetailDrawer>

      {/* 보류 사유 다이얼로그 */}
      <Dialog open={holdOpen} onClose={() => setHoldOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>보류 처리</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={3}
            label="보류 사유 (필수)"
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHoldOpen(false)} disabled={holdLoading}>취소</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleHold}
            disabled={holdLoading || !holdReason.trim()}
          >
            {holdLoading ? '처리 중...' : '보류 처리'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 숨김 사유 다이얼로그 */}
      <Dialog open={hideOpen} onClose={() => setHideOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>숨김 처리</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            숨김 처리된 항목은 기본 목록에서 표시되지 않습니다.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={2}
            label="숨김 사유 (선택)"
            value={hideReason}
            onChange={(e) => setHideReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHideOpen(false)} disabled={hideLoading}>취소</Button>
          <Button variant="contained" onClick={handleHide} disabled={hideLoading}>
            {hideLoading ? '처리 중...' : '숨김 처리'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
