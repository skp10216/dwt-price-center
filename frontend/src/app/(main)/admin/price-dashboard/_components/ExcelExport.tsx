/**
 * 판매가 대시보드 - 엑셀 내보내기 컴포넌트
 * - UTF-8 BOM으로 한글 깨짐 방지
 * - 아이폰/삼성 각각 별도 시트
 */

'use client';

import { useState, useCallback } from 'react';
import {
  Button,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { ManufacturerTableData } from './types';

interface ExcelExportProps {
  appleData: ManufacturerTableData;
  samsungData: ManufacturerTableData;
}

export function ExcelExport({ appleData, samsungData }: ExcelExportProps) {
  const [loading, setLoading] = useState(false);
  const { enqueueSnackbar } = useSnackbar();

  const handleExport = useCallback(async () => {
    setLoading(true);
    try {
      // 동적 import로 xlsx 라이브러리 로드
      const XLSX = await import('xlsx');

      // 워크북 생성
      const workbook = XLSX.utils.book_new();

      // 데이터를 시트 형식으로 변환하는 함수 (필터 적용 전 전체 데이터 사용)
      const createSheetData = (data: ManufacturerTableData) => {
        const { grades, allRows, extraColumns } = data;
        const rows = allRows || data.rows; // allRows가 없으면 rows 사용

        // 헤더 행
        const headers = ['모델명', '시리즈', '용량'];
        grades.forEach(grade => headers.push(grade.name));
        if (extraColumns) {
          extraColumns.forEach(col => headers.push(col));
        }
        headers.push('비고');

        // 데이터 행
        const sheetData: (string | number)[][] = [headers];
        rows.forEach(row => {
          const rowData: (string | number)[] = [
            row.modelName,
            row.series,
            row.storage,
          ];
          grades.forEach(grade => {
            rowData.push(row.prices[grade.id] || 0);
          });
          if (extraColumns) {
            extraColumns.forEach(() => rowData.push(''));
          }
          rowData.push(row.note || '');
          sheetData.push(rowData);
        });

        return sheetData;
      };

      // 아이폰 시트
      const appleSheetData = createSheetData(appleData);
      const appleSheet = XLSX.utils.aoa_to_sheet(appleSheetData);

      // 열 너비 설정
      const colWidths = [
        { wch: 20 }, // 모델명
        { wch: 15 }, // 시리즈
        { wch: 10 }, // 용량
      ];
      appleData.grades.forEach(() => colWidths.push({ wch: 12 }));
      if (appleData.extraColumns) {
        appleData.extraColumns.forEach(() => colWidths.push({ wch: 10 }));
      }
      colWidths.push({ wch: 30 }); // 비고
      appleSheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, appleSheet, '아이폰');

      // 삼성 시트
      const samsungSheetData = createSheetData(samsungData);
      const samsungSheet = XLSX.utils.aoa_to_sheet(samsungSheetData);

      const samsungColWidths = [
        { wch: 20 },
        { wch: 15 },
        { wch: 10 },
      ];
      samsungData.grades.forEach(() => samsungColWidths.push({ wch: 12 }));
      if (samsungData.extraColumns) {
        samsungData.extraColumns.forEach(() => samsungColWidths.push({ wch: 10 }));
      }
      samsungColWidths.push({ wch: 30 });
      samsungSheet['!cols'] = samsungColWidths;

      XLSX.utils.book_append_sheet(workbook, samsungSheet, '삼성');

      // 파일 다운로드
      const today = new Date().toISOString().split('T')[0];
      const filename = `모델가격표_${today}.xlsx`;

      // UTF-8 BOM을 포함하여 한글 깨짐 방지
      XLSX.writeFile(workbook, filename, {
        bookType: 'xlsx',
        type: 'binary',
      });

      enqueueSnackbar('엑셀 파일이 다운로드되었습니다.', { variant: 'success' });
    } catch (error) {
      console.error('Excel export failed:', error);
      enqueueSnackbar('엑셀 내보내기에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [appleData, samsungData, enqueueSnackbar]);

  return (
    <Tooltip title="엑셀 다운로드">
      <Button
        variant="outlined"
        size="small"
        startIcon={loading ? <CircularProgress size={16} /> : <DownloadIcon />}
        onClick={handleExport}
        disabled={loading}
      >
        엑셀
      </Button>
    </Tooltip>
  );
}
