import { GraphList } from '@/components/agent/agent-list';
import { GraphsIcon } from '@/components/icons/empty-state/agent';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { graphDescription } from '@/constants/page-descriptions';
import { fetchGraphs } from '@/lib/api/agent-full-client';
import type { Agent } from '@/lib/types/agent-full';

export const dynamic = 'force-dynamic';

interface GraphsPageProps {
  params: Promise<{ tenantId: string; projectId: string }>;
}

async function GraphsPage({ params }: GraphsPageProps) {
  const { tenantId, projectId } = await params;
  let agent: { data: Agent[] } = { data: [] };
  try {
    const response = await fetchGraphs(tenantId, projectId);
    agent = response;
  } catch (_error) {
    throw new Error('Failed to fetch agent');
  }
  return (
    <BodyTemplate
      breadcrumbs={[{ label: 'Agent', href: `/${tenantId}/projects/${projectId}/agent` }]}
    >
      <MainContent className="min-h-full">
        {agent.data.length > 0 ? (
          <>
            <PageHeader title="Agent" description={graphDescription} />
            <GraphList tenantId={tenantId} projectId={projectId} agent={agent.data} />
          </>
        ) : (
          <EmptyState
            title="No agent yet."
            description={graphDescription}
            link={`/${tenantId}/projects/${projectId}/agent/new`}
            linkText="Create agent"
            icon={<GraphsIcon />}
          />
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default GraphsPage;
