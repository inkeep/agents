import { AgentList } from '@/components/agents/agents-list';
import { AgentsIcon } from '@/components/icons/empty-state/agents';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { agentDescription } from '@/constants/page-descriptions';
import { fetchAgents } from '@/lib/api/agent-full-client';
import type { Agent } from '@/lib/types/agent-full';

export const dynamic = 'force-dynamic';

interface AgentsPageProps {
  params: Promise<{ tenantId: string; projectId: string }>;
}

async function AgentsPage({ params }: AgentsPageProps) {
  const { tenantId, projectId } = await params;
  let agent: { data: Agent[] } = { data: [] };
  try {
    const response = await fetchAgents(tenantId, projectId);
    agent = response;
  } catch (_error) {
    throw new Error('Failed to fetch agent');
  }
  return (
    <BodyTemplate
      breadcrumbs={[{ label: 'Agent', href: `/${tenantId}/projects/${projectId}/agents` }]}
    >
      <MainContent className="min-h-full">
        {agent.data.length > 0 ? (
          <>
            <PageHeader title="Agent" description={agentDescription} />
            <AgentList tenantId={tenantId} projectId={projectId} agent={agent.data} />
          </>
        ) : (
          <EmptyState
            title="No agent yet."
            description={agentDescription}
            link={`/${tenantId}/projects/${projectId}/agents/new`}
            linkText="Create agent"
            icon={<AgentsIcon />}
          />
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default AgentsPage;
