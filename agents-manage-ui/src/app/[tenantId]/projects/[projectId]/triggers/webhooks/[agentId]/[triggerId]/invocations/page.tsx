import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { InvocationsTable } from '@/components/triggers/invocations-table';
import { Button } from '@/components/ui/button';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchTriggerInvocations, getTrigger, type Trigger } from '@/lib/api/triggers';

export const metadata = {
  description: 'View the history of webhook invocations for this trigger.',
} satisfies Metadata;

export default async function InvocationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; projectId: string; agentId: string; triggerId: string }>;
  searchParams: Promise<{ status?: 'pending' | 'success' | 'failed'; page?: string }>;
}) {
  const { tenantId, projectId, agentId, triggerId } = await params;
  const { status, page } = await searchParams;

  // Fetch agent to verify it exists
  const agent = await getFullAgentAction(tenantId, projectId, agentId);
  if (!agent.success) {
    notFound();
  }

  // Fetch trigger
  let trigger: Trigger;
  try {
    trigger = await getTrigger(tenantId, projectId, agentId, triggerId);
  } catch (error) {
    console.error('Failed to fetch trigger:', error);
    notFound();
  }

  // Fetch invocations
  const invocationsResponse = await fetchTriggerInvocations(
    tenantId,
    projectId,
    agentId,
    triggerId,
    {
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: 50,
    }
  );

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/${tenantId}/projects/${projectId}/triggers?tab=webhooks`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back to triggers
          </Button>
        </Link>
      </div>
      <PageHeader
        title={`Invocations for ${trigger.name}`}
        description={`${metadata.description} (Agent: ${agent.data.name})`}
      />
      <InvocationsTable
        invocations={invocationsResponse.data}
        metadata={{
          total: invocationsResponse.pagination.total,
          page: invocationsResponse.pagination.page,
          limit: invocationsResponse.pagination.pageSize,
          pages: invocationsResponse.pagination.totalPages,
        }}
        tenantId={tenantId}
        projectId={projectId}
        currentStatus={status}
      />
    </>
  );
}
