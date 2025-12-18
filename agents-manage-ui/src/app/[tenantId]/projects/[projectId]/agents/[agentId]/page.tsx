import { type FC, Suspense } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import type { FullAgentDefinition } from '@/lib';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { fetchCredentialsAction } from '@/lib/actions/credentials';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { fetchExternalAgentsAction } from '@/lib/actions/external-agents';
import { fetchToolsAction } from '@/lib/actions/tools';
import { createLookup } from '@/lib/utils';
import { AgentSkeleton } from './loading';
import { Agent } from './page.client';

export const dynamic = 'force-dynamic';

const AgentData: FC<{
  agent: FullAgentDefinition;
  tenantId: string;
  projectId: string;
}> = async ({ agent, tenantId, projectId }) => {
  const [dataComponents, artifactComponents, credentials, tools, externalAgents] =
    await Promise.all([
      fetchDataComponentsAction(tenantId, projectId),
      fetchArtifactComponentsAction(tenantId, projectId),
      fetchCredentialsAction(tenantId, projectId),
      fetchToolsAction(tenantId, projectId),
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

  return (
    <Agent
      agent={agent}
      dataComponentLookup={dataComponentLookup}
      artifactComponentLookup={artifactComponentLookup}
      toolLookup={toolLookup}
      credentialLookup={credentialLookup}
    />
  );
};

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

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Agents', href: `/${tenantId}/projects/${projectId}/agents` },
        agent.data.name,
      ]}
      className="p-0"
    >
      <Suspense fallback={<AgentSkeleton />}>
        <AgentData agent={agent.data} tenantId={tenantId} projectId={projectId} />
      </Suspense>
    </BodyTemplate>
  );
};

export default AgentPage;
