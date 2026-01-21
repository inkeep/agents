import { ApiKeysTable } from '@/components/api-keys/api-keys-table';
import { NewApiKeyDialog } from '@/components/api-keys/new-api-key-dialog';
import FullPageError from '@/components/errors/full-page-error';
import type { SelectOption } from '@/components/form/generic-select';
import { PageHeader } from '@/components/layout/page-header';
import { apiKeyDescription } from '@/constants/page-descriptions';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { fetchApiKeys } from '@/lib/api/api-keys';
import { fetchProjectPermissions } from '@/lib/api/projects';
import type { Agent } from '@/lib/types/agent-full';
import { createLookup } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

const createAgentOptions = (agent: Agent[]): SelectOption[] => {
  return agent.map((agent) => ({
    value: agent.id,
    label: agent.name,
  }));
};

async function ApiKeysPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/api-keys'>) {
  const { tenantId, projectId } = await params;

  try {
    const [apiKeys, agent, permissions] = await Promise.all([
      fetchApiKeys(tenantId, projectId),
      fetchAgents(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);
    const agentLookup = createLookup(agent.data);
    const agentOptions = createAgentOptions(agent.data);
    const canUse = permissions.canUse;
    return (
      <>
        <PageHeader
          title={STATIC_LABELS['api-keys']}
          description={apiKeyDescription}
          action={
            canUse ? (
              <NewApiKeyDialog
                tenantId={tenantId}
                projectId={projectId}
                agentsOptions={agentOptions}
              />
            ) : undefined
          }
        />
        <ApiKeysTable apiKeys={apiKeys.data} agentLookup={agentLookup} />
      </>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="API keys" />;
  }
}

export default ApiKeysPage;
