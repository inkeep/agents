import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { ScheduledTriggerInvocationsTable } from '@/components/scheduled-triggers/scheduled-trigger-invocations-table';
import { Button } from '@/components/ui/button';
import { getScheduledTriggerInvocationsAction } from '@/lib/actions/scheduled-triggers';
import { getDatasetRunConfig, getDatasetRunConfigSchedule } from '@/lib/api/dataset-run-configs';

export const metadata = {
  title: 'Scheduled Run Invocations',
  description: 'View the execution history for this scheduled dataset run.',
} satisfies Metadata;

export default async function ScheduledDatasetRunInvocationsPage({
  params,
}: {
  params: Promise<{
    tenantId: string;
    projectId: string;
    datasetId: string;
    configId: string;
  }>;
}) {
  const { tenantId, projectId, datasetId, configId } = await params;

  const [schedule, config] = await Promise.all([
    getDatasetRunConfigSchedule(tenantId, projectId, configId),
    getDatasetRunConfig(tenantId, projectId, configId).catch(() => null),
  ]);

  if (!schedule) {
    notFound();
  }

  const agentIds = config?.agentIds ?? [];
  const configName = config?.name ?? configId;

  const allInvocations = await Promise.all(
    agentIds.map(async (agentId) => {
      const inv = await getScheduledTriggerInvocationsAction(
        tenantId,
        projectId,
        agentId,
        schedule.id,
        { limit: 50 }
      );
      return Array.isArray(inv) ? inv : [];
    })
  );

  const invocations = allInvocations
    .flat()
    .sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${tenantId}/projects/${projectId}/datasets/${datasetId}?tab=scheduled`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back to scheduled runs
          </Button>
        </Link>
      </div>
      <PageHeader
        title={`Invocations: ${configName}`}
        description={`${metadata.description} (${agentIds.length} agents)`}
      />
      <ScheduledTriggerInvocationsTable
        initialInvocations={invocations}
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentIds[0] ?? ''}
        scheduledTriggerId={schedule.id}
        triggers={agentIds.map((agentId) => ({
          agentId,
          scheduledTriggerId: schedule.id,
        }))}
        datasetId={datasetId}
      />
    </div>
  );
}
