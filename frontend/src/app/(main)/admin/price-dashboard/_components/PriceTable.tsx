/**
 * 판매가 대시보드 - 가격 테이블 컴포넌트
 * - 고정 헤더 (sticky header)
 * - 고정 열 (모델명, 용량)
 * - 컴팩트 뷰 지원
 * - 검색 결과 하이라이트
 */

'use client';

import { memo, useMemo } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
  keyframes,
  useTheme,
} from '@mui/material';
import { ManufacturerTableData, PriceTableRow } from './types';
import { NoteTooltip } from './NoteTooltip';

interface PriceTableProps {
  data: ManufacturerTableData;
  compact?: boolean;
  highlightedId?: string | null;
  visibleGradeIds?: string[];  // 표시할 등급 ID 목록 (undefined면 전체 표시)
  showNoteColumn?: boolean;    // 비고 컬럼 표시 여부 (기본: true)
}

// 하이라이트 애니메이션
const highlightPulse = keyframes`
  0%, 100% { background-color: rgba(25, 118, 210, 0.15); }
  50% { background-color: rgba(25, 118, 210, 0.3); }
`;

// 가격 포맷팅 (컴팩트: K 단위, 일반: 콤마)
function formatPrice(value: number, compact: boolean): string {
  if (value === 0 || value === null || value === undefined) return '-';
  if (compact && value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }
  return value.toLocaleString('ko-KR');
}

// 모델 행 그룹화 (같은 모델명끼리)
function groupRows(rows: PriceTableRow[]): Map<string, PriceTableRow[]> {
  const groups = new Map<string, PriceTableRow[]>();
  rows.forEach(row => {
    const key = `${row.series}_${row.modelName}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(row);
  });
  return groups;
}

export const PriceTable = memo(function PriceTable({
  data,
  compact = false,
  highlightedId = null,
  visibleGradeIds,
  showNoteColumn = true,
}: PriceTableProps) {
  const theme = useTheme();
  const { grades, rows, extraColumns, manufacturer } = data;

  // 표시할 등급 필터링
  const displayGrades = useMemo(() => {
    if (!visibleGradeIds) return grades;
    return grades.filter(g => visibleGradeIds.includes(g.id));
  }, [grades, visibleGradeIds]);

  // 행 그룹화
  const groupedRows = useMemo(() => groupRows(rows), [rows]);

  // 셀 스타일
  const cellPadding = compact ? '4px 6px' : '8px 12px';
  const fontSize = compact ? '0.75rem' : '0.8125rem';

  // 테마에 따라 sticky 배경색 설정
  const getStickyBgColor = () => {
    if (theme.palette.mode === 'dark') {
      return manufacturer === 'apple' ? 'grey.900' : alpha(theme.palette.primary.main, 0.15);
    }
    return manufacturer === 'apple' ? 'grey.50' : 'primary.50';
  };
  const stickyBgColor = getStickyBgColor();

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          표시할 모델이 없습니다.
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer sx={{ maxHeight: '100%' }}>
      <Table stickyHeader size="small" sx={{ minWidth: 600 }}>
        <TableHead>
          <TableRow>
            {/* 고정 열: 모델명 */}
            <TableCell
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 3,
                bgcolor: stickyBgColor,
                borderRight: 1,
                borderColor: 'divider',
                fontWeight: 600,
                p: cellPadding,
                fontSize,
                minWidth: 120,
              }}
            >
              모델명
            </TableCell>
            {/* 고정 열: 용량 */}
            <TableCell
              sx={{
                position: 'sticky',
                left: 120,
                zIndex: 3,
                bgcolor: stickyBgColor,
                borderRight: 2,
                borderColor: 'divider',
                fontWeight: 600,
                p: cellPadding,
                fontSize,
                minWidth: 60,
                textAlign: 'center',
              }}
            >
              용량
            </TableCell>
            {/* 등급별 가격 열 */}
            {displayGrades.map(grade => (
              <TableCell
                key={grade.id}
                sx={{
                  bgcolor: stickyBgColor,
                  fontWeight: 600,
                  p: cellPadding,
                  fontSize,
                  textAlign: 'right',
                  minWidth: compact ? 50 : 70,
                }}
              >
                {grade.name}
              </TableCell>
            ))}
            {/* 비고 열 */}
            {showNoteColumn && (
              <TableCell
                sx={{
                  bgcolor: stickyBgColor,
                  fontWeight: 600,
                  p: cellPadding,
                  fontSize,
                  textAlign: 'center',
                  minWidth: 40,
                }}
              >
                비고
              </TableCell>
            )}
            {/* 삼성 추가 열 (수출, LCD) */}
            {extraColumns?.map(col => (
              <TableCell
                key={col}
                sx={{
                  bgcolor: stickyBgColor,
                  fontWeight: 600,
                  p: cellPadding,
                  fontSize,
                  textAlign: 'right',
                  minWidth: compact ? 50 : 70,
                }}
              >
                {col}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from(groupedRows.entries()).map(([groupKey, groupRows]) => (
            groupRows.map((row, rowIdx) => {
              const isFirstInGroup = rowIdx === 0;
              const isLastInGroup = rowIdx === groupRows.length - 1;
              const rowSpan = groupRows.length;
              const isHighlighted = highlightedId === row.id;

              return (
                <TableRow
                  key={row.id}
                  data-row-id={row.id}
                  sx={{
                    '&:hover': {
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                    },
                    ...(isLastInGroup && {
                      '& td': {
                        borderBottom: 2,
                        borderColor: 'divider',
                      },
                    }),
                    ...(isHighlighted && {
                      animation: `${highlightPulse} 0.8s ease-in-out infinite`,
                    }),
                  }}
                >
                  {/* 고정 열: 모델명 (그룹의 첫 번째 행에서만 표시) */}
                  {isFirstInGroup && (
                    <TableCell
                      rowSpan={rowSpan}
                      sx={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        bgcolor: isHighlighted ? 'primary.50' : 'background.paper',
                        borderRight: 1,
                        borderColor: 'divider',
                        p: cellPadding,
                        fontSize,
                        fontWeight: 500,
                        verticalAlign: 'middle',
                      }}
                    >
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            fontSize,
                            lineHeight: 1.3,
                          }}
                        >
                          {row.modelName}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: compact ? '0.65rem' : '0.7rem' }}
                        >
                          {row.series}
                        </Typography>
                      </Box>
                    </TableCell>
                  )}
                  {/* 고정 열: 용량 */}
                  <TableCell
                    sx={{
                      position: 'sticky',
                      left: 120,
                      zIndex: 1,
                      bgcolor: isHighlighted ? 'primary.50' : 'background.paper',
                      borderRight: 2,
                      borderColor: 'divider',
                      p: cellPadding,
                      fontSize,
                      textAlign: 'center',
                    }}
                  >
                    {row.storage}
                  </TableCell>
                  {/* 등급별 가격 */}
                  {displayGrades.map(grade => {
                    const price = row.prices[grade.id] || 0;
                    const hasPrice = price > 0;

                    return (
                      <TableCell
                        key={grade.id}
                        sx={{
                          p: cellPadding,
                          fontSize,
                          textAlign: 'right',
                          fontFeatureSettings: '"tnum"',
                          color: hasPrice ? 'text.primary' : 'text.disabled',
                          fontWeight: hasPrice ? 500 : 400,
                        }}
                      >
                        {formatPrice(price, compact)}
                      </TableCell>
                    );
                  })}
                  {/* 비고 */}
                  {showNoteColumn && (
                    <TableCell
                      sx={{
                        p: cellPadding,
                        fontSize,
                        textAlign: 'center',
                      }}
                    >
                      {row.note && <NoteTooltip content={row.note} />}
                    </TableCell>
                  )}
                  {/* 삼성 추가 열 */}
                  {extraColumns?.map(col => (
                    <TableCell
                      key={col}
                      sx={{
                        p: cellPadding,
                        fontSize,
                        textAlign: 'right',
                        fontFeatureSettings: '"tnum"',
                        color: 'text.disabled',
                      }}
                    >
                      -
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
});
