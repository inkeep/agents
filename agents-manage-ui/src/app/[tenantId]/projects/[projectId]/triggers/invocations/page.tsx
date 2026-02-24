import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { ProjectScheduledTriggerInvocationsTable } from '@/components/project-triggers/project-scheduled-trigger-invocations-table';
import { Button } from '@/components/ui/button';
import { getProjectScheduledTriggerInvocationsAction } from '@/lib/actions/project-triggers';

export const metadata = {
  title: 'All Scheduled Trigger Invocations',
  description: 'View all scheduled trigger invocations across all agents in this project.',
} satisfies Metadata;

export default async function ProjectScheduledTriggerInvocationsPage({
  params,
}: {
  params: Promise<{
    tenantId: string;
    projectId: string;
  }>;
}) {
  const { tenantId, projectId } = await params;

  const invocations = await getProjectScheduledTriggerInvocationsAction(tenantId, projectId, {
    limit: 100,
  });

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
      <PageHeader title={metadata.title} description={metadata.description} />
      <ProjectScheduledTriggerInvocationsTable
        invocations={invocations}
        tenantId={tenantId}
        projectId={projectId}
      />
    </div>
  );
}
