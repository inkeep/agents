import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { InvocationsTable } from '@/components/triggers/invocations-table';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchTriggerInvocations, getTrigger, type Trigger } from '@/lib/api/triggers';

export const metadata = {
  description: 'View the history of webhook invocations for this trigger.',
} satisfies Metadata;

export default async function InvocationsPage({
  params,
  searchParams,
}: PageProps<'/[tenantId]/projects/[projectId]/agents/[agentId]/triggers/[triggerId]/invocations'>) {
  const { tenantId, projectId, agentId, triggerId } = await params;
  const {
    status,
    page,
  }: {
    status?: 'pending' | 'success' | 'failed';
    page?: string;
  } = await searchParams;

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
      <PageHeader title={`Invocations for ${trigger.name}`} description={metadata.description} />
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
