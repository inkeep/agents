import { ApiKeysTable } from '@/components/api-keys/api-keys-table';
import { NewApiKeyDialog } from '@/components/api-keys/new-api-key-dialog';
import FullPageError from '@/components/errors/full-page-error';
import type { SelectOption } from '@/components/form/generic-select';
import { BodyTemplate } from '@/components/layout/body-template';
import { PageHeader } from '@/components/layout/page-header';
import { apiKeyDescription } from '@/constants/page-descriptions';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { fetchApiKeys } from '@/lib/api/api-keys';
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
    const [apiKeys, agent] = await Promise.all([
      fetchApiKeys(tenantId, projectId),
      fetchAgents(tenantId, projectId),
    ]);
    const agentLookup = createLookup(agent.data);
    const agentOptions = createAgentOptions(agent.data);
    return (
      <BodyTemplate
        breadcrumbs={[
          {
            label: 'API keys',
            href: `/${tenantId}/projects/${projectId}/api-keys`,
          },
        ]}
      >
        <PageHeader
          title="API keys"
          description={apiKeyDescription}
          action={
            <NewApiKeyDialog
              tenantId={tenantId}
              projectId={projectId}
              agentsOptions={agentOptions}
            />
          }
        />
        <ApiKeysTable apiKeys={apiKeys.data} agentLookup={agentLookup} />
      </BodyTemplate>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="API keys" />;
  }
}

export default ApiKeysPage;
