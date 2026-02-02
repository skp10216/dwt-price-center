/**
 * 인라인 편집 가능한 가격 셀
 * 
 * 성능 최적화:
 * - 로컬 상태로 입력 관리 (타이핑 중 re-render 최소화)
 * - blur/enter 시점에만 부모 상태 업데이트
 * - memo로 불필요한 re-render 방지
 */

'use client';

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { TextField, Box, Typography, InputAdornment } from '@mui/material';

interface EditableCellProps {
  value: number;
  originalValue: number;
  isChanged: boolean;
  onValueChange: (newValue: number) => void;
  disabled?: boolean;
}

function EditableCellComponent({
  value,
  originalValue,
  isChanged,
  onValueChange,
  disabled = false,
}: EditableCellProps) {
  // 로컬 입력 상태 (문자열로 관리)
  const [localValue, setLocalValue] = useState<string>(formatNumber(value));
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 외부 value 변경 시 로컬 상태 동기화
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(formatNumber(value));
    }
  }, [value, isFocused]);
  
  // 숫자 포맷팅 (천단위 콤마)
  function formatNumber(num: number): string {
    if (num === 0) return '';
    return num.toLocaleString('ko-KR');
  }
  
  // 입력값에서 숫자만 추출
  function parseNumber(str: string): number {
    const cleaned = str.replace(/[^\d]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
  }
  
  // 입력 변경 핸들러 (로컬 상태만 업데이트)
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // 숫자와 콤마만 허용
    const cleaned = inputValue.replace(/[^\d,]/g, '');
    setLocalValue(cleaned);
  }, []);
  
  // 포커스 핸들러
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    // 포커스 시 숫자만 표시 (콤마 제거)
    setLocalValue(value > 0 ? value.toString() : '');
  }, [value]);
  
  // blur 시 부모 상태 업데이트
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const parsedValue = parseNumber(localValue);
    setLocalValue(formatNumber(parsedValue));
    
    // 값이 변경된 경우에만 부모에게 알림
    if (parsedValue !== value) {
      onValueChange(parsedValue);
    }
  }, [localValue, value, onValueChange]);
  
  // Enter 키 처리
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
    // Tab 키는 기본 동작 유지
  }, []);
  
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
      }}
    >
      <TextField
        inputRef={inputRef}
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        size="small"
        placeholder="0"
        InputProps={{
          endAdornment: !isFocused && localValue ? (
            <InputAdornment position="end">
              <Typography variant="caption" color="text.secondary">원</Typography>
            </InputAdornment>
          ) : null,
          sx: {
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            textAlign: 'right',
            bgcolor: isChanged ? 'warning.50' : 'background.paper',
            borderColor: isChanged ? 'warning.main' : undefined,
            '& input': {
              textAlign: 'right',
              pr: 0.5,
            },
            '&:hover': {
              bgcolor: isChanged ? 'warning.100' : 'grey.50',
            },
            '&.Mui-focused': {
              bgcolor: 'primary.50',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: isChanged ? 'warning.main' : 'primary.main',
                borderWidth: 2,
              },
            },
          },
        }}
        sx={{
          width: '100%',
          '& .MuiOutlinedInput-root': {
            borderRadius: 1,
            ...(isChanged && {
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'warning.main',
                borderWidth: 2,
              },
            }),
          },
        }}
      />
      {/* 변경 표시 인디케이터 */}
      {isChanged && (
        <Box
          sx={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'warning.main',
          }}
        />
      )}
    </Box>
  );
}

// memo로 불필요한 re-render 방지
export const EditableCell = memo(EditableCellComponent);
