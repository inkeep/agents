'use client';

import { use } from 'react';
import { WorkAppsOverview } from '@/features/work-apps/common';
import { SlackProvider } from '@/features/work-apps/slack';
import { useRequireAuth } from '@/hooks/use-require-auth';

function WorkAppsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  useRequireAuth();
  const { tenantId } = use(params);

  return (
    <SlackProvider tenantId={tenantId}>
      <WorkAppsOverview tenantId={tenantId} />
    </SlackProvider>
  );
}

export default WorkAppsPage;
