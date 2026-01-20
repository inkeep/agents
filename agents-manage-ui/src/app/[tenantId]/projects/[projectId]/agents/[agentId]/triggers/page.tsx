import { notFound } from 'next/navigation';
import { TriggersTable } from '@/components/triggers/triggers-table';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { getTriggersAction } from '@/lib/actions/triggers';
import { STATIC_LABELS } from '@/constants/theme';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div className="space-y-6">
      <PageHeader
        title={STATIC_LABELS.triggers}
        description="Configure webhook triggers to invoke this agent from external services."
        action={
          <Button asChild>
            <Link href={`/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/new`}>
              <Plus className="w-4 h-4 mr-2" />
              Create trigger
            </Link>
          </Button>
        }
      />

      <TriggersTable
        triggers={triggers}
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentId}
      />
    </div>
  );
}
