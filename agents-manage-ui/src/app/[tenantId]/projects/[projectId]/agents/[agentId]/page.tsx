import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { FullAgentFormProvider } from '@/contexts/full-agent-form';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { getCapabilitiesAction } from '@/lib/actions/capabilities';
import { fetchCredentialsAction } from '@/lib/actions/credentials';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { fetchExternalAgentsAction } from '@/lib/actions/external-agents';
import { fetchToolsAction } from '@/lib/actions/tools';
import { createLookup } from '@/lib/utils';
import { Agent } from './page.client';

export const dynamic = 'force-dynamic';

const AgentPage: FC<PageProps<'/[tenantId]/projects/[projectId]/agents/[agentId]'>> = async ({
  params,
}) => {
  const { agentId, tenantId, projectId } = await params;
  const agent = await getFullAgentAction(tenantId, projectId, agentId);

  if (!agent.success) {
    return (
      <FullPageError
        errorCode={agent.code}
        context="agent"
        link={`/${tenantId}/projects/${projectId}/agents`}
        linkText="Back to agents"
      />
    );
  }

  const [dataComponents, artifactComponents, credentials, tools, externalAgents] =
    await Promise.all([
      fetchDataComponentsAction(tenantId, projectId),
      fetchArtifactComponentsAction(tenantId, projectId),
      fetchCredentialsAction(tenantId, projectId),
      fetchToolsAction(tenantId, projectId, { skipDiscovery: true }),
      fetchExternalAgentsAction(tenantId, projectId),
    ]);

  if (
    !dataComponents.success ||
    !artifactComponents.success ||
    !credentials.success ||
    !tools.success ||
    !externalAgents.success
  ) {
    console.error(
      'Failed to fetch components:',
      dataComponents.error,
      artifactComponents.error,
      credentials.error,
      tools.error,
      externalAgents.error
    );
  }

  const dataComponentLookup = createLookup(
    dataComponents.success ? dataComponents.data : undefined
  );

  const artifactComponentLookup = createLookup(
    artifactComponents.success ? artifactComponents.data : undefined
  );

  const toolLookup = createLookup(tools.success ? tools.data : undefined);
  const credentialLookup = createLookup(credentials.success ? credentials.data : undefined);

  const capabilities = await getCapabilitiesAction();
  const sandboxEnabled = capabilities.success
    ? Boolean(capabilities.data?.sandbox?.configured)
    : false;

  const {
    id,
    name,
    description,
    prompt,
    contextConfig,
    statusUpdates,
    stopWhen,
    models = {},
  } = agent.data;

  const defaultValues = {
    id,
    name,
    description,
    prompt,
    contextConfig: {
      id: contextConfig.id,
      headersSchema: jsonToString(contextConfig.headersSchema),
      contextVariables: jsonToString(contextConfig.contextVariables),
    },
    statusUpdates: {
      ...statusUpdates,
      statusComponents: jsonToString(statusUpdates.statusComponents),
    },
    stopWhen,
    models: {
      base: {
        ...models.base,
        providerOptions: jsonToString(models.base?.providerOptions),
      },
      structuredOutput: {
        ...models.structuredOutput,
        providerOptions: jsonToString(models.structuredOutput?.providerOptions),
      },
      summarizer: {
        ...models.summarizer,
        providerOptions: jsonToString(models.summarizer?.providerOptions),
      },
    },
  };

  return (
    <FullAgentFormProvider defaultValues={defaultValues}>
      <Agent
        agent={agent.data}
        dataComponentLookup={dataComponentLookup}
        artifactComponentLookup={artifactComponentLookup}
        toolLookup={toolLookup}
        credentialLookup={credentialLookup}
        sandboxEnabled={sandboxEnabled}
      />
    </FullAgentFormProvider>
  );
};

function jsonToString(value?: null | Record<string, unknown> | unknown[]): string {
  try {
    if (value) {
      return JSON.stringify(value, null, 2);
    }
  } catch {}
  return '';
}

export default AgentPage;
