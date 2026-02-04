import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { ScheduledTriggersTable } from '@/components/scheduled-triggers/scheduled-triggers-table';
import { UpcomingRunsDashboard } from '@/components/scheduled-triggers/upcoming-runs-dashboard';
import { Button } from '@/components/ui/button';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import {
  getScheduledTriggersAction,
  getUpcomingRunsAction,
} from '@/lib/actions/scheduled-triggers';

export const metadata = {
  title: 'Scheduled Triggers',
  description: 'Configure scheduled triggers to run this agent on a schedule.',
} satisfies Metadata;

export default async function ScheduledTriggersPage({
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

  // Fetch scheduled triggers and upcoming runs for this agent
  const [triggers, upcomingRuns] = await Promise.all([
    getScheduledTriggersAction(tenantId, projectId, agentId),
    getUpcomingRunsAction(tenantId, projectId, agentId, { includeRunning: true, limit: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        description={metadata.description}
        action={
          <Button asChild>
            <Link
              href={`/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers/new`}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create scheduled trigger
            </Link>
          </Button>
        }
      />

      {/* Upcoming Runs Dashboard */}
      <UpcomingRunsDashboard
        initialRuns={upcomingRuns}
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentId}
      />

      {/* Scheduled Triggers Table */}
      <ScheduledTriggersTable
        triggers={triggers}
        tenantId={tenantId}
        projectId={projectId}
        agentId={agentId}
      />
    </div>
  );
}
