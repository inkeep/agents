import { ArtifactComponentForm } from '@/components/artifact-components/form/artifact-component-form';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { fetchArtifactComponent } from '@/lib/api/artifact-components';

export const dynamic = 'force-dynamic';

interface ArtifactComponentPageProps {
  params: Promise<{
    tenantId: string;
    projectId: string;
    artifactComponentId: string;
  }>;
}

export default async function ArtifactComponentPage({ params }: ArtifactComponentPageProps) {
  const { artifactComponentId, tenantId, projectId } = await params;
  const artifactComponent = await fetchArtifactComponent(tenantId, projectId, artifactComponentId);
  const { name, description, summaryProps, fullProps } = artifactComponent;
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
              summaryProps,
              fullProps,
            }}
          />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}
