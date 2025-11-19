import { AgentList } from '@/components/agents/agents-list';
import FullPageError from '@/components/errors/full-page-error';
import { AgentsIcon } from '@/components/icons/empty-state/agents';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { agentDescription } from '@/constants/page-descriptions';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { getValidSearchParamsAsync } from '@/lib/utils/search-params';

export const dynamic = 'force-dynamic';

async function AgentsPage({
  params,
  searchParams,
}: PageProps<'/[tenantId]/projects/[projectId]/agents'>) {
  const { tenantId, projectId } = await params;
  const ref = await getValidSearchParamsAsync(searchParams);

  let agents: Awaited<ReturnType<typeof fetchAgents>>;
  try {
    agents = await fetchAgents(tenantId, projectId, { queryParams: ref });
  } catch (error) {
    return <FullPageError error={error as Error} context="agents" />;
  }
  return (
    <BodyTemplate
      breadcrumbs={[{ label: 'Agents', href: `/${tenantId}/projects/${projectId}/agents` }]}
    >
      <MainContent className="min-h-full">
        {agents.data.length > 0 ? (
          <>
            <PageHeader title="Agents" description={agentDescription} />
            <AgentList tenantId={tenantId} projectId={projectId} agent={agents.data} />
          </>
        ) : (
          <EmptyState
            title="No agents yet."
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
