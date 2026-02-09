import type { Metadata } from 'next';
import { AgentItem } from '@/components/agents/agent-item';
import { NewAgentDialog, NewAgentItem } from '@/components/agents/new-agent-item';
import FullPageError from '@/components/errors/full-page-error';
import { AgentsIcon } from '@/components/icons/empty-state/agents';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { ExternalLink } from '@/components/ui/external-link';
import { DOCS_BASE_URL, STATIC_LABELS } from '@/constants/theme';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: STATIC_LABELS.agents,
  description: 'Agents are visual representations of the data flow between sub agents and tools.',
} satisfies Metadata;

const agentDescription = (
  <>
    {metadata.description}
    <ExternalLink href={`${DOCS_BASE_URL}/visual-builder/agent`}>Learn more</ExternalLink>
  </>
);

async function AgentsPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/agents'>) {
  const { tenantId, projectId } = await params;
  try {
    const [{ data }, { canEdit }] = await Promise.all([
      fetchAgents(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);

    return data.length ? (
      <>
        <PageHeader title={metadata.title} description={agentDescription} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          <NewAgentItem tenantId={tenantId} projectId={projectId} />
          {data.map((agent) => (
            <AgentItem
              key={agent.id}
              {...agent}
              tenantId={tenantId}
              projectId={projectId}
              canEdit={canEdit}
            />
          ))}
        </div>
      </>
    ) : (
      <EmptyState
        title="No agents yet."
        description={agentDescription}
        action={canEdit ? <NewAgentDialog tenantId={tenantId} projectId={projectId} /> : undefined}
        linkText={canEdit ? 'Create agent' : undefined}
        icon={<AgentsIcon />}
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="agents" />;
  }
}

export default AgentsPage;
