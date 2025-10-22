import { ArtifactComponentForm } from '@/components/artifact-components/form/artifact-component-form';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';

async function NewArtifactComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/artifacts/new'>) {
  const { tenantId, projectId } = await params;
  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Artifacts',
          href: `/${tenantId}/projects/${projectId}/artifacts`,
        },
        { label: 'New Artifact' },
      ]}
    >
      <MainContent>
        <div className="max-w-2xl mx-auto py-4">
          <ArtifactComponentForm tenantId={tenantId} projectId={projectId} />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}

export default NewArtifactComponentPage;
