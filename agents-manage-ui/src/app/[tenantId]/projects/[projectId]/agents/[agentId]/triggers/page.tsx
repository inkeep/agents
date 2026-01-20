import { notFound } from 'next/navigation';
import { TriggersTable } from '@/components/triggers/triggers-table';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { getTriggersAction } from '@/lib/actions/triggers';

export default async function TriggersPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/agents/[agentId]/triggers'>) {
  const { tenantId, projectId, agentId } = await params;

  // Fetch agent to verify it exists
  const agent = await getFullAgentAction(tenantId, projectId, agentId);
  if (!agent.success) {
    notFound();
  }

  // Fetch triggers for this agent
  const triggers = await getTriggersAction(tenantId, projectId, agentId);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Triggers</h1>
        <p className="text-muted-foreground">
          Configure webhook triggers to invoke this agent from external services.
        </p>
      </div>

      <TriggersTable
        triggers={triggers}
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentId}
      />
    </div>
  );
}
