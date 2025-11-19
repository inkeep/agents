import { Agent } from '@/components/agent/agent';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { fetchCredentialsAction } from '@/lib/actions/credentials';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { fetchExternalAgentsAction } from '@/lib/actions/external-agents';
import { fetchToolsAction } from '@/lib/actions/tools';
import { fetchBranchesWithAgent } from '@/lib/api/branches';
import { createLookup } from '@/lib/utils';
import { getValidSearchParamsAsync } from '@/lib/utils/search-params';
export const dynamic = 'force-dynamic';

async function AgentPage({
  params,
  searchParams,
}: PageProps<'/[tenantId]/projects/[projectId]/agents/[agentId]'>) {
  const { agentId, tenantId, projectId } = await params;
  const { ref } = await getValidSearchParamsAsync(searchParams);
  const currentBranch = ref || 'main';

  const [agent, dataComponents, artifactComponents, credentials, tools, externalAgents, branches] =
    await Promise.all([
      getFullAgentAction(tenantId, projectId, agentId, ref),
      fetchDataComponentsAction(tenantId, projectId, ref),
      fetchArtifactComponentsAction(tenantId, projectId, ref),
      fetchCredentialsAction(tenantId, projectId, ref),
      fetchToolsAction(tenantId, projectId, ref),
      fetchExternalAgentsAction(tenantId, projectId, ref),
      fetchBranchesWithAgent(tenantId, projectId, agentId),
    ]);

  if (!agent.success) {
    return (
      <FullPageError
        error={new Error(agent.error)}
        context="agent"
        link={`/${tenantId}/projects/${projectId}/agents`}
        linkText="Back to agents"
      />
    );
  }
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
  const externalAgentLookup = createLookup(
    externalAgents.success ? externalAgents.data : undefined
  );

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Agents', href: `/${tenantId}/projects/${projectId}/agents` },
        { label: agent.data.name },
      ]}
    >
      <Agent
        agent={agent?.data}
        dataComponentLookup={dataComponentLookup}
        artifactComponentLookup={artifactComponentLookup}
        toolLookup={toolLookup}
        credentialLookup={credentialLookup}
        externalAgentLookup={externalAgentLookup}
        availableBranches={branches.data}
        currentBranch={currentBranch}
      />
    </BodyTemplate>
  );
}

export default AgentPage;
