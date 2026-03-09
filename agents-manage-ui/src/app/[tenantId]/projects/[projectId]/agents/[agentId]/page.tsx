import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { getCapabilitiesAction } from '@/lib/actions/capabilities';
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

  const [tools, externalAgents, skills] = await Promise.all([
    fetchToolsAction(tenantId, projectId, { skipDiscovery: true }),
    fetchExternalAgentsAction(tenantId, projectId),
    fetchSkillsAction(tenantId, projectId),
  ]);

  if (!tools.success || !externalAgents.success || !skills.success) {
    console.error('Failed to fetch components:', tools.error, externalAgents.error, skills.error);
  }

  const toolLookup = createLookup(tools.success ? tools.data : undefined);

  const capabilities = await getCapabilitiesAction();
  const sandboxEnabled = capabilities.success
    ? Boolean(capabilities.data?.sandbox?.configured)
    : false;

  const skillsList = (skills.success && skills.data) || [];
  return (
    <Agent
      agent={agent.data}
      toolLookup={toolLookup}
      sandboxEnabled={sandboxEnabled}
      skills={skillsList}
    />
  );
};

export default AgentPage;
