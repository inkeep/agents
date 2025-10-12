import { Agent } from '@/components/agent/agent';
import { BodyTemplate } from '@/components/layout/body-template';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { fetchCredentialsAction } from '@/lib/actions/credentials';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchToolsAction } from '@/lib/actions/tools';
import { createLookup } from '@/lib/utils';
export const dynamic = 'force-dynamic';

interface AgentPageProps {
  params: Promise<{ agentId: string; tenantId: string; projectId: string }>;
}

async function AgentPage({ params }: AgentPageProps) {
  const { agentId, tenantId, projectId } = await params;

  const [agent, dataComponents, artifactComponents, credentials, tools] = await Promise.all([
    getFullAgentAction(tenantId, projectId, agentId),
    fetchDataComponentsAction(tenantId, projectId),
    fetchArtifactComponentsAction(tenantId, projectId),
    fetchCredentialsAction(tenantId, projectId),
    fetchToolsAction(tenantId, projectId),
  ]);

  if (!agent.success) throw new Error(agent.error);
  if (
    !dataComponents.success ||
    !artifactComponents.success ||
    !credentials.success ||
    !tools.success
  ) {
    console.error(
      'Failed to fetch components:',
      dataComponents.error,
      artifactComponents.error,
      credentials.error,
      tools.error
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
    <BodyTemplate
      breadcrumbs={[
        { label: 'Agent', href: `/${tenantId}/projects/${projectId}/agents` },
        { label: agent.data.name },
      ]}
    >
      <Agent
        agent={agent?.data}
        dataComponentLookup={dataComponentLookup}
        artifactComponentLookup={artifactComponentLookup}
        toolLookup={toolLookup}
        credentialLookup={credentialLookup}
      />
    </BodyTemplate>
  );
}

export default AgentPage;
