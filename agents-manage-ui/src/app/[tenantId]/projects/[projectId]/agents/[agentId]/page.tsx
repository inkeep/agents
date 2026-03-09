import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { getCapabilitiesAction } from '@/lib/actions/capabilities';
import { Agent } from './page.client';
import { getFullAgent } from '@/lib/api/agent-full-client';

export const dynamic = 'force-dynamic';

const AgentPage: FC<PageProps<'/[tenantId]/projects/[projectId]/agents/[agentId]'>> = async ({
  params,
}) => {
  const { agentId, tenantId, projectId } = await params;
  try {
    const agent = await getFullAgent(tenantId, projectId, agentId);
    const capabilities = await getCapabilitiesAction();
    const sandboxEnabled = capabilities.success
      ? Boolean(capabilities.data?.sandbox?.configured)
      : false;
    return <Agent agent={agent.data} sandboxEnabled={sandboxEnabled} />;
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
