import type { FC } from 'react';
import { serializeAgentForm } from '@/components/agent/form/validation';
import FullPageError from '@/components/errors/full-page-error';
import { FullAgentFormProvider } from '@/contexts/full-agent-form';
import { getFullAgent } from '@/lib/api/agent-full-client';
import { Agent } from './page.client';

export const dynamic = 'force-dynamic';

const AgentPage: FC<PageProps<'/[tenantId]/projects/[projectId]/agents/[agentId]'>> = async ({
  params,
}) => {
  const { agentId, tenantId, projectId } = await params;
  try {
    const agent = await getFullAgent(tenantId, projectId, agentId);
    return (
      <FullAgentFormProvider defaultValues={serializeAgentForm(agent.data)}>
        <Agent agent={agent.data} />
      </FullAgentFormProvider>
    );
  } catch (error) {
    return (
      <FullPageError
        errorCode={(error as any).error.code ?? 'unknown_error'}
        context="agent"
        link={`/${tenantId}/projects/${projectId}/agents`}
        linkText="Back to agents"
      />
    );
  }
};

export default AgentPage;
