import { Plus } from 'lucide-react';
import Link from 'next/link';
import { ArtifactComponentsList } from '@/components/artifact-components/artifact-component-list';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { artifactDescription } from '@/constants/page-descriptions';
import { fetchArtifactComponents } from '@/lib/api/artifact-components';
import { getValidSearchParamsAsync } from '@/lib/utils/search-params';

export const dynamic = 'force-dynamic';

async function ArtifactComponentsPage({
  params,
  searchParams,
}: PageProps<'/[tenantId]/projects/[projectId]/artifacts'>) {
  const { tenantId, projectId } = await params;
  const ref = await getValidSearchParamsAsync(searchParams);

  let artifacts: Awaited<ReturnType<typeof fetchArtifactComponents>>;
  try {
    artifacts = await fetchArtifactComponents(tenantId, projectId, { queryParams: ref });
  } catch (error) {
    return <FullPageError error={error as Error} context="artifacts" />;
  }
  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Artifacts',
          href: `/${tenantId}/projects/${projectId}/artifacts`,
        },
      ]}
    >
      <MainContent className="min-h-full">
        {artifacts.data.length > 0 ? (
          <>
            <PageHeader
              title="Artifacts"
              description={artifactDescription}
              action={
                <Button asChild>
                  <Link href={`/${tenantId}/projects/${projectId}/artifacts/new`}>
                    <Plus className="size-4" /> New artifact
                  </Link>
                </Button>
              }
            />
            <ArtifactComponentsList
              tenantId={tenantId}
              projectId={projectId}
              artifacts={artifacts.data}
            />
          </>
        ) : (
          <EmptyState
            title="No artifacts yet."
            description={artifactDescription}
            link={`/${tenantId}/projects/${projectId}/artifacts/new`}
            linkText="Create artifact"
          />
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default ArtifactComponentsPage;
