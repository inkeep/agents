import { ArtifactComponentForm } from '@/components/artifact-components/form/artifact-component-form';

async function NewArtifactComponentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/artifacts/new'>) {
  const { tenantId, projectId } = await params;
  return <ArtifactComponentForm tenantId={tenantId} projectId={projectId} />;
}

export default NewArtifactComponentPage;
