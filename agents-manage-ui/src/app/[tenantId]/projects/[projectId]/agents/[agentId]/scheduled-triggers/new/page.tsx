import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { ScheduledTriggerForm } from '@/components/scheduled-triggers/scheduled-trigger-form';
import { getFullAgentAction } from '@/lib/actions/agent-full';

export const metadata = {
  title: 'New scheduled trigger',
  description: 'Create a new scheduled trigger for this agent.',
} satisfies Metadata;

export default async function NewScheduledTriggerPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string; agentId: string }>;
}) {
  const { tenantId, projectId, agentId } = await params;

  // Fetch agent to verify it exists
  const agent = await getFullAgentAction(tenantId, projectId, agentId);
  if (!agent.success) {
    notFound();
  }

  return (
    <>
      <PageHeader title={metadata.title} description={metadata.description} />
      <ScheduledTriggerForm
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentId}
        mode="create"
      />
    </>
  );
}
