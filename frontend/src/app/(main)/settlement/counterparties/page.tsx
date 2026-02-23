'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Tabs, Tab } from '@mui/material';
import {
  Business as BusinessIcon,
  AccountBalance as BranchIcon,
} from '@mui/icons-material';
import { AppPageContainer } from '@/components/ui';
import CounterpartyTab from './_components/CounterpartyTab';
import BranchTab from './_components/BranchTab';

export default function CounterpartiesPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'branches' ? 1 : 0;
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <AppPageContainer>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, py: 1, textTransform: 'none', fontWeight: 600 },
          }}
        >
          <Tab icon={<BusinessIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="거래처" />
          <Tab icon={<BranchIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="지사 관리" />
        </Tabs>
      </Box>

      {activeTab === 0 && <CounterpartyTab />}
      {activeTab === 1 && <BranchTab />}
    </AppPageContainer>
  );
}
