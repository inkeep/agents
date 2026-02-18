import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { TriggerForm } from '@/components/triggers/trigger-form';
import { Button } from '@/components/ui/button';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { getTrigger, type Trigger } from '@/lib/api/triggers';

export const metadata = {
  description: 'Update the webhook trigger configuration.',
} satisfies Metadata;

export default async function EditTriggerPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string; agentId: string; triggerId: string }>;
}) {
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
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/${tenantId}/projects/${projectId}/triggers?tab=webhooks`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back to triggers
          </Button>
        </Link>
      </div>
      <PageHeader
        title={`Edit ${trigger.name}`}
        description={`${metadata.description} (Agent: ${agent.data.name})`}
      />
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
