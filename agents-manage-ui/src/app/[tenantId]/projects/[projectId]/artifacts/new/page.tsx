import { ArtifactComponentForm } from '@/components/artifact-components/form/artifact-component-form';
import { BodyTemplate } from '@/components/layout/body-template';
import { checkProjectPermissionOrRedirect } from '@/lib/auth/require-project-permission';

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

  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Artifacts',
          href: `/${tenantId}/projects/${projectId}/artifacts`,
        },
        'New Artifact',
      ]}
    >
      <ArtifactComponentForm tenantId={tenantId} projectId={projectId} />
    </BodyTemplate>
  );
}

export default NewArtifactComponentPage;
