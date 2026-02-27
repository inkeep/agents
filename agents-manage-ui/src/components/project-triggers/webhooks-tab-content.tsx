import { fetchProjectTriggers } from '@/lib/api/project-triggers';
import { WebhooksTabPanel } from './webhooks-tab-panel';

export async function WebhooksTabContent({
  tenantId,
  projectId,
}: {
  tenantId: string;
  projectId: string;
}) {
  const { triggers, agents } = await fetchProjectTriggers(tenantId, projectId);

  return (
    <WebhooksTabPanel
      tenantId={tenantId}
      projectId={projectId}
      triggers={triggers}
      agents={agents}
    />
  );
}
