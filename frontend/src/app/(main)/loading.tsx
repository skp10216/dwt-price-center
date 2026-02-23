import { Box, Skeleton, Stack } from '@mui/material';

export default function MainLoading() {
  return (
    <Box sx={{ p: 0 }}>
      {/* 헤더 스켈레톤 */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Skeleton variant="circular" width={28} height={28} />
          <Skeleton variant="text" width={160} height={32} />
        </Stack>
        <Skeleton variant="rounded" width={100} height={32} sx={{ borderRadius: 1 }} />
      </Stack>
      {/* 툴바 스켈레톤 */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <Skeleton variant="rounded" width={200} height={36} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rounded" width={80} height={36} sx={{ borderRadius: 1 }} />
      </Stack>
      {/* 테이블 스켈레톤 */}
      <Skeleton variant="rounded" width="100%" height={36} sx={{ mb: 0.5, borderRadius: 0.5 }} />
      {[...Array(8)].map((_, i) => (
        <Skeleton key={i} variant="rounded" width="100%" height={40} sx={{ mb: 0.25, borderRadius: 0.5, opacity: 1 - i * 0.1 }} />
      ))}
    </Box>
  );
}
