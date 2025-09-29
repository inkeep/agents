import { Graph } from '@/components/graph/graph';
import { BodyTemplate } from '@/components/layout/body-template';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { fetchCredentialsAction } from '@/lib/actions/credentials';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { getFullGraphAction } from '@/lib/actions/graph-full';
import { fetchToolsAction } from '@/lib/actions/tools';
import { createLookup } from '@/lib/utils';
export const dynamic = 'force-dynamic';

interface GraphPageProps {
  params: Promise<{ graphId: string; tenantId: string; projectId: string }>;
}

async function GraphPage({ params }: GraphPageProps) {
  const { graphId, tenantId, projectId } = await params;

  const [graph, dataComponents, artifactComponents, credentials, tools] = await Promise.all([
    getFullGraphAction(tenantId, projectId, graphId),
    fetchDataComponentsAction(tenantId, projectId),
    fetchArtifactComponentsAction(tenantId, projectId),
    fetchCredentialsAction(tenantId, projectId),
    fetchToolsAction(tenantId, projectId),
  ]);

  if (!graph.success) throw new Error(graph.error);
  if (
    !dataComponents.success ||
    !artifactComponents.success ||
    !credentials.success ||
    !tools.success
  ) {
    console.error(
      'Failed to fetch components:',
      dataComponents.error,
      artifactComponents.error,
      credentials.error,
      tools.error
    );
  }

  const dataComponentLookup = createLookup(
    dataComponents.success ? dataComponents.data : undefined
  );

  const artifactComponentLookup = createLookup(
    artifactComponents.success ? artifactComponents.data : undefined
  );

  const toolLookup = createLookup(tools.success ? tools.data : undefined);
  const credentialLookup = createLookup(credentials.success ? credentials.data : undefined);

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Graphs', href: `/${tenantId}/projects/${projectId}/graphs` },
        { label: graph.data.name },
      ]}
    >
      <Graph
        graph={graph?.data}
        dataComponentLookup={dataComponentLookup}
        artifactComponentLookup={artifactComponentLookup}
        toolLookup={toolLookup}
        credentialLookup={credentialLookup}
      />
    </BodyTemplate>
  );
}

export default GraphPage;
