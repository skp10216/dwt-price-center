'use client';

import { useMemo } from 'react';
import {
  Box, Chip, Tooltip, Typography, IconButton, Menu, MenuItem, ListItemIcon, ListItemText,
} from '@mui/material';
import {
  AccountTree as AllocIcon,
  MoreVert as MoreIcon,
  PauseCircle as HoldIcon,
  VisibilityOff as HideIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { AppDataTable, type AppColumnDef } from '@/components/ui';
import { useCashEvent, type TransactionRow } from './CashEventProvider';
import { useState } from 'react';
import { STATUS_LABELS, TYPE_LABELS, SOURCE_LABELS, formatAmount } from './constants';

interface CashEventGridViewProps {
  onAllocate: (id: string) => void;
  onCancel: (id: string) => void;
  onHold: (id: string) => void;
  onHide: (id: string) => void;
}

export default function CashEventGridView({
  onAllocate,
  onCancel,
  onHold,
  onHide,
}: CashEventGridViewProps) {
  const router = useRouter();
  const {
    transactions, total, loading, page, pageSize,
    selected, setPage, setPageSize, setSelected, setDetailId,
  } = useCashEvent();

  // 행 메뉴
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuTxn, setMenuTxn] = useState<TransactionRow | null>(null);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>, txn: TransactionRow) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuTxn(txn);
  };
  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuTxn(null);
  };

  const columns = useMemo<AppColumnDef<TransactionRow>[]>(() => [
    {
      field: 'transaction_date',
      headerName: '일자',
    },
    {
      field: 'transaction_type',
      headerName: '유형',
      sortable: false,
      renderCell: (row) => {
        const info = TYPE_LABELS[row.transaction_type];
        return <Chip label={info?.label ?? row.transaction_type} color={info?.color ?? 'default'} size="small" variant="outlined" />;
      },
    },
    {
      field: 'counterparty_name',
      headerName: '거래처',
      renderCell: (row) => (
        <Typography
          variant="body2"
          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, fontWeight: 500 }}
          onClick={(e) => { e.stopPropagation(); router.push(`/settlement/counterparties/${row.counterparty_id}`); }}
        >
          {row.counterparty_name}
        </Typography>
      ),
    },
    {
      field: 'amount',
      headerName: '금액',
      align: 'right',
      sum: true,
      renderCell: (row) => formatAmount(row.amount),
      renderSumCell: (v) => formatAmount(v as number),
      cellSxFn: (row: TransactionRow) => ({
        color: row.transaction_type === 'deposit' ? 'info.main' : 'error.main',
        fontWeight: 600,
      }),
    },
    {
      field: 'allocated_amount',
      headerName: '배분액',
      align: 'right',
      sum: true,
      renderCell: (row) => formatAmount(row.allocated_amount),
      renderSumCell: (v) => formatAmount(v as number),
      cellSx: { color: 'success.main' },
    },
    {
      field: 'unallocated_amount',
      headerName: '미배분',
      align: 'right',
      sum: true,
      renderCell: (row) => formatAmount(row.unallocated_amount),
      renderSumCell: (v) => formatAmount(v as number),
      cellSxFn: (row: TransactionRow) => ({
        fontWeight: row.unallocated_amount > 0 ? 700 : 400,
        color: row.unallocated_amount > 0 ? 'error.main' : 'text.secondary',
      }),
    },
    {
      field: 'source',
      headerName: '출처',
      sortable: false,
      renderCell: (row) => (
        <Chip label={SOURCE_LABELS[row.source] || row.source} size="small" variant="outlined" />
      ),
    },
    {
      field: 'status',
      headerName: '상태',
      sortable: false,
      renderCell: (row) => {
        const info = STATUS_LABELS[row.status];
        return <Chip label={info?.label ?? row.status} color={info?.color ?? 'default'} size="small" />;
      },
    },
    {
      field: 'memo',
      headerName: '메모',
      sortable: false,
      renderCell: (row) => (
        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 150 }}>
          {row.memo || '-'}
        </Typography>
      ),
    },
  ], [router]);

  return (
    <>
      <AppDataTable<TransactionRow>
        columns={columns}
        rows={transactions}
        getRowKey={(r) => r.id}
        defaultSortField="transaction_date"
        defaultSortOrder="desc"
        loading={loading}
        emptyMessage="입출금 내역이 없습니다."
        page={page}
        rowsPerPage={pageSize}
        count={total}
        onPageChange={(_, p) => setPage(p)}
        onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
        selectable
        selected={selected}
        onSelectionChange={setSelected}
        isRowSelectable={(txn) => !['cancelled', 'hidden'].includes(txn.status)}
        getRowSx={(row) => ({
          opacity: ['cancelled', 'hidden'].includes(row.status) ? 0.5 : 1,
          borderLeft: row.status === 'on_hold' ? '3px solid' : 'none',
          borderLeftColor: row.status === 'on_hold' ? 'warning.main' : 'transparent',
          cursor: 'pointer',
        })}
        onRowClick={(row) => setDetailId(row.id)}
        renderActions={(txn) => (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
            {!['cancelled', 'hidden', 'allocated'].includes(txn.status) && txn.status !== 'on_hold' && (
              <Tooltip title="배분 관리">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={(e) => { e.stopPropagation(); onAllocate(txn.id); }}
                >
                  <AllocIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {txn.status === 'allocated' && (
              <Tooltip title="배분 상세">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onAllocate(txn.id); }}
                >
                  <AllocIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton size="small" onClick={(e) => handleMenuOpen(e, txn)}>
              <MoreIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      />

      {/* 행 메뉴 */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={handleMenuClose}>
        {menuTxn && !['cancelled', 'hidden', 'on_hold'].includes(menuTxn.status) && (
          <MenuItem onClick={() => { onHold(menuTxn!.id); handleMenuClose(); }}>
            <ListItemIcon><HoldIcon fontSize="small" color="warning" /></ListItemIcon>
            <ListItemText>보류 처리</ListItemText>
          </MenuItem>
        )}
        {menuTxn && !['cancelled', 'hidden'].includes(menuTxn?.status ?? '') && (
          <MenuItem onClick={() => { onHide(menuTxn!.id); handleMenuClose(); }}>
            <ListItemIcon><HideIcon fontSize="small" /></ListItemIcon>
            <ListItemText>숨김 처리</ListItemText>
          </MenuItem>
        )}
        {menuTxn && menuTxn.status === 'pending' && (
          <MenuItem onClick={() => { onCancel(menuTxn!.id); handleMenuClose(); }}>
            <ListItemIcon><CancelIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>취소</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
