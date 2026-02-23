import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { ScheduledTabContent } from '@/components/project-triggers/scheduled-tab-content';
import { TriggersTabs } from '@/components/project-triggers/triggers-tabs';
import { WebhooksTabContent } from '@/components/project-triggers/webhooks-tab-content';
import { Skeleton } from '@/components/ui/skeleton';
import { STATIC_LABELS } from '@/constants/theme';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: STATIC_LABELS.triggers,
  description: 'Configure webhook and scheduled triggers to invoke your agents.',
} satisfies Metadata;

function TabSkeleton() {
  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-[200px]" />
        <Skeleton className="h-9 w-[180px]" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

async function TriggersPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/triggers'>) {
  const { tenantId, projectId } = await params;

  return (
    <>
      <PageHeader title={metadata.title} description={metadata.description} />
      <TriggersTabs
        scheduledContent={
          <Suspense fallback={<TabSkeleton />}>
            <ScheduledTabContent tenantId={tenantId} projectId={projectId} />
          </Suspense>
        }
        webhooksContent={
          <Suspense fallback={<TabSkeleton />}>
            <WebhooksTabContent tenantId={tenantId} projectId={projectId} />
          </Suspense>
        }
      />
    </>
  );
}

export default TriggersPage;
