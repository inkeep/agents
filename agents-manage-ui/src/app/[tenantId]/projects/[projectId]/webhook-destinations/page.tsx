import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WebhookAgentFilter } from '@/components/webhook-destinations/webhook-agent-filter';
import { WebhookDestinationsTable } from '@/components/webhook-destinations/webhook-destinations-table';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { fetchProjectWebhookDestinations } from '@/lib/api/project-webhook-destinations';

export const metadata = {
  title: 'Outbound Webhooks',
  description: 'Configure outbound webhooks to receive events from your agents.',
} satisfies Metadata;

async function WebhookDestinationsContent({
  tenantId,
  projectId,
  agentId,
}: {
  tenantId: string;
  projectId: string;
  agentId?: string;
}) {
  const [destinations, { data: agents }] = await Promise.all([
    fetchProjectWebhookDestinations(tenantId, projectId, agentId),
    fetchAgents(tenantId, projectId),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <WebhookAgentFilter
          agents={agents.map((a) => ({ id: a.id, name: a.name }))}
          selectedAgentId={agentId}
          tenantId={tenantId}
          projectId={projectId}
        />
        <Button asChild>
          <Link href={`/${tenantId}/projects/${projectId}/webhook-destinations/new`}>
            New Webhook
          </Link>
        </Button>
      </div>
      <WebhookDestinationsTable
        destinations={destinations}
        tenantId={tenantId}
        projectId={projectId}
      />
    </div>
  );
}

async function WebhookDestinationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{ agentId?: string }>;
}) {
  const { tenantId, projectId } = await params;
  const { agentId } = await searchParams;
  return (
    <>
      <PageHeader title={metadata.title} description={metadata.description} />
      <Suspense
        fallback={
          <div className="space-y-4 mt-2">
            <Skeleton className="h-9 w-[200px]" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        }
      >
        <WebhookDestinationsContent tenantId={tenantId} projectId={projectId} agentId={agentId} />
      </Suspense>
    </>
  );
}

export default WebhookDestinationsPage;
