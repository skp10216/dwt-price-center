/**
 * 용량×등급 가격 테이블
 * 
 * 성능 최적화:
 * - memo로 불필요한 re-render 방지
 * - 개별 셀 업데이트 시 전체 테이블 re-render 방지
 */

'use client';

import { memo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Typography,
  Box,
  Chip,
} from '@mui/material';
import {
  History as HistoryIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { EditableCell } from './EditableCell';
import { SSOTModel, Grade, PriceChange, createChangeKey } from './types';

interface PriceTableProps {
  variants: SSOTModel[]; // 스토리지별 변형 모델들
  grades: Grade[];
  changes: Map<string, PriceChange>;
  onPriceChange: (modelId: string, gradeId: string, gradeName: string, originalPrice: number, newPrice: number) => void;
  onViewHistory?: (modelId: string) => void;
  onDeleteVariant?: (modelId: string) => void;
  disabled?: boolean;
}

function PriceTableComponent({
  variants,
  grades,
  changes,
  onPriceChange,
  onViewHistory,
  onDeleteVariant,
  disabled = false,
}: PriceTableProps) {
  // 가격 변경 핸들러 (개별 셀용)
  const handleCellChange = useCallback(
    (modelId: string, gradeId: string, gradeName: string, originalPrice: number) => 
    (newValue: number) => {
      onPriceChange(modelId, gradeId, gradeName, originalPrice, newValue);
    },
    [onPriceChange]
  );
  
  // 스토리지 표시 순서 정렬 (큰 용량 순)
  const sortedVariants = [...variants].sort((a, b) => b.storage_gb - a.storage_gb);
  
  // 등급 정렬
  const sortedGrades = [...grades].sort((a, b) => a.sort_order - b.sort_order);
  
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: 'grey.100' }}>
            <TableCell sx={{ fontWeight: 600, width: 100 }}>용량</TableCell>
            {sortedGrades.map((grade) => (
              <TableCell 
                key={grade.id} 
                align="center"
                sx={{ 
                  fontWeight: 600,
                  minWidth: 120,
                  color: getGradeColor(grade.name),
                }}
              >
                {grade.name}등급
              </TableCell>
            ))}
            <TableCell align="center" sx={{ width: 80 }}>액션</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedVariants.map((variant) => {
            const configuredCount = variant.grade_prices.filter(gp => gp.price > 0).length;
            const isFullyConfigured = configuredCount === sortedGrades.length;
            
            return (
              <TableRow 
                key={variant.id}
                sx={{ 
                  '&:hover': { bgcolor: 'grey.50' },
                  '&:last-child td': { border: 0 },
                }}
              >
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {variant.storage_display}
                    </Typography>
                    {!isFullyConfigured && (
                      <Chip
                        label={`${configuredCount}/${sortedGrades.length}`}
                        size="small"
                        color={configuredCount === 0 ? 'error' : 'warning'}
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                  </Box>
                </TableCell>
                
                {sortedGrades.map((grade) => {
                  const gradePrice = variant.grade_prices.find(gp => gp.grade_id === grade.id);
                  const originalPrice = gradePrice?.price || 0;
                  const changeKey = createChangeKey(variant.id, grade.id);
                  const change = changes.get(changeKey);
                  const currentValue = change ? change.newPrice : originalPrice;
                  const isChanged = !!change;
                  
                  return (
                    <TableCell key={grade.id} align="center" sx={{ p: 1 }}>
                      <EditableCell
                        value={currentValue}
                        originalValue={originalPrice}
                        isChanged={isChanged}
                        onValueChange={handleCellChange(
                          variant.id, 
                          grade.id, 
                          grade.name,
                          originalPrice
                        )}
                        disabled={disabled}
                      />
                    </TableCell>
                  );
                })}
                
                <TableCell align="center">
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                    {onViewHistory && (
                      <Tooltip title="변경 이력">
                        <IconButton 
                          size="small" 
                          onClick={() => onViewHistory(variant.id)}
                        >
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {onDeleteVariant && (
                      <Tooltip title="삭제">
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => onDeleteVariant(variant.id)}
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
    </TableContainer>
  );
}

// 등급별 색상
function getGradeColor(gradeName: string): string {
  const colorMap: Record<string, string> = {
    'A': '#2e7d32', // green
    'B': '#1976d2', // blue
    'C': '#ed6c02', // orange
    'D': '#d32f2f', // red
  };
  return colorMap[gradeName] || 'inherit';
}

export const PriceTable = memo(PriceTableComponent);
