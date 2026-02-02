/**
 * 모델별 가격 카드 (아코디언)
 * 
 * 성능 최적화:
 * - Lazy Mount: 아코디언이 열릴 때만 PriceTable 렌더링
 * - memo로 불필요한 re-render 방지
 * - 한번 열린 후에는 마운트 유지 (unmountOnExit: false)
 */

'use client';

import { memo, useState, useCallback } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Typography,
  Chip,
  Stack,
  Checkbox,
  Avatar,
  Skeleton,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Smartphone as SmartphoneIcon,
  Settings as SettingsIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { PriceTable } from './PriceTable';
import { GroupedModel, Grade, PriceChange } from './types';

interface ModelPriceCardProps {
  groupedModel: GroupedModel;
  grades: Grade[];
  changes: Map<string, PriceChange>;
  onPriceChange: (modelId: string, gradeId: string, gradeName: string, originalPrice: number, newPrice: number) => void;
  onViewHistory?: (modelId: string) => void;
  onDeleteVariant?: (modelId: string) => void;
  selected?: boolean;
  onSelectChange?: (modelKey: string, selected: boolean) => void;
  disabled?: boolean;
}

function ModelPriceCardComponent({
  groupedModel,
  grades,
  changes,
  onPriceChange,
  onViewHistory,
  onDeleteVariant,
  selected = false,
  onSelectChange,
  disabled = false,
}: ModelPriceCardProps) {
  // 아코디언 열림 상태
  const [expanded, setExpanded] = useState(false);
  // 최초 마운트 여부 (lazy mount를 위해)
  const [hasBeenExpanded, setHasBeenExpanded] = useState(false);
  
  // 확장 토글 핸들러
  const handleExpand = useCallback((_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded);
    if (isExpanded && !hasBeenExpanded) {
      setHasBeenExpanded(true);
    }
  }, [hasBeenExpanded]);
  
  // 체크박스 클릭 핸들러 (이벤트 버블링 방지)
  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);
  
  // 체크박스 변경 핸들러
  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSelectChange?.(groupedModel.model_key, e.target.checked);
  }, [groupedModel.model_key, onSelectChange]);
  
  // 통계 계산
  const stats = calculateStats(groupedModel, grades, changes);
  
  // 변경된 항목 수 계산
  const changedCount = countChanges(groupedModel, changes);
  
  return (
    <Accordion
      expanded={expanded}
      onChange={handleExpand}
      disableGutters
      sx={{
        border: '1px solid',
        borderColor: changedCount > 0 ? 'warning.main' : 'divider',
        borderRadius: '12px !important',
        mb: 2,
        '&:before': { display: 'none' },
        boxShadow: expanded 
          ? '0 4px 20px rgba(0,0,0,0.08)' 
          : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          px: 2,
          py: 1,
          '& .MuiAccordionSummary-content': {
            alignItems: 'center',
            gap: 2,
            my: 1,
          },
        }}
      >
        {/* 체크박스 */}
        {onSelectChange && (
          <Checkbox
            checked={selected}
            onChange={handleCheckboxChange}
            onClick={handleCheckboxClick}
            sx={{ p: 0.5 }}
          />
        )}
        
        {/* 아이콘 */}
        <Avatar
          sx={{
            bgcolor: 'primary.100',
            color: 'primary.main',
            width: 44,
            height: 44,
          }}
        >
          <SmartphoneIcon />
        </Avatar>
        
        {/* 모델 정보 */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {groupedModel.model_name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {groupedModel.series}
          </Typography>
        </Box>
        
        {/* 설정 상태 배지 */}
        <Chip
          icon={stats.isFullyConfigured ? <CheckCircleIcon /> : <SettingsIcon />}
          label={`${stats.configuredCount}/${stats.totalCount} 설정`}
          size="small"
          color={stats.isFullyConfigured ? 'success' : 'warning'}
          sx={{ fontWeight: 600 }}
        />
        
        {/* 스토리지 옵션 배지들 */}
        <Stack direction="row" spacing={0.5}>
          {groupedModel.variants.map((variant) => {
            const variantConfigured = variant.grade_prices.filter(gp => gp.price > 0).length;
            const variantIsConfigured = variantConfigured === grades.length;
            
            return (
              <Chip
                key={variant.id}
                label={variant.storage_display}
                size="small"
                variant={variantIsConfigured ? 'filled' : 'outlined'}
                color={variantIsConfigured ? 'success' : 'default'}
                sx={{ 
                  fontSize: '0.7rem',
                  height: 24,
                  fontWeight: 500,
                }}
              />
            );
          })}
        </Stack>
        
        {/* 변경 표시 */}
        {changedCount > 0 && (
          <Chip
            label={`${changedCount}개 변경`}
            size="small"
            color="warning"
            sx={{ 
              fontWeight: 700,
              animation: 'pulse 2s infinite',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.7 },
              },
            }}
          />
        )}
      </AccordionSummary>
      
      <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>
        {/* Lazy Mount: 한번이라도 열린 적이 있으면 렌더링 */}
        {hasBeenExpanded ? (
          <PriceTable
            variants={groupedModel.variants}
            grades={grades}
            changes={changes}
            onPriceChange={onPriceChange}
            onViewHistory={onViewHistory}
            onDeleteVariant={onDeleteVariant}
            disabled={disabled}
          />
        ) : (
          // 최초 열기 전 스켈레톤 (실제로는 보이지 않음)
          <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

// 통계 계산 헬퍼
function calculateStats(
  groupedModel: GroupedModel, 
  grades: Grade[],
  changes: Map<string, PriceChange>
) {
  const totalCount = groupedModel.variants.length * grades.length;
  let configuredCount = 0;
  
  groupedModel.variants.forEach((variant) => {
    grades.forEach((grade) => {
      const gradePrice = variant.grade_prices.find(gp => gp.grade_id === grade.id);
      const changeKey = `${variant.id}_${grade.id}`;
      const change = changes.get(changeKey);
      
      // 변경된 값이 있으면 그 값으로, 없으면 원본 값으로 체크
      const price = change ? change.newPrice : (gradePrice?.price || 0);
      if (price > 0) {
        configuredCount++;
      }
    });
  });
  
  return {
    totalCount,
    configuredCount,
    isFullyConfigured: configuredCount === totalCount,
  };
}

// 변경된 항목 수 계산
function countChanges(
  groupedModel: GroupedModel,
  changes: Map<string, PriceChange>
): number {
  let count = 0;
  groupedModel.variants.forEach((variant) => {
    changes.forEach((change, key) => {
      if (key.startsWith(variant.id)) {
        count++;
      }
    });
  });
  return count;
}

export const ModelPriceCard = memo(ModelPriceCardComponent);
