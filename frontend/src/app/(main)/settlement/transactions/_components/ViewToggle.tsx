'use client';

import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import {
  ViewTimeline as TimelineIcon,
  TableChart as GridIcon,
} from '@mui/icons-material';
import { useCashEvent, type ViewMode } from './CashEventProvider';

export default function ViewToggle() {
  const { viewMode, setViewMode } = useCashEvent();

  return (
    <ToggleButtonGroup
      value={viewMode}
      exclusive
      onChange={(_, v: ViewMode | null) => v && setViewMode(v)}
      size="small"
    >
      <ToggleButton value="timeline" sx={{ px: 1.5, py: 0.5 }}>
        <Tooltip title="타임라인">
          <TimelineIcon fontSize="small" />
        </Tooltip>
      </ToggleButton>
      <ToggleButton value="grid" sx={{ px: 1.5, py: 0.5 }}>
        <Tooltip title="그리드">
          <GridIcon fontSize="small" />
        </Tooltip>
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
