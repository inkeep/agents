import FullPageError from '@/components/errors/full-page-error';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { fetchCredentialsAction } from '@/lib/actions/credentials';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { fetchExternalAgentsAction } from '@/lib/actions/external-agents';
import { fetchToolsAction } from '@/lib/actions/tools';
import { createLookup } from '@/lib/utils';
import { Agent } from './page.client';
import { BodyTemplate } from '@/components/layout/body-template';
import { type FC, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { FullAgentDefinition } from '@/lib';

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

const agentSkeleton = (
  <div className="flex p-4">
    <div className="flex flex-col gap-2" style={{ width: 160 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} style={{ height: 38 }} />
      ))}
    </div>
    <div className="ml-auto flex gap-2 h-9">
      <Skeleton style={{ width: 84 }} />
      <Skeleton style={{ width: 100 }} />
      <Skeleton style={{ width: 127 }} />
      <Skeleton style={{ width: 168 }} />
    </div>
    <Skeleton className="h-36 rounded-lg w-64 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
  </div>
);

const AgentPage: FC<PageProps<'/[tenantId]/projects/[projectId]/agents/[agentId]'>> = async ({
  params,
}) => {
  const { agentId, tenantId, projectId } = await params;
  const agent = await getFullAgentAction(tenantId, projectId, agentId);

  const content = agent.success ? (
    <Suspense fallback={agentSkeleton}>
      <AgentData agent={agent.data} tenantId={tenantId} projectId={projectId} />
    </Suspense>
  ) : (
    <FullPageError
      errorCode={agent.code}
      context="agent"
      link={`/${tenantId}/projects/${projectId}/agents`}
      linkText="Back to agents"
    />
  );

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Agents', href: `/${tenantId}/projects/${projectId}/agents` },
        { label: agent.success ? agent.data.name : agentId },
      ]}
      className="p-0"
    >
      {content}
    </BodyTemplate>
  );
};

export default AgentPage;
