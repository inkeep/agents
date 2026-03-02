import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { ScheduledTriggerForm } from '@/components/scheduled-triggers/scheduled-trigger-form';
import { Button } from '@/components/ui/button';
import { getFullAgentAction } from '@/lib/actions/agent-full';

export const metadata = {
  title: 'New scheduled trigger',
  description: 'Create a new scheduled trigger for this agent.',
} satisfies Metadata;

export default async function NewScheduledTriggerPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; projectId: string; agentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantId, projectId, agentId } = await params;
  const rawSearchParams = await searchParams;
  const defaultsFromParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (typeof value === 'string') {
      defaultsFromParams[key] = value;
    }
  }

  // Fetch agent to verify it exists
  const agent = await getFullAgentAction(tenantId, projectId, agentId);
  if (!agent.success) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/${tenantId}/projects/${projectId}/triggers?tab=scheduled`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back to triggers
          </Button>
        </Link>
      </div>
      <PageHeader
        title={metadata.title}
        description={`${metadata.description} (Agent: ${agent.data.name})`}
      />
      <ScheduledTriggerForm
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentId}
        mode="create"
        defaultsFromParams={
          Object.keys(defaultsFromParams).length > 0 ? defaultsFromParams : undefined
        }
      />
    </div>
  );
}
