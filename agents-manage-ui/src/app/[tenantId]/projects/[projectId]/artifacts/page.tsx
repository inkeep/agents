import { Plus } from 'lucide-react';
import Link from 'next/link';
import { ArtifactComponentItem } from '@/components/artifact-components/artifact-component-item';
import FullPageError from '@/components/errors/full-page-error';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { artifactDescription } from '@/constants/page-descriptions';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchArtifactComponents } from '@/lib/api/artifact-components';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

async function ArtifactComponentsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/artifacts'>) {
  const { tenantId, projectId } = await params;
  try {
    const { data } = await fetchArtifactComponents(tenantId, projectId);
    return data.length ? (
      <>
        <PageHeader
          title={STATIC_LABELS.artifacts}
          description={artifactDescription}
          action={
            <Button asChild>
              <Link href={`/${tenantId}/projects/${projectId}/artifacts/new`}>
                <Plus className="size-4" /> New artifact
              </Link>
            </Button>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {data.map((artifact) => (
            <ArtifactComponentItem
              key={artifact.id}
              {...artifact}
              tenantId={tenantId}
              projectId={projectId}
            />
          ))}
        </div>
      </>
    ) : (
      <EmptyState
        title="No artifacts yet."
        description={artifactDescription}
        link={`/${tenantId}/projects/${projectId}/artifacts/new`}
        linkText="Create artifact"
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="artifacts" />;
  }
}

export default ArtifactComponentsPage;
