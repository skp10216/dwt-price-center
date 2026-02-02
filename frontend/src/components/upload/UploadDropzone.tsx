/**
 * 단가표 통합 관리 시스템 - Upload Dropzone 컴포넌트
 * 파일 선택/드래그앤드롭/유효성/진행 상태
 */

'use client';

import { useCallback } from 'react';
import { useDropzone, Accept } from 'react-dropzone';
import { Box, Typography, Stack, LinearProgress, Paper, Chip } from '@mui/material';
import { CloudUpload as CloudUploadIcon, InsertDriveFile as FileIcon } from '@mui/icons-material';

interface UploadDropzoneProps {
  accept?: Accept;
  maxSize?: number; // bytes
  onFileSelect: (file: File) => void;
  uploading?: boolean;
  uploadProgress?: number;
  selectedFile?: File | null;
  error?: string | null;
  helperText?: string;
}

export default function UploadDropzone({
  accept = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-excel': ['.xls'],
    'image/*': ['.png', '.jpg', '.jpeg'],
  },
  maxSize = 50 * 1024 * 1024, // 50MB
  onFileSelect,
  uploading = false,
  uploadProgress = 0,
  selectedFile = null,
  error = null,
  helperText,
}: UploadDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false,
    disabled: uploading,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const rejectionError = fileRejections[0]?.errors[0];

  return (
    <Box>
      <Paper
        {...getRootProps()}
        variant="outlined"
        sx={{
          p: 4,
          textAlign: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          bgcolor: isDragActive ? 'action.hover' : 'background.paper',
          borderColor: error || rejectionError ? 'error.main' : isDragActive ? 'primary.main' : 'divider',
          borderStyle: 'dashed',
          borderWidth: 2,
          transition: 'all 0.2s',
          '&:hover': {
            bgcolor: uploading ? undefined : 'action.hover',
            borderColor: uploading ? undefined : 'primary.main',
          },
        }}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <Stack spacing={2} alignItems="center">
            <Typography color="primary">업로드 중...</Typography>
            <Box sx={{ width: '100%', maxWidth: 300 }}>
              <LinearProgress variant="determinate" value={uploadProgress} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {uploadProgress}%
            </Typography>
          </Stack>
        ) : selectedFile ? (
          <Stack spacing={1} alignItems="center">
            <FileIcon sx={{ fontSize: 48, color: 'primary.main' }} />
            <Typography fontWeight={600}>{selectedFile.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {formatFileSize(selectedFile.size)}
            </Typography>
            <Chip label="클릭하여 다른 파일 선택" size="small" variant="outlined" />
          </Stack>
        ) : (
          <Stack spacing={2} alignItems="center">
            <CloudUploadIcon sx={{ fontSize: 48, color: 'action.active' }} />
            <Typography>
              {isDragActive ? '파일을 여기에 놓으세요' : '클릭하거나 파일을 드래그하세요'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {helperText || `최대 ${formatFileSize(maxSize)}`}
            </Typography>
          </Stack>
        )}
      </Paper>

      {(error || rejectionError) && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error || (rejectionError?.code === 'file-too-large' ? '파일이 너무 큽니다' : rejectionError?.message)}
        </Typography>
      )}
    </Box>
  );
}
