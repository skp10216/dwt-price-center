/**
 * AppTableShell - 통일된 테이블 래퍼
 *
 * 설계 원칙:
 * - sticky header (기본 활성화)
 * - 하단 pagination 내장
 * - 빈 상태 / 로딩 / 에러 패턴 내장
 * - 테이블 밀도는 MUI theme overrides에서 자동 적용
 *
 * 사용 예시:
 * <AppTableShell
 *   loading={loading}
 *   error={error}
 *   isEmpty={rows.length === 0}
 *   emptyMessage="데이터가 없습니다"
 *   count={totalCount}
 *   page={page}
 *   rowsPerPage={rowsPerPage}
 *   onPageChange={handlePageChange}
 *   onRowsPerPageChange={handleRowsPerPageChange}
 *   stickyHeader
 *   maxHeight={600}
 * >
 *   <Table>
 *     <TableHead>...</TableHead>
 *     <TableBody>...</TableBody>
 *   </Table>
 * </AppTableShell>
 */

'use client';

import {
  Box,
  Paper,
  TableContainer,
  TablePagination,
  LinearProgress,
  Alert,
  Typography,
  Stack,
  type SxProps,
  type Theme,
} from '@mui/material';
import {
  Inbox as InboxIcon,
} from '@mui/icons-material';

export interface AppTableShellProps {
  children: React.ReactNode;
  /** 로딩 상태 */
  loading?: boolean;
  /** 에러 메시지 */
  error?: string | null;
  /** 데이터 비어있음 */
  isEmpty?: boolean;
  /** 빈 상태 메시지 */
  emptyMessage?: string;
  /** 빈 상태 아이콘 */
  emptyIcon?: React.ReactNode;
  /** 전체 데이터 건수 (pagination) */
  count?: number;
  /** 현재 페이지 (0-based) */
  page?: number;
  /** 페이지당 행 수 */
  rowsPerPage?: number;
  /** 페이지 변경 핸들러 */
  onPageChange?: (event: unknown, newPage: number) => void;
  /** 페이지당 행 수 변경 핸들러 */
  onRowsPerPageChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** 페이지당 행 수 옵션 */
  rowsPerPageOptions?: number[];
  /** sticky header 활성화 (기본: true) */
  stickyHeader?: boolean;
  /** 테이블 최대 높이 (스크롤 활성화) */
  maxHeight?: number | string;
  /** pagination 숨기기 */
  hidePagination?: boolean;
  /** 추가 sx (외곽 Paper) */
  sx?: SxProps<Theme>;
  /** 테이블 컨테이너 sx */
  tableContainerSx?: SxProps<Theme>;
}

export default function AppTableShell({
  children,
  loading = false,
  error,
  isEmpty = false,
  emptyMessage = '데이터가 없습니다',
  emptyIcon,
  count = 0,
  page = 0,
  rowsPerPage = 20,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions = [10, 20, 50, 100],
  stickyHeader = true,
  maxHeight,
  hidePagination = false,
  sx,
  tableContainerSx,
}: AppTableShellProps) {
  const showPagination = !hidePagination && onPageChange && onRowsPerPageChange;

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...sx,
      }}
    >
      {/* 로딩 바 */}
      {loading && (
        <LinearProgress
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            height: 2,
          }}
        />
      )}

      {/* 에러 상태 */}
      {error && (
        <Alert severity="error" sx={{ m: 1.5, borderRadius: 1.5 }}>
          {error}
        </Alert>
      )}

      {/* 빈 상태 */}
      {!loading && !error && isEmpty && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 6,
            px: 2,
            color: 'text.secondary',
          }}
        >
          {emptyIcon ?? (
            <InboxIcon sx={{ fontSize: 40, mb: 1, opacity: 0.4 }} />
          )}
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {emptyMessage}
          </Typography>
        </Box>
      )}

      {/* 테이블 영역 */}
      {!isEmpty && !error && (
        <TableContainer
          sx={{
            position: 'relative',
            maxHeight: maxHeight,
            overflow: 'auto',
            // sticky header 스타일
            ...(stickyHeader && {
              '& thead th': {
                position: 'sticky',
                top: 0,
                zIndex: 2,
              },
            }),
            '& tfoot td': {
              position: 'sticky',
              bottom: 0,
              zIndex: 2,
            },
            ...tableContainerSx,
          }}
        >
          {children}
        </TableContainer>
      )}

      {/* Pagination */}
      {showPagination && !isEmpty && (
        <TablePagination
          component="div"
          count={count}
          page={page}
          onPageChange={onPageChange}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={onRowsPerPageChange}
          rowsPerPageOptions={rowsPerPageOptions}
          labelRowsPerPage="표시 수:"
          labelDisplayedRows={({ from, to, count: c }) =>
            `${from}~${to} / ${c !== -1 ? `총 ${c.toLocaleString()}건` : `${to}건 이상`}`
          }
        />
      )}
    </Paper>
  );
}
