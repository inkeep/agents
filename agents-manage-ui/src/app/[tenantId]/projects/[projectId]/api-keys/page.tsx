import { ApiKeysTable } from '@/components/api-keys/api-keys-table';
import { NewApiKeyDialog } from '@/components/api-keys/new-api-key-dialog';
import type { SelectOption } from '@/components/form/generic-select';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { apiKeyDescription } from '@/constants/page-descriptions';
import { fetchApiKeys } from '@/lib/api/api-keys';
import { fetchGraphs } from '@/lib/api/agent-full-client';
import type { Agent } from '@/lib/types/agent-full';
import { createLookup } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const createGraphOptions = (agent: Agent[]): SelectOption[] => {
  return agent.map((agent) => ({
    value: agent.id,
    label: agent.name,
  }));
};

interface ApiKeysPageProps {
  params: Promise<{ tenantId: string; projectId: string }>;
}

async function ApiKeysPage({ params }: ApiKeysPageProps) {
  const { tenantId, projectId } = await params;
  const [apiKeys, agent] = await Promise.all([
    fetchApiKeys(tenantId, projectId),
    fetchGraphs(tenantId, projectId),
  ]);

  const graphLookup = createLookup(agent.data);
  const graphOptions = createGraphOptions(agent.data);
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
              graphsOptions={graphOptions}
            />
          }
        />
        <ApiKeysTable apiKeys={apiKeys.data} graphLookup={graphLookup} />
      </MainContent>
    </BodyTemplate>
  );
}

export default ApiKeysPage;
