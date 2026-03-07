'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, alpha, Chip, Button, useTheme,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import NightsStayIcon from '@mui/icons-material/NightsStay';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import RefreshIcon from '@mui/icons-material/Refresh';
import { AppPageContainer, AppPageHeader } from '@/components/ui';
import { settlementAdminApi } from '@/lib/api';

interface AnomalyItem {
  type: string;
  severity: string;
  title: string;
  description: string;
  user_email?: string;
  created_at?: string;
  count?: number;
}

const SEVERITY_CONFIG: Record<string, { color: string; label: string }> = {
  high: { color: '#d32f2f', label: '높음' },
  medium: { color: '#ed6c02', label: '보통' },
  low: { color: '#0288d1', label: '낮음' },
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  bulk_delete: <DeleteSweepIcon sx={{ fontSize: 20 }} />,
  night_activity: <NightsStayIcon sx={{ fontSize: 20 }} />,
  large_amount: <MonetizationOnIcon sx={{ fontSize: 20 }} />,
  lock_change: <LockOpenIcon sx={{ fontSize: 20 }} />,
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

export default function AnomalyPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [period, setPeriod] = useState('7d');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settlementAdminApi.getAnomalies(period);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (res.data as any)?.data ?? res.data;
      setAnomalies(data.anomalies || []);
      setTotal(data.total || 0);
    } catch {
      enqueueSnackbar('비정상 활동 감지 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [period, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  const c = theme.palette;

  // 심각도별 그룹
  const highCount = anomalies.filter(a => a.severity === 'high').length;
  const mediumCount = anomalies.filter(a => a.severity === 'medium').length;

  return (
    <AppPageContainer>
      <AppPageHeader
        icon={<WarningAmberIcon />}
        title="비정상 활동 감지"
        description="대량 삭제, 야간 활동, 대량 금액 변경 등 이상 패턴을 감지합니다"
        color="warning"
        count={total}
        onRefresh={loadData}
        loading={loading}
        chips={total > 0 ? [
          ...(highCount > 0 ? [<Chip key="high" label={`위험 ${highCount}`} size="small" color="error" sx={{ fontWeight: 700 }} />] : []),
          ...(mediumCount > 0 ? [<Chip key="med" label={`주의 ${mediumCount}`} size="small" color="warning" sx={{ fontWeight: 700 }} />] : []),
        ] : [
          <Chip key="ok" label="이상 없음" size="small" color="success" sx={{ fontWeight: 700 }} />,
        ]}
      />

      {/* 기간 필터 */}
      <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="caption" fontWeight={600} color="text.secondary">감지 기간</Typography>
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={(_, v) => v && setPeriod(v)}
            size="small"
          >
            <ToggleButton value="24h" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>24시간</ToggleButton>
            <ToggleButton value="7d" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>7일</ToggleButton>
            <ToggleButton value="30d" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>30일</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Paper>

      {/* 이상 항목 리스트 */}
      {!loading && anomalies.length === 0 && (
        <Paper sx={{
          p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider',
          borderLeft: `4px solid ${c.success.main}`,
          background: alpha(c.success.main, 0.03),
          textAlign: 'center',
        }}>
          <Typography variant="body2" fontWeight={700} color="success.main">
            감지된 이상 활동이 없습니다
          </Typography>
          <Typography variant="caption" color="text.secondary">
            선택 기간 내 모든 활동이 정상 범위입니다
          </Typography>
        </Paper>
      )}

      <Stack spacing={1.5}>
        {anomalies.map((anomaly, idx) => {
          const sev = SEVERITY_CONFIG[anomaly.severity] || SEVERITY_CONFIG.low;
          const icon = TYPE_ICON[anomaly.type] || <InfoOutlinedIcon sx={{ fontSize: 20 }} />;

          return (
            <Paper key={idx} sx={{
              p: 2, borderRadius: 2,
              border: '1px solid', borderColor: alpha(sev.color, 0.3),
              borderLeft: `4px solid ${sev.color}`,
              background: alpha(sev.color, 0.02),
              transition: 'all 0.2s ease',
              '&:hover': { background: alpha(sev.color, 0.05) },
            }}>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Box sx={{ color: sev.color, mt: 0.25, flexShrink: 0 }}>
                  {icon}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={700}>{anomaly.title}</Typography>
                    <Chip
                      label={sev.label}
                      size="small"
                      sx={{
                        height: 18, fontSize: '0.65rem', fontWeight: 700,
                        bgcolor: alpha(sev.color, 0.1), color: sev.color,
                      }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {anomaly.description}
                  </Typography>
                  <Stack direction="row" spacing={2} sx={{ mt: 0.75 }}>
                    {anomaly.user_email && (
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'text.disabled' }}>
                        {anomaly.user_email}
                      </Typography>
                    )}
                    {anomaly.created_at && (
                      <Typography variant="caption" sx={{ fontFeatureSettings: '"tnum" on', fontSize: '0.7rem', color: 'text.disabled' }}>
                        {formatDate(anomaly.created_at)}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </AppPageContainer>
  );
}
