import { notFound } from 'next/navigation';
import { BodyTemplate } from '@/components/layout/body-template';
import { PageHeader } from '@/components/layout/page-header';
import { TriggerForm } from '@/components/triggers/trigger-form';
import { getFullAgentAction } from '@/lib/actions/agent-full';

export default async function NewTriggerPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/agents/[agentId]/triggers/new'>) {
  const { tenantId, projectId, agentId } = await params;

  // Fetch agent to verify it exists
  const agent = await getFullAgentAction(tenantId, projectId, agentId);
  if (!agent.success) {
    notFound();
  }

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
        'New trigger',
      ]}
    >
      <PageHeader title="New trigger" description="Create a new webhook trigger for this agent." />
      <TriggerForm tenantId={tenantId} projectId={projectId} agentId={agentId} mode="create" />
    </BodyTemplate>
  );
}
