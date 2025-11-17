import { ArtifactComponentForm } from '@/components/artifact-components/form/artifact-component-form';
import { BodyTemplate } from '@/components/layout/body-template';

async function NewArtifactComponentPage({
  params,
  searchParams,
}: PageProps<'/[tenantId]/projects/[projectId]/artifacts/new'>) {
  const { tenantId, projectId } = await params;
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
