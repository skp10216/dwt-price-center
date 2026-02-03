/**
 * 외관 설정 페이지
 *
 * 관리자가 UI 테마를 커스터마이징할 수 있습니다:
 * - 폰트 크기 (small / medium / large)
 * - 여백 밀도 (compact / regular / spacious)
 * - Accent 색상 (8개 프리셋)
 * - 테마 모드 (light / dark / auto)
 *
 * 변경사항은 즉시 반영되며 LocalStorage에 저장됩니다.
 */

'use client';

import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  Grid,
  Avatar,
  Button,
  Divider,
  Alert,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import {
  TextFields as FontIcon,
  ViewCompact as DensityIcon,
  Palette as PaletteIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  SettingsBrightness as AutoModeIcon,
  RestartAlt as ResetIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useAppearanceStore } from '@/lib/store';
import { settingsLabels, DEFAULT_SETTINGS, ADMIN_DEFAULT_SETTINGS } from '@/theme/settings';
import { accentPalettes } from '@/theme/tokens';
import { PageHeader } from '@/components/ui';
import { useSnackbar } from 'notistack';

export default function AppearanceSettingsPage() {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const { settings, setFontScale, setDensity, setAccentColor, setMode, resetSettings } =
    useAppearanceStore();

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 초기화
  const handleReset = () => {
    resetSettings();
    setShowResetConfirm(false);
    enqueueSnackbar('외관 설정이 초기화되었습니다', { variant: 'success' });
  };

  // 테마 모드 아이콘
  const getModeIcon = (mode: typeof settings.mode) => {
    switch (mode) {
      case 'light':
        return <LightModeIcon />;
      case 'dark':
        return <DarkModeIcon />;
      case 'auto':
        return <AutoModeIcon />;
    }
  };

  return (
    <Box>
      {/* 페이지 헤더 */}
      <PageHeader
        title="외관 설정"
        subtitle="UI 테마를 커스터마이징하여 작업 환경을 최적화하세요"
      />

      {/* 안내 메시지 */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2" fontWeight={500} gutterBottom>
          💡 설정은 자동으로 저장되며 즉시 반영됩니다
        </Typography>
        <Typography variant="caption" color="text.secondary">
          브라우저 LocalStorage에 저장되므로 다른 기기에서는 별도로 설정해야 합니다.
        </Typography>
      </Alert>

      <Grid container spacing={3}>
        {/* ========== 1. 폰트 크기 ========== */}
        <Grid item xs={12} lg={6}>
          <Card
            sx={{
              height: '100%',
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 3,
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <Avatar
                  sx={{
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.main',
                  }}
                >
                  <FontIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    폰트 크기
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    전체 UI의 글자 크기를 조정합니다
                  </Typography>
                </Box>
              </Stack>

              <FormControl component="fieldset" fullWidth>
                <RadioGroup
                  value={settings.fontScale}
                  onChange={(e) => setFontScale(e.target.value as any)}
                >
                  <Stack spacing={1.5}>
                    {(['small', 'medium', 'large'] as const).map((scale) => (
                      <Paper
                        key={scale}
                        variant="outlined"
                        sx={{
                          p: 2,
                          cursor: 'pointer',
                          borderWidth: 2,
                          borderColor:
                            settings.fontScale === scale ? 'primary.main' : 'divider',
                          bgcolor:
                            settings.fontScale === scale
                              ? alpha(theme.palette.primary.main, 0.04)
                              : 'transparent',
                          transition: 'all 0.2s',
                          '&:hover': {
                            borderColor: 'primary.main',
                            bgcolor: alpha(theme.palette.primary.main, 0.04),
                          },
                        }}
                        onClick={() => setFontScale(scale)}
                      >
                        <FormControlLabel
                          value={scale}
                          control={<Radio />}
                          label={
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Typography
                                variant="subtitle1"
                                fontWeight={600}
                                sx={{
                                  fontSize:
                                    scale === 'small'
                                      ? '0.875rem'
                                      : scale === 'medium'
                                      ? '1rem'
                                      : '1.125rem',
                                }}
                              >
                                {settingsLabels.fontScale[scale]}
                              </Typography>
                              {settings.fontScale === scale && (
                                <CheckIcon color="primary" fontSize="small" />
                              )}
                            </Stack>
                          }
                          sx={{ m: 0, width: '100%' }}
                        />
                      </Paper>
                    ))}
                  </Stack>
                </RadioGroup>
              </FormControl>
            </CardContent>
          </Card>
        </Grid>

        {/* ========== 2. 여백 밀도 ========== */}
        <Grid item xs={12} lg={6}>
          <Card
            sx={{
              height: '100%',
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 3,
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <Avatar
                  sx={{
                    bgcolor: alpha(theme.palette.info.main, 0.1),
                    color: 'info.main',
                  }}
                >
                  <DensityIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    여백 밀도
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    컴포넌트 간격과 패딩을 조정합니다
                  </Typography>
                </Box>
              </Stack>

              <FormControl component="fieldset" fullWidth>
                <RadioGroup
                  value={settings.density}
                  onChange={(e) => setDensity(e.target.value as any)}
                >
                  <Stack spacing={1.5}>
                    {(['compact', 'regular', 'spacious'] as const).map((density) => (
                      <Paper
                        key={density}
                        variant="outlined"
                        sx={{
                          p: 2,
                          cursor: 'pointer',
                          borderWidth: 2,
                          borderColor:
                            settings.density === density ? 'info.main' : 'divider',
                          bgcolor:
                            settings.density === density
                              ? alpha(theme.palette.info.main, 0.04)
                              : 'transparent',
                          transition: 'all 0.2s',
                          '&:hover': {
                            borderColor: 'info.main',
                            bgcolor: alpha(theme.palette.info.main, 0.04),
                          },
                        }}
                        onClick={() => setDensity(density)}
                      >
                        <FormControlLabel
                          value={density}
                          control={<Radio />}
                          label={
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Typography variant="subtitle1" fontWeight={600}>
                                {settingsLabels.density[density]}
                              </Typography>
                              {settings.density === density && (
                                <CheckIcon color="info" fontSize="small" />
                              )}
                            </Stack>
                          }
                          sx={{ m: 0, width: '100%' }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                          {density === 'compact' && '정보 밀도 높음 (관리자 추천)'}
                          {density === 'regular' && '균형잡힌 간격 (기본값)'}
                          {density === 'spacious' && '넓은 간격 (가독성 우선)'}
                        </Typography>
                      </Paper>
                    ))}
                  </Stack>
                </RadioGroup>
              </FormControl>
            </CardContent>
          </Card>
        </Grid>

        {/* ========== 3. Accent 색상 ========== */}
        <Grid item xs={12}>
          <Card
            sx={{
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 3,
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <Avatar
                  sx={{
                    bgcolor: alpha(theme.palette.secondary.main, 0.1),
                    color: 'secondary.main',
                  }}
                >
                  <PaletteIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    Accent 색상
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Primary 색상을 선택하여 전체 UI의 강조 색상을 변경합니다
                  </Typography>
                </Box>
              </Stack>

              <Grid container spacing={2}>
                {Object.entries(accentPalettes).map(([colorKey, palette]) => (
                  <Grid item xs={6} sm={4} md={3} key={colorKey}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        cursor: 'pointer',
                        borderWidth: 2,
                        borderColor:
                          settings.accentColor === colorKey ? palette.main : 'divider',
                        bgcolor:
                          settings.accentColor === colorKey
                            ? alpha(palette.main, 0.04)
                            : 'transparent',
                        transition: 'all 0.2s',
                        '&:hover': {
                          borderColor: palette.main,
                          bgcolor: alpha(palette.main, 0.04),
                          transform: 'translateY(-2px)',
                        },
                      }}
                      onClick={() => setAccentColor(colorKey as any)}
                    >
                      <Stack alignItems="center" spacing={1.5}>
                        {/* 색상 프리뷰 */}
                        <Box
                          sx={{
                            width: 48,
                            height: 48,
                            borderRadius: 2,
                            background: `linear-gradient(135deg, ${palette.main} 0%, ${palette.dark} 100%)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: `0 4px 12px ${alpha(palette.main, 0.3)}`,
                          }}
                        >
                          {settings.accentColor === colorKey && (
                            <CheckIcon sx={{ color: 'white', fontSize: 24 }} />
                          )}
                        </Box>

                        {/* 색상명 */}
                        <Typography
                          variant="subtitle2"
                          fontWeight={
                            settings.accentColor === colorKey ? 700 : 500
                          }
                          color={
                            settings.accentColor === colorKey
                              ? 'text.primary'
                              : 'text.secondary'
                          }
                        >
                          {settingsLabels.accentColor[colorKey as keyof typeof settingsLabels.accentColor]}
                        </Typography>
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* ========== 4. 테마 모드 ========== */}
        <Grid item xs={12}>
          <Card
            sx={{
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 3,
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <Avatar
                  sx={{
                    bgcolor: alpha(theme.palette.warning.main, 0.1),
                    color: 'warning.main',
                  }}
                >
                  {getModeIcon(settings.mode)}
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    테마 모드
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    라이트/다크 모드 또는 시스템 설정을 따릅니다
                  </Typography>
                </Box>
              </Stack>

              <FormControl component="fieldset" fullWidth>
                <RadioGroup
                  row
                  value={settings.mode}
                  onChange={(e) => setMode(e.target.value as any)}
                >
                  <Grid container spacing={2}>
                    {(['light', 'dark', 'auto'] as const).map((mode) => (
                      <Grid item xs={12} sm={4} key={mode}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            cursor: 'pointer',
                            borderWidth: 2,
                            borderColor:
                              settings.mode === mode ? 'warning.main' : 'divider',
                            bgcolor:
                              settings.mode === mode
                                ? alpha(theme.palette.warning.main, 0.04)
                                : 'transparent',
                            transition: 'all 0.2s',
                            '&:hover': {
                              borderColor: 'warning.main',
                              bgcolor: alpha(theme.palette.warning.main, 0.04),
                            },
                          }}
                          onClick={() => setMode(mode)}
                        >
                          <FormControlLabel
                            value={mode}
                            control={<Radio />}
                            label={
                              <Stack direction="row" alignItems="center" spacing={1}>
                                {getModeIcon(mode)}
                                <Typography variant="subtitle1" fontWeight={600}>
                                  {settingsLabels.mode[mode]}
                                </Typography>
                                {settings.mode === mode && (
                                  <CheckIcon color="warning" fontSize="small" />
                                )}
                              </Stack>
                            }
                            sx={{ m: 0, width: '100%' }}
                          />
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </RadioGroup>
              </FormControl>
            </CardContent>
          </Card>
        </Grid>

        {/* ========== 5. 초기화 ========== */}
        <Grid item xs={12}>
          <Card
            sx={{
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 3,
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
                spacing={2}
              >
                <Box>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    설정 초기화
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    모든 외관 설정을 기본값으로 되돌립니다
                  </Typography>
                </Box>

                {showResetConfirm ? (
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<ResetIcon />}
                      onClick={handleReset}
                    >
                      초기화 확인
                    </Button>
                    <Button variant="outlined" onClick={() => setShowResetConfirm(false)}>
                      취소
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<ResetIcon />}
                    onClick={() => setShowResetConfirm(true)}
                  >
                    초기화
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* ========== 현재 설정 요약 ========== */}
        <Grid item xs={12}>
          <Alert severity="success" icon={<CheckIcon />}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              현재 설정
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
              <Chip
                label={`폰트: ${settingsLabels.fontScale[settings.fontScale]}`}
                size="small"
                color="primary"
                variant="outlined"
              />
              <Chip
                label={`밀도: ${settingsLabels.density[settings.density]}`}
                size="small"
                color="info"
                variant="outlined"
              />
              <Chip
                label={`색상: ${settingsLabels.accentColor[settings.accentColor]}`}
                size="small"
                color="secondary"
                variant="outlined"
              />
              <Chip
                label={`모드: ${settingsLabels.mode[settings.mode]}`}
                size="small"
                color="warning"
                variant="outlined"
              />
            </Stack>
          </Alert>
        </Grid>
      </Grid>
    </Box>
  );
}
