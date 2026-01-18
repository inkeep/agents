import { Plus } from 'lucide-react';
import Link from 'next/link';
import { ArtifactComponentsList } from '@/components/artifact-components/artifact-component-list';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { artifactDescription } from '@/constants/page-descriptions';
import { fetchArtifactComponents } from '@/lib/api/artifact-components';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

async function ArtifactComponentsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/artifacts'>) {
  const { tenantId, projectId } = await params;
  try {
    const { data } = await fetchArtifactComponents(tenantId, projectId);
    const content = data.length ? (
      <>
        <PageHeader
          title="Artifacts"
          description={artifactDescription}
          action={
            <Button asChild={true}>
              <Link href={`/${tenantId}/projects/${projectId}/artifacts/new`}>
                <Plus className="size-4" /> New artifact
              </Link>
            </Button>
          }
        />
        <ArtifactComponentsList tenantId={tenantId} projectId={projectId} artifacts={data} />
      </>
    ) : (
      <EmptyState
        title="No artifacts yet."
        description={artifactDescription}
        link={`/${tenantId}/projects/${projectId}/artifacts/new`}
        linkText="Create artifact"
      />
    );
    return (
      <BodyTemplate
        breadcrumbs={[
          {
            label: 'Artifacts',
            href: `/${tenantId}/projects/${projectId}/artifacts`,
          },
        ]}
      >
        {content}
      </BodyTemplate>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="artifacts" />;
  }
}

export default ArtifactComponentsPage;
