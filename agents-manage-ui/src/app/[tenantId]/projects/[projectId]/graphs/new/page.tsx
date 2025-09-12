import { Graph } from '@/components/graph/graph';
import { BodyTemplate } from '@/components/layout/body-template';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { createLookup } from '@/lib/utils';

async function NewGraphPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
}) {
  const { tenantId, projectId } = await params;
  const [dataComponents, artifactComponents] = await Promise.all([
    fetchDataComponentsAction(tenantId, projectId),
    fetchArtifactComponentsAction(tenantId, projectId),
  ]);

  if (!dataComponents.success || !artifactComponents.success) {
    console.error('Failed to fetch components:', dataComponents.error, artifactComponents.error);
  }

  const dataComponentLookup = createLookup(
    dataComponents.success ? dataComponents.data : undefined
  );

  const artifactComponentLookup = createLookup(
    artifactComponents.success ? artifactComponents.data : undefined
  );

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Graphs', href: `/${tenantId}/projects/${projectId}/graphs` },
        { label: 'New Graph' },
      ]}
    >
      <Graph
        dataComponentLookup={dataComponentLookup}
        artifactComponentLookup={artifactComponentLookup}
      />
    </BodyTemplate>
  );
}

export default NewGraphPage;
