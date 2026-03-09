import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { getCapabilitiesAction } from '@/lib/actions/capabilities';
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

  const skills = await fetchSkillsAction(tenantId, projectId);

  if (!skills.success) {
    console.error('Failed to fetch skills:', skills.error);
  }

  const capabilities = await getCapabilitiesAction();
  const sandboxEnabled = capabilities.success
    ? Boolean(capabilities.data?.sandbox?.configured)
    : false;

  const skillsList = (skills.success && skills.data) || [];
  return <Agent agent={agent.data} sandboxEnabled={sandboxEnabled} skills={skillsList} />;
};

export default AgentPage;
