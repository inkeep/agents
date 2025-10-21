import { ApiKeysTable } from '@/components/api-keys/api-keys-table';
import { NewApiKeyDialog } from '@/components/api-keys/new-api-key-dialog';
import FullPageError from '@/components/errors/full-page-error';
import type { SelectOption } from '@/components/form/generic-select';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { apiKeyDescription } from '@/constants/page-descriptions';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { fetchApiKeys } from '@/lib/api/api-keys';
import type { Agent } from '@/lib/types/agent-full';
import { createLookup } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const createAgentOptions = (agent: Agent[]): SelectOption[] => {
  return agent.map((agent) => ({
    value: agent.id,
    label: agent.name,
  }));
};

async function ApiKeysPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/api-keys'>) {
  const { tenantId, projectId } = await params;

  let apiKeys: Awaited<ReturnType<typeof fetchApiKeys>>;
  let agent: Awaited<ReturnType<typeof fetchAgents>>;

  try {
    [apiKeys, agent] = await Promise.all([
      fetchApiKeys(tenantId, projectId),
      fetchAgents(tenantId, projectId),
    ]);
  } catch (error) {
    return <FullPageError error={error as Error} context="API keys" />;
  }

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
      <MainContent className="min-h-full">
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
      </MainContent>
    </BodyTemplate>
  );
}

export default ApiKeysPage;
