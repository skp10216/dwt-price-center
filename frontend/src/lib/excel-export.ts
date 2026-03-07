/**
 * 범용 엑셀 다운로드 유틸리티
 * 모든 리스트 페이지에서 공통으로 사용
 */

// ── 샘플 양식 다운로드 ──

interface SampleTemplateColumn {
  header: string;
  width?: number;
}

interface SampleTemplateOptions {
  filename: string;
  sheetName?: string;
  columns: SampleTemplateColumn[];
  /** 예시 데이터 행 (2~3행 정도) */
  sampleRows: (string | number | null)[][];
}

export async function downloadSampleTemplate({
  filename,
  sheetName = 'Sheet1',
  columns,
  sampleRows,
}: SampleTemplateOptions): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const headers = columns.map((c) => c.header);
  const data: (string | number | null)[][] = [headers, ...sampleRows];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = columns.map((col) => ({ wch: col.width || 15 }));

  // 헤더 행 스타일 (XLSX community 는 기본 스타일 미지원이므로 너비만 설정)
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`, { bookType: 'xlsx', type: 'binary' });
}

// ── 리스트 엑셀 내보내기 ──

export interface ExcelColumn<T> {
  header: string;
  field: keyof T | ((row: T) => string | number | null | undefined);
  width?: number;
  /** 'number' → 숫자 서식(#,##0), 'currency' → 원화 서식, 기본은 텍스트 */
  format?: 'number' | 'currency' | 'date' | 'text';
}

interface ExcelExportOptions<T> {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

function getValue<T>(row: T, field: ExcelColumn<T>['field']): string | number | null | undefined {
  if (typeof field === 'function') return field(row);
  return row[field] as string | number | null | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportToExcel<T extends Record<string, any>>({
  filename,
  sheetName = 'Sheet1',
  columns,
  rows,
}: ExcelExportOptions<T>): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // 헤더
  const headers = columns.map((c) => c.header);
  const data: (string | number | null | undefined)[][] = [headers];

  // 데이터 행
  for (const row of rows) {
    data.push(columns.map((col) => getValue(row, col.field)));
  }

  const ws = XLSX.utils.aoa_to_sheet(data);

  // 열 너비
  ws['!cols'] = columns.map((col) => ({ wch: col.width || 15 }));

  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const today = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${filename}_${today}.xlsx`, {
    bookType: 'xlsx',
    type: 'binary',
  });
}
