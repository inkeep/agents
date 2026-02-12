import { ArtifactComponentForm } from '@/components/artifact-components/form/artifact-component-form';
import FullPageError from '@/components/errors/full-page-error';
import { fetchArtifactComponent } from '@/lib/api/artifact-components';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { serializeJson } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export default async function ArtifactComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/artifacts/[artifactComponentId]'>) {
  const { artifactComponentId, tenantId, projectId } = await params;
  try {
    const [artifact, permissions] = await Promise.all([
      fetchArtifactComponent(tenantId, projectId, artifactComponentId),
      fetchProjectPermissions(tenantId, projectId),
    ]);

    const { name, description, props, render } = artifact;

    return (
      <ArtifactComponentForm
        tenantId={tenantId}
        projectId={projectId}
        id={artifactComponentId}
        readOnly={!permissions.canEdit}
        defaultValues={{
          id: artifactComponentId,
          name,
          description: description ?? '',
          props: serializeJson(props),
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
