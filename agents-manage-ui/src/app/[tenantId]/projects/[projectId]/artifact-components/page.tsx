import { Plus } from 'lucide-react';
import Link from 'next/link';
import { ArtifactComponentsList } from '@/components/artifact-components/artifact-component-list';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { artifactDescription } from '@/constants/page-descriptions';
import { type ArtifactComponent, fetchArtifactComponents } from '@/lib/api/artifact-components';

export const dynamic = 'force-dynamic';

interface ArtifactComponentsPageProps {
  params: Promise<{ tenantId: string; projectId: string }>;
}

async function ArtifactComponentsPage({ params }: ArtifactComponentsPageProps) {
  const { tenantId, projectId } = await params;
  let artifacts: { data: ArtifactComponent[] } = { data: [] };
  try {
    const response = await fetchArtifactComponents(tenantId, projectId);
    artifacts = response;
  } catch (_error) {
    throw new Error('Failed to fetch artifacts components');
  }
  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Artifact components',
          href: `/${tenantId}/projects/${projectId}/artifact-components`,
        },
      ]}
    >
      <MainContent className="min-h-full">
        {artifacts.data.length > 0 ? (
          <>
            <PageHeader
              title="Artifact components"
              description={artifactDescription}
              action={
                <Button asChild>
                  <Link href={`/${tenantId}/projects/${projectId}/artifact-components/new`}>
                    <Plus className="size-4" /> New artifact component
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
            title="No artifact components yet."
            description={artifactDescription}
            link={`/${tenantId}/projects/${projectId}/artifact-components/new`}
            linkText="Create artifact component"
          />
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default ArtifactComponentsPage;
