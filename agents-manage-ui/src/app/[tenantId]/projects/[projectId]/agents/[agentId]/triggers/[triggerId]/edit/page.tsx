import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { TriggerForm } from '@/components/triggers/trigger-form';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { getTrigger, type Trigger } from '@/lib/api/triggers';

export const metadata = {
  description: 'Update the webhook trigger configuration.',
} satisfies Metadata;

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
    <div className="max-w-2xl mx-auto">
      <PageHeader title={`Edit ${trigger.name}`} description={metadata.description} />
      <TriggerForm
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentId}
        trigger={trigger}
        mode="edit"
      />
    </div>
  );
}
