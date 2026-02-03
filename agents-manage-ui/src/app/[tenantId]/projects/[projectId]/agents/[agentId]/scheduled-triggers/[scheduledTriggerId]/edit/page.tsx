import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { ScheduledTriggerForm } from '@/components/scheduled-triggers/scheduled-trigger-form';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { getScheduledTrigger } from '@/lib/api/scheduled-triggers';

export const metadata = {
  title: 'Edit scheduled trigger',
  description: 'Edit the configuration for this scheduled trigger.',
} satisfies Metadata;

export default async function EditScheduledTriggerPage({
  params,
}: {
  params: Promise<{
    tenantId: string;
    projectId: string;
    agentId: string;
    scheduledTriggerId: string;
  }>;
}) {
  const { tenantId, projectId, agentId, scheduledTriggerId } = await params;

  // Fetch agent to verify it exists
  const agent = await getFullAgentAction(tenantId, projectId, agentId);
  if (!agent.success) {
    notFound();
  }

  // Fetch the scheduled trigger
  const trigger = await getScheduledTrigger(tenantId, projectId, agentId, scheduledTriggerId).catch(
    () => {
      notFound();
    }
  );

  if (!trigger) {
    notFound();
  }

  return (
    <>
      <PageHeader title={metadata.title} description={metadata.description} />
      <ScheduledTriggerForm
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentId}
        trigger={trigger}
        mode="edit"
      />
    </>
  );
}
