/**
 * 단가표 통합 관리 시스템 - 감사로그 페이지 (관리자)
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import PageHeader from '@/components/ui/PageHeader';
import { auditApi } from '@/lib/api';

interface AuditLog {
  id: string;
  trace_id: string | null;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  before_data: Record<string, any> | null;
  after_data: Record<string, any> | null;
  description: string | null;
  ip_address: string | null;
  created_at: string;
}

const actionLabels: Record<string, string> = {
  model_create: '모델 생성',
  model_update: '모델 수정',
  model_deactivate: '모델 비활성화',
  grade_create: '등급 생성',
  grade_update: '등급 수정',
  grade_deactivate: '등급 비활성화',
  price_update: '가격 수정',
  deduction_create: '차감 생성',
  deduction_update: '차감 수정',
  deduction_deactivate: '차감 비활성화',
  upload_start: '업로드 시작',
  upload_complete: '업로드 완료',
  upload_review: '업로드 검수',
  upload_confirm: '업로드 확정',
  upload_apply: '업로드 적용',
  partner_create: '거래처 생성',
  partner_update: '거래처 수정',
  partner_deactivate: '거래처 비활성화',
  user_create: '사용자 생성',
  user_update: '사용자 수정',
  user_deactivate: '사용자 비활성화',
  user_role_change: '권한 변경',
  user_login: '로그인',
  user_logout: '로그아웃',
};

const targetTypeLabels: Record<string, string> = {
  ssot_model: '모델',
  grade: '등급',
  grade_price: '가격',
  deduction_item: '차감 항목',
  deduction_level: '차감 레벨',
  upload_job: '업로드',
  partner: '거래처',
  user: '사용자',
};

export default function AuditPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const [filterAction, setFilterAction] = useState('');
  const [filterTargetType, setFilterTargetType] = useState('');

  // 로그 목록 조회
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await auditApi.list({
        page: page + 1,
        page_size: pageSize,
        action: filterAction || undefined,
        target_type: filterTargetType || undefined,
      });
      const data = response.data.data;
      setLogs(data.logs as AuditLog[]);
      setTotal(data.total);
    } catch (error) {
      enqueueSnackbar('감사로그를 불러오는데 실패했습니다', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, filterAction, filterTargetType]);

  const columns: GridColDef[] = [
    {
      field: 'created_at',
      headerName: '일시',
      width: 160,
      renderCell: (params: GridRenderCellParams<AuditLog>) =>
        format(new Date(params.row.created_at), 'yyyy-MM-dd HH:mm:ss'),
    },
    {
      field: 'user_name',
      headerName: '사용자',
      width: 100,
      renderCell: (params: GridRenderCellParams<AuditLog>) =>
        params.row.user_name || params.row.user_email || '-',
    },
    {
      field: 'action',
      headerName: '액션',
      width: 130,
      renderCell: (params: GridRenderCellParams<AuditLog>) => (
        <Chip
          label={actionLabels[params.row.action] || params.row.action}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'target_type',
      headerName: '대상',
      width: 100,
      renderCell: (params: GridRenderCellParams<AuditLog>) =>
        targetTypeLabels[params.row.target_type] || params.row.target_type,
    },
    {
      field: 'description',
      headerName: '설명',
      width: 300,
      flex: 1,
    },
    {
      field: 'ip_address',
      headerName: 'IP',
      width: 120,
    },
  ];

  return (
    <Box>
      <PageHeader
        title="감사로그"
        description="시스템 변경 이력을 조회합니다"
      />

      {/* 필터 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>액션</InputLabel>
              <Select
                value={filterAction}
                label="액션"
                onChange={(e) => setFilterAction(e.target.value)}
              >
                <MenuItem value="">전체</MenuItem>
                {Object.entries(actionLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>대상</InputLabel>
              <Select
                value={filterTargetType}
                label="대상"
                onChange={(e) => setFilterTargetType(e.target.value)}
              >
                <MenuItem value="">전체</MenuItem>
                {Object.entries(targetTypeLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>

      {/* 테이블 */}
      <Card>
        <DataGrid
          rows={logs}
          columns={columns}
          rowCount={total}
          loading={loading}
          pageSizeOptions={[25, 50, 100]}
          paginationModel={{ page, pageSize }}
          paginationMode="server"
          onPaginationModelChange={(model) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          disableRowSelectionOnClick
          autoHeight
          getRowId={(row) => row.id}
        />
      </Card>
    </Box>
  );
}
