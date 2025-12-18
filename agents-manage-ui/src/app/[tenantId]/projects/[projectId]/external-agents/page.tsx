import { Plus } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { ExternalAgentsList } from '@/components/external-agents/external-agents-list';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { fetchExternalAgents } from '@/lib/api/external-agents';
import { getErrorCode } from '@/lib/utils/error-serialization';

const externalAgentsDescription =
  'Create external agents that can be delegated to from your internal agents.';

async function ExternalAgentsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/external-agents'>) {
  const { tenantId, projectId } = await params;

  try {
    const externalAgents = await fetchExternalAgents(tenantId, projectId);
    return externalAgents.length > 0 ? (
      <>
        <PageHeader
          title="External agents"
          description={externalAgentsDescription}
          action={
            <Button asChild>
              <Link
                href={`/${tenantId}/projects/${projectId}/external-agents/new`}
                className="flex items-center gap-2"
              >
                <Plus className="size-4" />
                New external agent
              </Link>
            </Button>
          }
        />
        <ExternalAgentsList externalAgents={externalAgents} />
      </>
    ) : (
      <EmptyState
        title="No external agents yet."
        description={externalAgentsDescription}
        link={`/${tenantId}/projects/${projectId}/external-agents/new`}
        linkText="Create external agent"
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="external agents" />;
  }
}

export default ExternalAgentsPage;
