import { notFound } from 'next/navigation';
import { BodyTemplate } from '@/components/layout/body-template';
import { PageHeader } from '@/components/layout/page-header';
import { TriggerForm } from '@/components/triggers/trigger-form';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { getTrigger, type Trigger } from '@/lib/api/triggers';

export default async function EditTriggerPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/agents/[agentId]/triggers/[triggerId]/edit'>) {
  const { tenantId, projectId, agentId, triggerId } = await params;

  // Fetch agent to verify it exists
  const agent = await getFullAgentAction(tenantId, projectId, agentId);
  if (!agent.success) {
    notFound();
  }

  // Fetch trigger to edit
  let trigger: Trigger;
  try {
    trigger = await getTrigger(tenantId, projectId, agentId, triggerId);
  } catch (error) {
    console.error('Failed to fetch trigger:', error);
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
        {
          label: trigger.name,
          href: `/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
        },
        'Edit',
      ]}
    >
      <PageHeader
        title={`Edit ${trigger.name}`}
        description="Update the webhook trigger configuration."
      />
      <TriggerForm
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentId}
        trigger={trigger}
        mode="edit"
      />
    </BodyTemplate>
  );
}
