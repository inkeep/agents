import type { Metadata } from 'next';
import { AppsTable } from '@/components/apps/apps-table';
import { NewAppDialog } from '@/components/apps/new-app-dialog';
import FullPageError from '@/components/errors/full-page-error';
import type { SelectOption } from '@/components/form/generic-select';
import { PageHeader } from '@/components/layout/page-header';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { fetchApps } from '@/lib/api/apps';
import { fetchCredentials } from '@/lib/api/credentials';
import { fetchEntitlements } from '@/lib/api/entitlements';
import { fetchProjectPermissions } from '@/lib/api/projects';
import type { Agent } from '@/lib/types/agent-full';
import { createLookup } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: STATIC_LABELS.apps,
  description:
    'Apps are external access credentials for your project. Configure web client widgets, API integrations, and more.',
} satisfies Metadata;

const createAgentOptions = (agents: Agent[]): SelectOption[] => {
  return agents.map((agent) => ({
    value: agent.id,
    label: agent.name,
  }));
};

async function AppsPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/apps'>) {
  const { tenantId, projectId } = await params;

  try {
    const [apps, agents, credentials, entitlements, { canUse }] = await Promise.all([
      fetchApps(tenantId, projectId),
      fetchAgents(tenantId, projectId),
      fetchCredentials(tenantId, projectId),
      fetchEntitlements(tenantId),
      fetchProjectPermissions(tenantId, projectId),
    ]);
    const agentLookup = createLookup(agents.data);
    const agentOptions = createAgentOptions(agents.data);
    const credentialOptions: SelectOption[] = credentials.map((c) => ({
      value: c.id,
      label: c.name || c.id,
    }));
    const hasSupportCopilotEntitlement = entitlements.some(
      (e) => e.resourceType === 'feature:support_copilot' && e.maxValue > 0
    );
    return (
      <>
        <PageHeader
          title={metadata.title}
          description={metadata.description}
          action={
            canUse ? (
              <NewAppDialog
                agentOptions={agentOptions}
                credentialOptions={credentialOptions}
                hasSupportCopilotEntitlement={hasSupportCopilotEntitlement}
              />
            ) : undefined
          }
        />
        <AppsTable
          apps={apps.data}
          agentLookup={agentLookup}
          agentOptions={agentOptions}
          credentialOptions={credentialOptions}
        />
      </>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="Apps" />;
  }
}

export default AppsPage;
