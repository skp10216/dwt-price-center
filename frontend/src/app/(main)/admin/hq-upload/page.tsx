/**
 * 단가표 통합 관리 시스템 - 본사 단가표 업로드 페이지 (관리자)
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
import { uploadsApi } from '@/lib/api';

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

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
    items?: any[];
  } | null;
  error_message: string | null;
  is_confirmed: boolean;
  is_applied: boolean;
}

const steps = ['파일 업로드', '처리 중', '검수', '확정', '적용'];

export default function HQUploadPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState<UploadJob | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Job 상태 폴링
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await uploadsApi.get(jobId);
      const jobData = response.data.data as UploadJob;
      setJob(jobData);

      // 상태에 따른 스텝 업데이트
      if (jobData.status === 'queued' || jobData.status === 'running') {
        setActiveStep(1);
        // 계속 폴링
        setTimeout(() => pollJobStatus(jobId), 3000);
      } else if (jobData.status === 'succeeded') {
        if (jobData.is_applied) {
          setActiveStep(4);
        } else if (jobData.is_confirmed) {
          setActiveStep(3);
        } else {
          setActiveStep(2);
        }
      } else if (jobData.status === 'failed') {
        setActiveStep(1);
      }
    } catch (error) {
      enqueueSnackbar('작업 상태 조회에 실패했습니다', { variant: 'error' });
    }
  }, [enqueueSnackbar]);

  // 파일 업로드
  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const response = await uploadsApi.uploadHqExcel(selectedFile);
      const jobData = response.data.data as UploadJob;
      setJob(jobData);
      setActiveStep(1);
      enqueueSnackbar('업로드가 시작되었습니다', { variant: 'info' });

      // 폴링 시작
      pollJobStatus(jobData.id);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '업로드에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  // 확정
  const handleConfirm = async () => {
    if (!job) return;

    setProcessing(true);
    try {
      await uploadsApi.confirm(job.id, true);
      enqueueSnackbar('확정되었습니다', { variant: 'success' });
      setConfirmDialogOpen(false);
      pollJobStatus(job.id);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '확정에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  // 적용
  const handleApply = async () => {
    if (!job) return;

    setProcessing(true);
    try {
      await uploadsApi.apply(job.id);
      enqueueSnackbar('본사 단가표가 적용되었습니다', { variant: 'success' });
      setApplyDialogOpen(false);
      pollJobStatus(job.id);
    } catch (error: any) {
      const message = error.response?.data?.error?.message || '적용에 실패했습니다';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  // 새 업로드
  const handleReset = () => {
    setSelectedFile(null);
    setJob(null);
    setActiveStep(0);
  };

  return (
    <Box>
      <PageHeader
        title="본사 단가표 업로드"
        description="엑셀 파일을 업로드하여 본사 단가표를 갱신합니다"
        secondaryAction={
          job
            ? {
                label: '새 업로드',
                onClick: handleReset,
                variant: 'outlined',
              }
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
        <JobStatusBanner
          status={job.status}
          progress={job.progress}
          error={job.error_message}
          filename={job.original_filename}
          summary={job.result_summary}
        />
      )}

      {/* 단계별 컨텐츠 */}
      <Card>
        <CardContent>
          {activeStep === 0 && (
            <Stack spacing={3}>
              <UploadDropzone
                accept={{
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                  'application/vnd.ms-excel': ['.xls'],
                }}
                onFileSelect={setSelectedFile}
                selectedFile={selectedFile}
                uploading={uploading}
                helperText="엑셀 파일(.xlsx, .xls)만 업로드 가능합니다. 모델코드 컬럼이 필요합니다."
              />
              <Button
                variant="contained"
                size="large"
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
              >
                업로드
              </Button>
            </Stack>
          )}

          {activeStep === 1 && job?.status === 'failed' && (
            <Stack spacing={2} alignItems="center">
              <Typography color="error">처리 중 오류가 발생했습니다</Typography>
              <Button variant="outlined" onClick={handleReset}>
                다시 시도
              </Button>
            </Stack>
          )}

          {activeStep === 2 && job && (
            <Stack spacing={3}>
              <Alert severity="info">
                검수 결과를 확인하세요. 미매핑 항목은 제외하고 확정할 수 있습니다.
              </Alert>
              <Typography>
                매핑된 모델: <strong>{job.result_summary?.matched_count || 0}</strong>개 / 미매핑:{' '}
                <strong>{job.result_summary?.unmatched_count || 0}</strong>개
              </Typography>
              {/* TODO: 검수 테이블 구현 */}
              <Button variant="contained" onClick={() => setConfirmDialogOpen(true)}>
                확정
              </Button>
            </Stack>
          )}

          {activeStep === 3 && job && (
            <Stack spacing={3} alignItems="center">
              <Alert severity="success">확정이 완료되었습니다. 적용하면 현재 단가가 갱신됩니다.</Alert>
              <Button
                variant="contained"
                color="success"
                size="large"
                onClick={() => setApplyDialogOpen(true)}
              >
                적용
              </Button>
            </Stack>
          )}

          {activeStep === 4 && (
            <Stack spacing={2} alignItems="center">
              <Alert severity="success">본사 단가표가 성공적으로 적용되었습니다!</Alert>
              <Button variant="outlined" onClick={handleReset}>
                새 업로드
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* 확정 확인 다이얼로그 */}
      <ConfirmDialog
        open={confirmDialogOpen}
        title="검수 결과 확정"
        message="매핑된 항목만 확정합니다. 미매핑 항목은 제외됩니다. 확정하시겠습니까?"
        confirmLabel="확정"
        confirmColor="primary"
        loading={processing}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmDialogOpen(false)}
      />

      {/* 적용 확인 다이얼로그 */}
      <ConfirmDialog
        open={applyDialogOpen}
        title="본사 단가표 적용"
        message="확정된 단가가 현재 본사 단가표로 적용됩니다. 이 작업은 취소할 수 없습니다. 적용하시겠습니까?"
        confirmLabel="적용"
        confirmColor="success"
        loading={processing}
        onConfirm={handleApply}
        onCancel={() => setApplyDialogOpen(false)}
      />
    </Box>
  );
}
