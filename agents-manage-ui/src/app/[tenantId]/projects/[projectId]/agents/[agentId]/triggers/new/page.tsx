import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { TriggerForm } from '@/components/triggers/trigger-form';
import { getFullAgentAction } from '@/lib/actions/agent-full';

export const metadata = {
  title: 'New trigger',
  description: 'Create a new webhook trigger for this agent.',
} satisfies Metadata;

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
    <div className="max-w-2xl mx-auto">
      <PageHeader title={metadata.title} description={metadata.description} />
      <TriggerForm tenantId={tenantId} projectId={projectId} agentId={agentId} mode="create" />
    </div>
  );
}
