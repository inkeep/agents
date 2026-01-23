import { ArtifactComponentForm } from '@/components/artifact-components/form/artifact-component-form';
import { checkProjectPermissionOrRedirect } from '@/lib/auth/check-permission-or-redirect';

async function NewArtifactComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/artifacts/new'>) {
  const { tenantId, projectId } = await params;
  await checkProjectPermissionOrRedirect(
    tenantId,
    projectId,
    'edit',
    `/${tenantId}/projects/${projectId}/artifacts`
  );
  return <ArtifactComponentForm tenantId={tenantId} projectId={projectId} />;
}

export default NewArtifactComponentPage;
