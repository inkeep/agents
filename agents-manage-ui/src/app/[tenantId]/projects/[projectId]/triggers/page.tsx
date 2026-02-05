import type { Metadata } from 'next';
import FullPageError from '@/components/errors/full-page-error';
import { PageHeader } from '@/components/layout/page-header';
import { TriggersTabs } from '@/components/project-triggers';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { fetchProjectScheduledTriggers, fetchProjectTriggers } from '@/lib/api/project-triggers';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: STATIC_LABELS.triggers,
  description: 'Configure webhook and scheduled triggers to invoke your agents.',
} satisfies Metadata;

async function TriggersPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/triggers'>) {
  const { tenantId, projectId } = await params;

  try {
    const [agents, webhookTriggers, scheduledTriggers] = await Promise.all([
      fetchAgents(tenantId, projectId),
      fetchProjectTriggers(tenantId, projectId),
      fetchProjectScheduledTriggers(tenantId, projectId),
    ]);

    return (
      <>
        <PageHeader title={metadata.title} description={metadata.description} />
        <TriggersTabs
          tenantId={tenantId}
          projectId={projectId}
          webhookTriggers={webhookTriggers}
          scheduledTriggers={scheduledTriggers}
          agents={agents.data.map((a) => ({ id: a.id, name: a.name }))}
        />
      </>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="triggers" />;
  }
}

export default TriggersPage;
