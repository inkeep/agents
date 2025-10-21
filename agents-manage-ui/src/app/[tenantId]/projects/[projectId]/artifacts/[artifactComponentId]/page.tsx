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

  let artifactComponent: Awaited<ReturnType<typeof fetchArtifactComponent>>;
  try {
    artifactComponent = await fetchArtifactComponent(tenantId, projectId, artifactComponentId);
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

  const { name, description, props } = artifactComponent;
  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Artifacts',
          href: `/${tenantId}/projects/${projectId}/artifacts`,
        },
        { label: artifactComponent.name },
      ]}
    >
      <MainContent>
        <div className="max-w-2xl mx-auto py-4">
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
        </div>
      </MainContent>
    </BodyTemplate>
  );
}
