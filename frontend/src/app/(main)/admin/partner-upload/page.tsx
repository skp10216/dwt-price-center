/**
 * 단가표 통합 관리 시스템 - 거래처 단가표 업로드 페이지 (관리자)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stepper,
  Step,
  StepLabel,
  Alert,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import PageHeader from '@/components/ui/PageHeader';
import UploadDropzone from '@/components/upload/UploadDropzone';
import JobStatusBanner from '@/components/upload/JobStatusBanner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { uploadsApi, partnersApi } from '@/lib/api';

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

interface Partner {
  id: string;
  name: string;
}

interface UploadJob {
  id: string;
  job_type: string;
  status: JobStatus;
  progress: number;
  original_filename: string;
  result_summary: {
    total_rows?: number;
    matched_count?: number;
    unmatched_count?: number;
    low_confidence_count?: number;
    quality_warnings?: string[];
    items?: any[];
  } | null;
  error_message: string | null;
  is_confirmed: boolean;
}

const steps = ['거래처 선택', '파일 업로드', '처리 중', '검수', '저장'];

export default function PartnerUploadPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState<UploadJob | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 거래처 목록 조회
  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const response = await partnersApi.list({ is_active: true });
        setPartners(response.data.data.partners as Partner[]);
      } catch (error) {
        enqueueSnackbar('거래처 목록을 불러오는데 실패했습니다', { variant: 'error' });
      }
    };
    fetchPartners();
  }, [enqueueSnackbar]);

  // Job 상태 폴링
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await uploadsApi.get(jobId);
      const jobData = response.data.data as UploadJob;
      setJob(jobData);

      if (jobData.status === 'queued' || jobData.status === 'running') {
        setActiveStep(2);
        setTimeout(() => pollJobStatus(jobId), 3000);
      } else if (jobData.status === 'succeeded') {
        if (jobData.is_confirmed) {
          setActiveStep(4);
        } else {
          setActiveStep(3);
        }
      } else if (jobData.status === 'failed') {
        setActiveStep(2);
      }
    } catch (error) {
      enqueueSnackbar('작업 상태 조회에 실패했습니다', { variant: 'error' });
    }
  }, [enqueueSnackbar]);

  // 파일 업로드
  const handleUpload = async () => {
    if (!selectedFile || !selectedPartnerId) return;

    setUploading(true);
    try {
      const response = await uploadsApi.uploadPartner(selectedFile, selectedPartnerId);
      const jobData = response.data.data as UploadJob;
      setJob(jobData);
      setActiveStep(2);
      enqueueSnackbar('업로드가 시작되었습니다', { variant: 'info' });
      pollJobStatus(jobData.id);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '업로드에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  // 확정 (저장)
  const handleConfirm = async () => {
    if (!job) return;

    setProcessing(true);
    try {
      await uploadsApi.confirm(job.id, true);
      enqueueSnackbar('거래처 단가가 저장되었습니다', { variant: 'success' });
      setConfirmDialogOpen(false);
      pollJobStatus(job.id);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '저장에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  // 새 업로드
  const handleReset = () => {
    setSelectedFile(null);
    setJob(null);
    setActiveStep(selectedPartnerId ? 1 : 0);
  };

  // 거래처 선택
  const handlePartnerSelect = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
    if (partnerId && activeStep === 0) {
      setActiveStep(1);
    }
  };

  const selectedPartner = partners.find((p) => p.id === selectedPartnerId);

  return (
    <Box>
      <PageHeader
        title="거래처 단가표 업로드"
        description="이미지 또는 엑셀 파일을 업로드하여 거래처 단가를 등록합니다"
        actions={
          job
            ? [{
                label: '새 업로드',
                onClick: handleReset,
                variant: 'outlined' as const,
              }]
            : undefined
        }
      />

      {/* 진행 단계 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stepper activeStep={activeStep}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </CardContent>
      </Card>

      {/* Job 상태 배너 */}
      {job && (
        <>
          <JobStatusBanner
            status={job.status}
            progress={job.progress}
            error={job.error_message}
            filename={job.original_filename}
            summary={job.result_summary}
          />
          {job.result_summary?.quality_warnings && job.result_summary.quality_warnings.length > 0 && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              {job.result_summary.quality_warnings.join(', ')}
            </Alert>
          )}
        </>
      )}

      {/* 단계별 컨텐츠 */}
      <Card>
        <CardContent>
          {(activeStep === 0 || activeStep === 1) && (
            <Stack spacing={3}>
              {/* 거래처 선택 */}
              <FormControl fullWidth>
                <InputLabel>거래처 선택</InputLabel>
                <Select
                  value={selectedPartnerId}
                  label="거래처 선택"
                  onChange={(e) => handlePartnerSelect(e.target.value)}
                >
                  {partners.map((partner) => (
                    <MenuItem key={partner.id} value={partner.id}>
                      {partner.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* 파일 업로드 */}
              {selectedPartnerId && (
                <>
                  <UploadDropzone
                    accept={{
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                      'application/vnd.ms-excel': ['.xls'],
                      'image/*': ['.png', '.jpg', '.jpeg'],
                    }}
                    onFileSelect={setSelectedFile}
                    selectedFile={selectedFile}
                    uploading={uploading}
                    helperText="엑셀(.xlsx, .xls) 또는 이미지(.png, .jpg) 파일을 업로드하세요"
                  />
                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleUpload}
                    disabled={!selectedFile || uploading}
                  >
                    업로드
                  </Button>
                </>
              )}
            </Stack>
          )}

          {activeStep === 2 && job?.status === 'failed' && (
            <Stack spacing={2} alignItems="center">
              <Typography color="error">처리 중 오류가 발생했습니다</Typography>
              <Button variant="outlined" onClick={handleReset}>
                다시 시도
              </Button>
            </Stack>
          )}

          {activeStep === 3 && job && (
            <Stack spacing={3}>
              <Alert severity="info">
                검수 결과를 확인하세요. 저신뢰/미매핑 항목은 직접 수정하거나 제외할 수 있습니다.
              </Alert>
              <Stack direction="row" spacing={2}>
                <Typography>
                  거래처: <strong>{selectedPartner?.name}</strong>
                </Typography>
                <Typography>
                  매핑: <strong>{job.result_summary?.matched_count || 0}</strong>
                </Typography>
                <Typography>
                  저신뢰: <strong>{job.result_summary?.low_confidence_count || 0}</strong>
                </Typography>
                <Typography>
                  미매핑: <strong>{job.result_summary?.unmatched_count || 0}</strong>
                </Typography>
              </Stack>
              {/* TODO: 검수 테이블 구현 */}
              <Button variant="contained" onClick={() => setConfirmDialogOpen(true)}>
                저장
              </Button>
            </Stack>
          )}

          {activeStep === 4 && (
            <Stack spacing={2} alignItems="center">
              <Alert severity="success">거래처 단가가 성공적으로 저장되었습니다!</Alert>
              <Button variant="outlined" onClick={handleReset}>
                다른 거래처 업로드
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* 저장 확인 다이얼로그 */}
      <ConfirmDialog
        open={confirmDialogOpen}
        title="거래처 단가 저장"
        message="매핑된 항목을 저장합니다. 미매핑 항목은 제외됩니다. 저장하시겠습니까?"
        confirmLabel="저장"
        confirmColor="primary"
        loading={processing}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmDialogOpen(false)}
      />
    </Box>
  );
}
