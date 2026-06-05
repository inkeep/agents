import type { Metadata } from 'next';
import { ApiKeysTable } from '@/components/api-keys/api-keys-table';
import { NewApiKeyDialog } from '@/components/api-keys/new-api-key-dialog';
import FullPageError from '@/components/errors/full-page-error';
import type { SelectOption } from '@/components/form/generic-select';
import {
  PageHeaderContent,
  PageHeaderRoot,
  PageHeaderTitle,
} from '@/components/layout/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { fetchApiKeys } from '@/lib/api/api-keys';
import { fetchProjectPermissions } from '@/lib/api/projects';
import type { Agent } from '@/lib/types/agent-full';
import { createLookup } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: STATIC_LABELS['api-keys'],
  description:
    'Existing API keys will continue to work for server-to-server integrations. Use App Credentials for new app-based integrations.',
} satisfies Metadata;

const createAgentOptions = (agent: Agent[]): SelectOption[] => {
  return agent.map((agent) => ({
    value: agent.id,
    label: agent.name,
  }));
};

async function ApiKeysPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/api-keys'>) {
  const { tenantId, projectId } = await params;

  try {
    const [apiKeys, agent, { canUse }] = await Promise.all([
      fetchApiKeys(tenantId, projectId),
      fetchAgents(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);
    const agentLookup = createLookup(agent.data);
    const agentOptions = createAgentOptions(agent.data);
    return (
      <>
        <PageHeaderRoot>
          <PageHeaderContent>
            <PageHeaderTitle>API Keys</PageHeaderTitle>
          </PageHeaderContent>
          {canUse ? <NewApiKeyDialog agentsOptions={agentOptions} /> : undefined}
        </PageHeaderRoot>
        <Alert variant="warning" className="mb-6">
          <AlertTitle>App Credentials for app-based integrations</AlertTitle>
          <AlertDescription>
            <p>
              Existing API keys will continue to work for server-to-server integrations. Use{' '}
              <a href={`apps`} className="font-medium underline underline-offset-4">
                App Credentials
              </a>{' '}
              for new app-based integrations such as web clients, support copilots, and
              authenticated end-user experiences.
            </p>
          </AlertDescription>
        </Alert>
        <ApiKeysTable apiKeys={apiKeys.data} agentLookup={agentLookup} />
      </>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="API keys" />;
  }
}

export default ApiKeysPage;
