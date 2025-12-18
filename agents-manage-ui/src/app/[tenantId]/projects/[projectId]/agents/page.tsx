import { AgentList } from '@/components/agents/agents-list';
import { NewAgentDialog } from '@/components/agents/new-agent-item';
import FullPageError from '@/components/errors/full-page-error';
import { AgentsIcon } from '@/components/icons/empty-state/agents';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { agentDescription } from '@/constants/page-descriptions';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

async function AgentsPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/agents'>) {
  const { tenantId, projectId } = await params;
  try {
    const agents = await fetchAgents(tenantId, projectId);
    return agents.data.length ? (
      <>
        <PageHeader title="Agents" description={agentDescription} />
        <AgentList tenantId={tenantId} projectId={projectId} agent={agents.data} />
      </>
    ) : (
      <EmptyState
        title="No agents yet."
        description={agentDescription}
        action={<NewAgentDialog tenantId={tenantId} projectId={projectId} />}
        linkText="Create agent"
        icon={<AgentsIcon />}
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="agents" />;
  }
}

export default AgentsPage;
