import { Plus } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { ExternalAgentsList } from '@/components/external-agents/external-agents-list';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { fetchExternalAgents } from '@/lib/api/external-agents';

const externalAgentsDescription =
  'Create external agents that can be delegated to from your internal agents.';

async function ExternalAgentsPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
}) {
  const { tenantId, projectId } = await params;

  let externalAgents: Awaited<ReturnType<typeof fetchExternalAgents>>;
  try {
    externalAgents = await fetchExternalAgents(tenantId, projectId);
  } catch (error) {
    return <FullPageError error={error as Error} context="External agents" />;
  }

  return (
    <BodyTemplate breadcrumbs={[{ label: 'External agents' }]}>
      <MainContent className="min-h-full">
        {externalAgents.length > 0 ? (
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
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default ExternalAgentsPage;
