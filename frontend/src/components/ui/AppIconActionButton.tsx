/**
 * AppIconActionButton - 통일된 아이콘 액션 버튼
 *
 * 테이블 행이나 카드에서 사용하는 작은 아이콘 버튼을 통일
 * - 크기: 28×28 (compact) / 32×32 (regular)
 * - border-radius: theme.shape.borderRadius
 * - hover 시 배경색 변경
 *
 * 사용 예시:
 * <AppIconActionButton
 *   icon={<EditIcon />}
 *   tooltip="수정"
 *   onClick={handleEdit}
 *   color="primary"
 * />
 */

'use client';

import { IconButton, Tooltip, type SxProps, type Theme } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

export interface AppIconActionButtonProps {
  /** 아이콘 */
  icon: React.ReactNode;
  /** 툴팁 텍스트 */
  tooltip: string;
  /** 클릭 핸들러 */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** 비활성화 */
  disabled?: boolean;
  /** 색상 (기본: 'default') */
  color?: 'default' | 'primary' | 'error' | 'warning' | 'success' | 'info';
  /** 크기 (기본: 'small') */
  size?: 'small' | 'medium';
  /** 추가 sx */
  sx?: SxProps<Theme>;
}

export default function AppIconActionButton({
  icon,
  tooltip,
  onClick,
  disabled = false,
  color = 'default',
  size = 'small',
  sx,
}: AppIconActionButtonProps) {
  const theme = useTheme();

  // 색상 결정
  const getColor = () => {
    if (color === 'default') return theme.palette.text.secondary;
    const paletteColor = theme.palette[color as keyof typeof theme.palette] as {
      main: string;
    };
    return paletteColor?.main ?? theme.palette.text.secondary;
  };

  const mainColor = getColor();
  const btnSize = size === 'small' ? 28 : 32;

  return (
    <Tooltip title={tooltip} arrow>
      <span>
        <IconButton
          size={size}
          onClick={onClick}
          disabled={disabled}
          sx={{
            width: btnSize,
            height: btnSize,
            color: mainColor,
            '&:hover': {
              bgcolor: alpha(mainColor, 0.1),
            },
            '& svg': {
              fontSize: size === 'small' ? 16 : 20,
            },
            ...sx,
          }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}
