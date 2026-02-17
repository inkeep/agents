import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { getCapabilitiesAction } from '@/lib/actions/capabilities';
import { fetchCredentialsAction } from '@/lib/actions/credentials';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { fetchExternalAgentsAction } from '@/lib/actions/external-agents';
import { fetchSkillsAction } from '@/lib/actions/skills';
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

  const [dataComponents, artifactComponents, credentials, tools, externalAgents, skills] =
    await Promise.all([
      fetchDataComponentsAction(tenantId, projectId),
      fetchArtifactComponentsAction(tenantId, projectId),
      fetchCredentialsAction(tenantId, projectId),
      fetchToolsAction(tenantId, projectId, { skipDiscovery: true }),
      fetchExternalAgentsAction(tenantId, projectId),
      fetchSkillsAction(tenantId, projectId),
    ]);

  if (
    !dataComponents.success ||
    !artifactComponents.success ||
    !credentials.success ||
    !tools.success ||
    !externalAgents.success ||
    !skills.success
  ) {
    console.error(
      'Failed to fetch components:',
      dataComponents.error,
      artifactComponents.error,
      credentials.error,
      tools.error,
      externalAgents.error,
      skills.error
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

  const skillsList = (skills.success && skills.data) || [];
  return (
    <Agent
      agent={agent.data}
      dataComponentLookup={dataComponentLookup}
      artifactComponentLookup={artifactComponentLookup}
      toolLookup={toolLookup}
      credentialLookup={credentialLookup}
      sandboxEnabled={sandboxEnabled}
      skills={skillsList}
    />
  );
};

export default AgentPage;
