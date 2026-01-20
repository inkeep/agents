import { notFound } from 'next/navigation';
import { BodyTemplate } from '@/components/layout/body-template';
import { PageHeader } from '@/components/layout/page-header';
import { InvocationsTable } from '@/components/triggers/invocations-table';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchTriggerInvocations, getTrigger, type Trigger } from '@/lib/api/triggers';

interface InvocationsPageProps {
  params: Promise<{
    tenantId: string;
    projectId: string;
    agentId: string;
    triggerId: string;
  }>;
  searchParams: Promise<{
    status?: 'pending' | 'success' | 'failed';
    page?: string;
  }>;
}

export default async function InvocationsPage({ params, searchParams }: InvocationsPageProps) {
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
    <BodyTemplate
      breadcrumbs={[
        {
          label: agent.data?.name || 'Agent',
          href: `/${tenantId}/projects/${projectId}/agents/${agentId}`,
        },
        {
          label: 'Triggers',
          href: `/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
        },
        {
          label: trigger.name,
          href: `/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
        },
        'Invocations',
      ]}
    >
      <PageHeader
        title={`Invocations for ${trigger.name}`}
        description="View the history of webhook invocations for this trigger."
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
    </BodyTemplate>
  );
}
