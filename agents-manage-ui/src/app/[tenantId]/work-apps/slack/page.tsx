'use client';

import { use } from 'react';
import { SlackDashboard, SlackProvider } from '@/features/work-apps/slack';

function SlackWorkAppPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);

  return (
    <SlackProvider tenantId={tenantId}>
      <SlackDashboard />
    </SlackProvider>
  );
}

export default SlackWorkAppPage;
