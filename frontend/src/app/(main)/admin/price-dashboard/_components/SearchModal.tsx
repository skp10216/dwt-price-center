/**
 * 판매가 대시보드 - 검색 모달 (Ctrl+K)
 * - 모델명, 용량으로 실시간 필터링
 * - 키보드 방향키로 결과 탐색
 */

'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Box,
  Chip,
  InputAdornment,
  alpha,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { PriceTableRow, SearchResult } from './types';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  appleRows: PriceTableRow[];
  samsungRows: PriceTableRow[];
  onSelect: (result: SearchResult) => void;
}

export function SearchModal({
  open,
  onClose,
  appleRows,
  samsungRows,
  onSelect,
}: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 검색 결과
  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];

    const searchLower = query.toLowerCase().trim();
    const matches: SearchResult[] = [];

    // 아이폰 검색
    appleRows.forEach(row => {
      const matchesQuery =
        row.modelName.toLowerCase().includes(searchLower) ||
        row.series.toLowerCase().includes(searchLower) ||
        row.storage.toLowerCase().includes(searchLower);

      if (matchesQuery) {
        matches.push({
          id: row.id,
          modelName: row.modelName,
          storage: row.storage,
          manufacturer: 'apple',
          series: row.series,
        });
      }
    });

    // 삼성 검색
    samsungRows.forEach(row => {
      const matchesQuery =
        row.modelName.toLowerCase().includes(searchLower) ||
        row.series.toLowerCase().includes(searchLower) ||
        row.storage.toLowerCase().includes(searchLower);

      if (matchesQuery) {
        matches.push({
          id: row.id,
          modelName: row.modelName,
          storage: row.storage,
          manufacturer: 'samsung',
          series: row.series,
        });
      }
    });

    // 최대 20개까지만 표시
    return matches.slice(0, 20);
  }, [query, appleRows, samsungRows]);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // 선택 인덱스 변경 시 스크롤
  useEffect(() => {
    if (listRef.current && results.length > 0) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, results.length]);

  // 키보드 핸들링
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [results, selectedIndex, onSelect, onClose]);

  // 결과 선택
  const handleSelect = useCallback((result: SearchResult) => {
    onSelect(result);
  }, [onSelect]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          position: 'fixed',
          top: '15%',
          m: 0,
          borderRadius: 2,
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* 검색 입력 */}
        <TextField
          inputRef={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="모델명 또는 용량으로 검색..."
          fullWidth
          variant="outlined"
          autoComplete="off"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Typography variant="caption" color="text.secondary">
                  ESC로 닫기
                </Typography>
              </InputAdornment>
            ),
            sx: {
              '& fieldset': { border: 'none' },
              fontSize: '1rem',
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 0,
              borderBottom: 1,
              borderColor: 'divider',
            },
          }}
        />

        {/* 검색 결과 */}
        {query.trim() && (
          <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
            {results.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  검색 결과가 없습니다.
                </Typography>
              </Box>
            ) : (
              <List ref={listRef} dense sx={{ py: 0 }}>
                {results.map((result, index) => (
                  <ListItem key={`${result.id}-${index}`} disablePadding>
                    <ListItemButton
                      selected={index === selectedIndex}
                      onClick={() => handleSelect(result)}
                      sx={{
                        py: 1.5,
                        px: 2,
                        '&.Mui-selected': {
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                        },
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body1" fontWeight={500}>
                              {result.modelName}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {result.storage}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {result.series}
                          </Typography>
                        }
                      />
                      <Chip
                        label={result.manufacturer === 'apple' ? '아이폰' : '삼성'}
                        size="small"
                        color={result.manufacturer === 'apple' ? 'default' : 'primary'}
                        variant="outlined"
                        sx={{ ml: 1 }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}

        {/* 검색어가 없을 때 */}
        {!query.trim() && (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              검색어를 입력하세요
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
              <Chip label="↑↓ 이동" size="small" variant="outlined" />
              <Chip label="Enter 선택" size="small" variant="outlined" />
              <Chip label="ESC 닫기" size="small" variant="outlined" />
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
