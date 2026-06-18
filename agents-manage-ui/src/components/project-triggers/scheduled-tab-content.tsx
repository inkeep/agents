import { fetchProjectScheduledTriggers } from '@/lib/api/project-triggers';
import { ScheduledTabPanel } from './scheduled-tab-panel';

export async function ScheduledTabContent({
  tenantId,
  projectId,
}: {
  tenantId: string;
  projectId: string;
}) {
  const { triggers, agents } = await fetchProjectScheduledTriggers(tenantId, projectId);

  return (
    <ScheduledTabPanel
      tenantId={tenantId}
      projectId={projectId}
      allTriggers={triggers}
      agents={agents}
    />
  );
}
