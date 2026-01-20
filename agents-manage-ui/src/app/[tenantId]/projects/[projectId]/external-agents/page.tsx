import { Plus } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { ExternalAgentsList } from '@/components/external-agents/external-agents-list';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { fetchExternalAgents } from '@/lib/api/external-agents';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

const externalAgentsDescription =
  'Create external agents that can be delegated to from your internal agents.';

async function ExternalAgentsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/external-agents'>) {
  const { tenantId, projectId } = await params;

  try {
    const [externalAgents, permissions] = await Promise.all([
      fetchExternalAgents(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);

    const canEdit = permissions.canEdit;

    const content = externalAgents.length ? (
      <>
        <PageHeader
          title="External agents"
          description={externalAgentsDescription}
          action={
            canEdit ? (
              <Button asChild>
                <Link
                  href={`/${tenantId}/projects/${projectId}/external-agents/new`}
                  className="flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  New external agent
                </Link>
              </Button>
            ) : undefined
          }
        />
        <ExternalAgentsList externalAgents={externalAgents} />
      </>
    ) : (
      <EmptyState
        title="No external agents yet."
        description={externalAgentsDescription}
        link={canEdit ? `/${tenantId}/projects/${projectId}/external-agents/new` : undefined}
        linkText={canEdit ? 'Create external agent' : undefined}
      />
    );
    return <BodyTemplate breadcrumbs={['External agents']}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="external agents" />;
  }
}

export default ExternalAgentsPage;
