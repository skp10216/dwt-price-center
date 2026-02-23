/**
 * AppPageToolbar - 통일된 검색/필터/액션 툴바
 *
 * 설계 원칙:
 * - PageHeader 바로 아래, 테이블/콘텐츠 위에 위치
 * - 좌: 검색/필터 (ToggleButtonGroup, TextField, Select 등)
 * - 우: 액션 버튼 (추가, 삭제, 내보내기 등)
 * - 밀도 모드에 따라 내부 패딩 자동 조절
 * - py: 0.75 ~ 1.25 (compact하게)
 *
 * 사용 예시:
 * <AppPageToolbar
 *   left={
 *     <>
 *       <ToggleButtonGroup value={status} exclusive size="small" onChange={...}>
 *         <ToggleButton value="all">전체</ToggleButton>
 *         <ToggleButton value="open">미정산</ToggleButton>
 *       </ToggleButtonGroup>
 *       <TextField size="small" placeholder="검색..." sx={{ width: 220 }} />
 *     </>
 *   }
 *   right={
 *     <>
 *       <Button variant="outlined" color="error">삭제</Button>
 *       <Button variant="contained">추가</Button>
 *     </>
 *   }
 * />
 */

'use client';

import { Paper, Stack, type SxProps, type Theme } from '@mui/material';

export interface AppPageToolbarProps {
  /** 좌측 영역 (검색, 필터 등) */
  left?: React.ReactNode;
  /** 우측 영역 (액션 버튼 등) */
  right?: React.ReactNode;
  /** 추가 sx 스타일 */
  sx?: SxProps<Theme>;
}

export default function AppPageToolbar({ left, right, sx }: AppPageToolbarProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        px: 2,
        py: 0.875,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexWrap: 'wrap',
        ...sx,
      }}
    >
      {/* 좌측: 검색/필터 */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        flexWrap="wrap"
        useFlexGap
        sx={{ flex: 1, minWidth: 0 }}
      >
        {left}
      </Stack>

      {/* 우측: 액션 */}
      {right && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          flexShrink={0}
          flexWrap="wrap"
          useFlexGap
        >
          {right}
        </Stack>
      )}
    </Paper>
  );
}
