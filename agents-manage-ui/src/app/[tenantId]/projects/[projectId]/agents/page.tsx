import { AgentItem } from '@/components/agents/agent-item';
import { NewAgentDialog, NewAgentItem } from '@/components/agents/new-agent-item';
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
    const { data } = await fetchAgents(tenantId, projectId);
    return data.length ? (
      <>
        <PageHeader title="Agents" description={agentDescription} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          <NewAgentItem tenantId={tenantId} projectId={projectId} />
          {data.map((agent) => (
            <AgentItem key={agent.id} {...agent} tenantId={tenantId} projectId={projectId} />
          ))}
        </div>
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
