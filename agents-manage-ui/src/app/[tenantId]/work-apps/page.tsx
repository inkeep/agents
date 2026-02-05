'use client';

import { use } from 'react';
import { WorkAppsOverview } from '@/features/work-apps/common';
import { SlackProvider } from '@/features/work-apps/slack';

function WorkAppsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);

  return (
    <SlackProvider tenantId={tenantId}>
      <WorkAppsOverview tenantId={tenantId} />
    </SlackProvider>
  );
}

export default WorkAppsPage;
