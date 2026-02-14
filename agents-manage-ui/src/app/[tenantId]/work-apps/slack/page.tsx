'use client';

import { use } from 'react';
import { SlackDashboard, SlackProvider } from '@/features/work-apps/slack';
import { useRequireAuth } from '@/hooks/use-require-auth';

function SlackWorkAppPage({ params }: { params: Promise<{ tenantId: string }> }) {
  useRequireAuth();
  const { tenantId } = use(params);

  return (
    <SlackProvider tenantId={tenantId}>
      <SlackDashboard />
    </SlackProvider>
  );
}

export default SlackWorkAppPage;
