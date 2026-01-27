'use client';

import { use } from 'react';
import { SlackProvider } from '@/features/slack';
import { WorkAppsOverview } from '@/features/work-apps';

function WorkAppsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);

  return (
    <SlackProvider tenantId={tenantId}>
      <WorkAppsOverview tenantId={tenantId} />
    </SlackProvider>
  );
}

export default WorkAppsPage;
