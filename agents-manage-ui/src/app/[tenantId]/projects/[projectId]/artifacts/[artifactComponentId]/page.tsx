import { ArtifactComponentForm } from '@/components/artifact-components/form/artifact-component-form';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { fetchArtifactComponent } from '@/lib/api/artifact-components';

export const dynamic = 'force-dynamic';

export default async function ArtifactComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/artifacts/[artifactComponentId]'>) {
  const { artifactComponentId, tenantId, projectId } = await params;
  try {
    const { name, description, props } = await fetchArtifactComponent(
      tenantId,
      projectId,
      artifactComponentId
    );
    return (
      <BodyTemplate
        breadcrumbs={[
          {
            label: 'Artifacts',
            href: `/${tenantId}/projects/${projectId}/artifacts`,
          },
          { label: name },
        ]}
      >
        <MainContent>
          <ArtifactComponentForm
            tenantId={tenantId}
            projectId={projectId}
            id={artifactComponentId}
            initialData={{
              id: artifactComponentId,
              name,
              description: description ?? '',
              props,
            }}
          />
        </MainContent>
      </BodyTemplate>
    );
  } catch (error) {
    return (
      <FullPageError
        error={error as Error}
        link={`/${tenantId}/projects/${projectId}/artifacts`}
        linkText="Back to artifacts"
        context="artifact"
      />
    );
  }
}
