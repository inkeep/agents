import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { TriggersTable } from '@/components/triggers/triggers-table';
import { Button } from '@/components/ui/button';
import { STATIC_LABELS } from '@/constants/theme';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { getTriggersAction } from '@/lib/actions/triggers';

export const metadata = {
  title: STATIC_LABELS.triggers,
  description: 'Configure webhook triggers to invoke this agent from external services.',
} satisfies Metadata;

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
        title={metadata.title}
        description={metadata.description}
        action={
          <Button asChild>
            <Link href={`/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/new`}>
              <Plus className="w-4 h-4" />
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
