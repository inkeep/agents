import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { ExternalAgentItem } from '@/components/external-agents/external-agent-item';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchExternalAgents } from '@/lib/api/external-agents';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const metadata = {
  title: STATIC_LABELS['external-agents'],
  description: 'Create external agents that can be delegated to from your internal agents.',
} satisfies Metadata;

async function ExternalAgentsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/external-agents'>) {
  const { tenantId, projectId } = await params;

  try {
    const externalAgents = await fetchExternalAgents(tenantId, projectId);
    return externalAgents.length ? (
      <>
        <PageHeader
          title={metadata.title}
          description={metadata.description}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {externalAgents.map((externalAgent) => (
            <ExternalAgentItem
              key={externalAgent.id}
              tenantId={tenantId}
              projectId={projectId}
              externalAgent={externalAgent}
            />
          ))}
        </div>
      </>
    ) : (
      <EmptyState
        title="No external agents yet."
        description={metadata.description}
        link={`/${tenantId}/projects/${projectId}/external-agents/new`}
        linkText="Create external agent"
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="external agents" />;
  }
}

export default ExternalAgentsPage;
