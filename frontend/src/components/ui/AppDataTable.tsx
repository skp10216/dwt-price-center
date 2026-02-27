/**
 * AppDataTable - 선언적 데이터 테이블
 *
 * 설계 원칙:
 * - columns 배열로 정렬 / 합계 / 렌더링을 선언적으로 정의
 * - AppTableShell 위에 얹어 sticky header/footer, pagination, 빈 상태 등 재사용
 * - 클라이언트 정렬 기본, onSortChange 제공 시 서버 위임
 * - sum: true 컬럼은 자동 합산 → sticky footer
 * - selectable + selected/onSelectionChange 로 체크박스 선택
 * - renderActions 로 행별 액션 버튼
 * - loading 시 Skeleton 행 자동 표시
 *
 * 사용 예시:
 * <AppDataTable
 *   columns={[
 *     { field: 'name', headerName: '이름' },
 *     { field: 'amount', headerName: '금액', align: 'right', sum: true },
 *   ]}
 *   rows={data}
 *   getRowKey={(r) => r.id}
 *   defaultSortField="amount"
 *   defaultSortOrder="desc"
 *   loading={loading}
 *   count={total}
 *   page={page}
 *   rowsPerPage={pageSize}
 *   onPageChange={handlePageChange}
 *   onRowsPerPageChange={handleRowsPerPageChange}
 * />
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableFooter,
  TableSortLabel,
  Checkbox,
  Skeleton,
  Box,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material';
import AppTableShell, { type AppTableShellProps } from './AppTableShell';

// ─── 타입 ────────────────────────────────────────────────────────────────────

export interface AppColumnDef<T> {
  /** 데이터 필드 키 */
  field: keyof T & string;
  /** 헤더 표시 텍스트 */
  headerName: string;
  /** 정렬 활성화 (기본: true) */
  sortable?: boolean;
  /** 합계 표시. true면 자동 reduce, 함수면 커스텀 합계 */
  sum?: boolean | ((rows: T[]) => number | string);
  /** 셀 커스텀 렌더 */
  renderCell?: (row: T, index: number) => React.ReactNode;
  /** 합계 셀 커스텀 렌더 */
  renderSumCell?: (value: number | string) => React.ReactNode;
  /** 정렬 (기본: left) */
  align?: 'left' | 'center' | 'right';
  /** 컬럼 너비 */
  width?: number | string;
  /** 최소 너비 */
  minWidth?: number;
  /** 셀 sx (정적). 동적 sx는 cellSxFn 사용 */
  cellSx?: SxProps<Theme>;
  /** 행 기반 동적 셀 sx */
  cellSxFn?: (row: T) => SxProps<Theme>;
  /** 헤더 셀 sx */
  headerSx?: SxProps<Theme>;
  /** 합계 행에서 이 컬럼이 "합계" 라벨을 표시 (첫 번째 컬럼에 자동 설정) */
  sumLabel?: boolean;
  /** 합계 행에서 이 컬럼의 colSpan */
  sumColSpan?: number;
}

export interface AppDataTableProps<T> {
  /** 컬럼 정의 */
  columns: AppColumnDef<T>[];
  /** 데이터 행 배열 */
  rows: T[];
  /** 행 고유키 추출 (기본: (row as any).id) */
  getRowKey?: (row: T) => string;

  // ─── 정렬 ───
  /** 초기 정렬 필드 */
  defaultSortField?: string;
  /** 초기 정렬 방향 (기본: desc) */
  defaultSortOrder?: 'asc' | 'desc';
  /** 서버 정렬 콜백. 제공 시 클라이언트 정렬 비활성화 */
  onSortChange?: (field: string, order: 'asc' | 'desc') => void;

  // ─── 체크박스 선택 ───
  /** 체크박스 선택 활성화 */
  selectable?: boolean;
  /** 선택된 행 키 Set */
  selected?: Set<string>;
  /** 선택 변경 콜백 */
  onSelectionChange?: (selected: Set<string>) => void;
  /** 행별 선택 가능 여부 */
  isRowSelectable?: (row: T) => boolean;

  // ─── 행 이벤트 ───
  /** 행 클릭 */
  onRowClick?: (row: T) => void;
  /** 행별 sx */
  getRowSx?: (row: T) => SxProps<Theme>;

  // ─── 액션 컬럼 ───
  /** 행별 액션 렌더 */
  renderActions?: (row: T) => React.ReactNode;
  /** 액션 컬럼 너비 */
  actionsWidth?: number;
  /** 액션 컬럼 헤더 */
  actionsHeader?: string;

  // ─── 추가 컬럼 (앞) ───
  /** 체크박스 앞에 추가 컬럼 렌더 (예: #, 즐겨찾기) */
  renderLeadingColumns?: (row: T, index: number) => React.ReactNode;
  /** 추가 컬럼 헤더 */
  leadingColumnHeaders?: React.ReactNode;
  /** 합계 행에서 leading 컬럼의 colSpan (기본: leading 컬럼 수) */
  leadingSumColSpan?: number;

  // ─── Skeleton ───
  /** 로딩 시 skeleton 행 수 (기본: 10) */
  skeletonRows?: number;

  // ─── 합계 footer 스타일 ───
  /** 합계 footer 행 sx */
  footerRowSx?: SxProps<Theme>;

  // ─── 테이블 속성 ───
  /** MUI Table size (기본: small) */
  tableSize?: 'small' | 'medium';
  /** 헤더 행 sx */
  headerRowSx?: SxProps<Theme>;

  // ─── AppTableShell 패스스루 ───
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  count?: number;
  page?: number;
  rowsPerPage?: number;
  onPageChange?: (event: unknown, newPage: number) => void;
  onRowsPerPageChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  rowsPerPageOptions?: number[];
  stickyHeader?: boolean;
  maxHeight?: number | string;
  hidePagination?: boolean;
  sx?: SxProps<Theme>;
  tableContainerSx?: SxProps<Theme>;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────

export default function AppDataTable<T>({
  columns,
  rows,
  getRowKey,
  defaultSortField,
  defaultSortOrder = 'desc',
  onSortChange,
  selectable = false,
  selected,
  onSelectionChange,
  isRowSelectable,
  onRowClick,
  getRowSx,
  renderActions,
  actionsWidth = 80,
  actionsHeader = '액션',
  renderLeadingColumns,
  leadingColumnHeaders,
  leadingSumColSpan,
  skeletonRows = 10,
  footerRowSx,
  tableSize = 'small',
  headerRowSx,
  loading = false,
  error,
  emptyMessage,
  emptyIcon,
  count,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions,
  stickyHeader = true,
  maxHeight,
  hidePagination,
  sx,
  tableContainerSx,
}: AppDataTableProps<T>) {
  const theme = useTheme();

  // ─── 정렬 상태 ───
  const [sortField, setSortField] = useState<string>(defaultSortField || '');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(defaultSortOrder);

  const handleSort = useCallback((field: string) => {
    const newOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    if (sortField !== field) {
      setSortField(field);
      setSortOrder('desc');
      onSortChange?.(field, 'desc');
    } else {
      setSortOrder(newOrder);
      onSortChange?.(field, newOrder);
    }
  }, [sortField, sortOrder, onSortChange]);

  // ─── 클라이언트 정렬 ───
  const sortedRows = useMemo(() => {
    if (onSortChange || !sortField) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const av = a[sortField as keyof T];
      const bv = b[sortField as keyof T];
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else if (av == null && bv == null) {
        cmp = 0;
      } else if (av == null) {
        cmp = -1;
      } else if (bv == null) {
        cmp = 1;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortField, sortOrder, onSortChange]);

  // ─── 합계 ───
  const hasSumRow = columns.some((c) => c.sum);
  const sumValues = useMemo(() => {
    if (!hasSumRow) return null;
    const sums: Record<string, number | string> = {};
    for (const col of columns) {
      if (!col.sum) continue;
      if (typeof col.sum === 'function') {
        sums[col.field] = col.sum(sortedRows);
      } else {
        sums[col.field] = sortedRows.reduce((acc, row) => {
          const v = row[col.field as keyof T];
          const n = typeof v === 'number' ? v : Number(v);
          return acc + (isNaN(n) ? 0 : n);
        }, 0);
      }
    }
    return sums;
  }, [hasSumRow, columns, sortedRows]);

  // ─── 체크박스 ───
  const rowKey = useCallback((row: T) => {
    if (getRowKey) return getRowKey(row);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return String((row as any).id);
  }, [getRowKey]);

  const selectableRows = useMemo(() => {
    if (!selectable) return [];
    return isRowSelectable ? sortedRows.filter(isRowSelectable) : sortedRows;
  }, [selectable, sortedRows, isRowSelectable]);

  const isAllSelected = selectable && selectableRows.length > 0 &&
    selectableRows.every((r) => selected?.has(rowKey(r)));
  const isSomeSelected = selectable && selectableRows.some((r) => selected?.has(rowKey(r))) && !isAllSelected;

  const handleSelectAll = useCallback((checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange(new Set(selectableRows.map(rowKey)));
    } else {
      onSelectionChange(new Set());
    }
  }, [onSelectionChange, selectableRows, rowKey]);

  const handleSelectOne = useCallback((key: string, checked: boolean) => {
    if (!onSelectionChange || !selected) return;
    const next = new Set(selected);
    if (checked) next.add(key); else next.delete(key);
    onSelectionChange(next);
  }, [onSelectionChange, selected]);

  // ─── Shell props ───
  const shellProps: AppTableShellProps = {
    children: null as unknown as React.ReactNode,
    loading,
    error,
    isEmpty: !loading && sortedRows.length === 0,
    emptyMessage,
    emptyIcon,
    count,
    page,
    rowsPerPage,
    onPageChange,
    onRowsPerPageChange,
    rowsPerPageOptions,
    stickyHeader,
    maxHeight,
    hidePagination,
    sx,
    tableContainerSx,
  };

  // ─── 합계 footer 기본 스타일 ───
  const defaultFooterSx: SxProps<Theme> = {
    '& td': {
      borderBottom: 'none',
      fontWeight: 700,
      fontSize: '0.8125rem',
      bgcolor: theme.palette.mode === 'light' ? 'grey.50' : 'grey.900',
      borderTop: '2px solid',
      borderColor: 'divider',
    },
  };

  // ─── 컬럼 총 수 (선택+leading+columns+actions) ───
  const hasLeading = !!renderLeadingColumns;
  const hasActions = !!renderActions;

  return (
    <AppTableShell {...shellProps}>
      <Table size={tableSize} stickyHeader={stickyHeader}>
        {/* ─── Header ─── */}
        <TableHead>
          <TableRow sx={headerRowSx}>
            {/* 체크박스 */}
            {selectable && (
              <TableCell padding="checkbox" sx={{ width: 42 }}>
                <Checkbox
                  size="small"
                  indeterminate={isSomeSelected}
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </TableCell>
            )}

            {/* Leading 컬럼 */}
            {hasLeading && leadingColumnHeaders}

            {/* 데이터 컬럼 */}
            {columns.map((col) => {
              const isSortable = col.sortable !== false;
              return (
                <TableCell
                  key={col.field}
                  align={col.align || 'left'}
                  sx={{
                    fontWeight: 700,
                    width: col.width,
                    minWidth: col.minWidth,
                    ...col.headerSx,
                  }}
                  sortDirection={sortField === col.field ? sortOrder : false}
                >
                  {isSortable ? (
                    <TableSortLabel
                      active={sortField === col.field}
                      direction={sortField === col.field ? sortOrder : 'desc'}
                      onClick={() => handleSort(col.field)}
                    >
                      {col.headerName}
                    </TableSortLabel>
                  ) : (
                    col.headerName
                  )}
                </TableCell>
              );
            })}

            {/* 액션 컬럼 */}
            {hasActions && (
              <TableCell align="center" sx={{ fontWeight: 700, width: actionsWidth }}>
                {actionsHeader}
              </TableCell>
            )}
          </TableRow>
        </TableHead>

        {/* ─── Body ─── */}
        <TableBody>
          {loading ? (
            // Skeleton 로딩
            Array.from({ length: skeletonRows }).map((_, i) => (
              <TableRow key={`skel-${i}`}>
                {selectable && <TableCell padding="checkbox"><Skeleton width={20} /></TableCell>}
                {hasLeading && (
                  <TableCell colSpan={leadingSumColSpan || 1}><Skeleton width={40} /></TableCell>
                )}
                {columns.map((col) => (
                  <TableCell key={col.field} align={col.align}>
                    <Skeleton width={col.width || (col.align === 'right' ? 60 : 80)} />
                  </TableCell>
                ))}
                {hasActions && <TableCell><Skeleton width={40} /></TableCell>}
              </TableRow>
            ))
          ) : (
            sortedRows.map((row, index) => {
              const key = rowKey(row);
              const isChecked = selected?.has(key) ?? false;
              const canSelect = !isRowSelectable || isRowSelectable(row);
              const rowSx = getRowSx?.(row);

              return (
                <TableRow
                  key={key}
                  hover
                  selected={selectable && isChecked}
                  sx={{
                    ...(onRowClick && { cursor: 'pointer' }),
                    ...rowSx,
                  }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {/* 체크박스 */}
                  {selectable && (
                    <TableCell
                      padding="checkbox"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        size="small"
                        checked={isChecked}
                        disabled={!canSelect}
                        onChange={(e) => handleSelectOne(key, e.target.checked)}
                      />
                    </TableCell>
                  )}

                  {/* Leading 컬럼 */}
                  {hasLeading && renderLeadingColumns!(row, index)}

                  {/* 데이터 컬럼 */}
                  {columns.map((col) => {
                    const cellSx = col.cellSxFn ? col.cellSxFn(row) : col.cellSx;
                    return (
                      <TableCell
                        key={col.field}
                        align={col.align || 'left'}
                        sx={cellSx}
                      >
                        {col.renderCell
                          ? col.renderCell(row, index)
                          : String(row[col.field as keyof T] ?? '')}
                      </TableCell>
                    );
                  })}

                  {/* 액션 */}
                  {hasActions && (
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      {renderActions!(row)}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>

        {/* ─── Footer (합계) ─── */}
        {hasSumRow && !loading && sortedRows.length > 0 && sumValues && (
          <TableFooter>
            <TableRow sx={{ ...defaultFooterSx, ...footerRowSx }}>
              {/* 합계 라벨: 체크박스 + leading + 첫 번째 non-sum 컬럼들을 합쳐서 "합계" 표시 */}
              {(() => {
                // 합계 라벨 colspan 계산
                let labelSpan = 0;
                if (selectable) labelSpan += 1;
                if (hasLeading) labelSpan += (leadingSumColSpan ?? 1);

                // 첫 sum 컬럼 전까지의 컬럼 수
                const firstSumIdx = columns.findIndex((c) => c.sum);
                // sumLabel이 있는 컬럼을 우선 찾기
                const sumLabelCol = columns.find((c) => c.sumLabel);
                if (sumLabelCol) {
                  const labelIdx = columns.indexOf(sumLabelCol);
                  // sumLabel 컬럼까지의 span
                  const beforeLabelSpan = labelIdx + (sumLabelCol.sumColSpan ?? 1);
                  return (
                    <TableCell colSpan={labelSpan + beforeLabelSpan} sx={{ fontWeight: 700 }}>
                      합계
                    </TableCell>
                  );
                }

                labelSpan += firstSumIdx > 0 ? firstSumIdx : 1;

                const cells: React.ReactNode[] = [
                  <TableCell key="__sum_label" colSpan={labelSpan} sx={{ fontWeight: 700 }}>
                    합계
                  </TableCell>,
                ];

                // 나머지 컬럼
                for (let i = firstSumIdx; i < columns.length; i++) {
                  const col = columns[i];
                  if (col.sum && sumValues[col.field] !== undefined) {
                    const val = sumValues[col.field];
                    cells.push(
                      <TableCell key={col.field} align={col.align || 'left'} sx={{ fontWeight: 700, ...( typeof col.cellSx === 'object' ? col.cellSx : {}) }}>
                        {col.renderSumCell ? col.renderSumCell(val) : (
                          typeof val === 'number' ? new Intl.NumberFormat('ko-KR').format(val) : String(val)
                        )}
                      </TableCell>
                    );
                  } else {
                    cells.push(<TableCell key={col.field} />);
                  }
                }

                // 액션 빈 셀
                if (hasActions) cells.push(<TableCell key="__actions" />);

                return cells;
              })()}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </AppTableShell>
  );
}
