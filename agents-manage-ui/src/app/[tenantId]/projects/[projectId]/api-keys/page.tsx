import { AlertTriangle } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
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
    'API Keys are deprecated. Use App Credentials instead to authenticate against the Inkeep Agents API.',
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
        <PageHeaderRoot>
          <PageHeaderContent>
            <PageHeaderTitle>
              API Keys <Badge variant="warning">Deprecated</Badge>
            </PageHeaderTitle>
          </PageHeaderContent>
          {canUse ? <NewApiKeyDialog agentsOptions={agentOptions} /> : undefined}
        </PageHeaderRoot>
        <Alert variant="warning" className="mb-6">
          <AlertTriangle className="size-4" />
          <AlertTitle>API Keys are deprecated</AlertTitle>
          <AlertDescription>
            <p>
              Use{' '}
              <a href={`apps`} className="font-medium underline underline-offset-4">
                App Credentials
              </a>{' '}
              instead. Existing API keys will continue to work, but we recommend migrating to App
              Credentials for new integrations.
            </p>
          </AlertDescription>
        </Alert>
        <ApiKeysTable apiKeys={apiKeys.data} agentLookup={agentLookup} canUse={canUse} />
      </>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="API keys" />;
  }
}

export default ApiKeysPage;
