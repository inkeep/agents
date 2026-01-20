import { ArtifactComponentForm } from '@/components/artifact-components/form/artifact-component-form';
import FullPageError from '@/components/errors/full-page-error';
import { fetchArtifactComponent } from '@/lib/api/artifact-components';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function ArtifactComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/artifacts/[artifactComponentId]'>) {
  const { artifactComponentId, tenantId, projectId } = await params;
  try {
    const { name, description, props, render } = await fetchArtifactComponent(
      tenantId,
      projectId,
      artifactComponentId
    );
    return (
      <ArtifactComponentForm
        tenantId={tenantId}
        projectId={projectId}
        id={artifactComponentId}
        initialData={{
          id: artifactComponentId,
          name,
          description: description ?? '',
          props,
          render,
        }}
      />
    );
  } catch (error) {
    return (
      <FullPageError
        errorCode={getErrorCode(error)}
        link={`/${tenantId}/projects/${projectId}/artifacts`}
        linkText="Back to artifacts"
        context="artifact"
      />
    );
  }
}
