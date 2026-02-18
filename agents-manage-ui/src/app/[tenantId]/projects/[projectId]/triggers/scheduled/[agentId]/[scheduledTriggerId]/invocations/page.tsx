import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { ScheduledTriggerInvocationsTable } from '@/components/scheduled-triggers/scheduled-trigger-invocations-table';
import { Button } from '@/components/ui/button';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { getScheduledTriggerInvocationsAction } from '@/lib/actions/scheduled-triggers';
import { getScheduledTrigger } from '@/lib/api/scheduled-triggers';

export const metadata = {
  title: 'Scheduled Trigger Invocations',
  description: 'View the execution history for this scheduled trigger.',
} satisfies Metadata;

export default async function ScheduledTriggerInvocationsPage({
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

  // Fetch invocations
  const invocations = await getScheduledTriggerInvocationsAction(
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    { limit: 50 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${tenantId}/projects/${projectId}/triggers?tab=scheduled`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back to triggers
          </Button>
        </Link>
      </div>
      <PageHeader
        title={`Invocations: ${trigger.name}`}
        description={`${metadata.description} (Agent: ${agent.data.name})`}
      />
      <ScheduledTriggerInvocationsTable
        invocations={invocations}
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentId}
        scheduledTriggerId={scheduledTriggerId}
      />
    </div>
  );
}
