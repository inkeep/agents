import { Agent } from '@/components/agent/agent';
import { BodyTemplate } from '@/components/layout/body-template';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { fetchCredentialsAction } from '@/lib/actions/credentials';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { fetchToolsAction } from '@/lib/actions/tools';
import { createLookup } from '@/lib/utils';

async function NewAgentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/agents/new'>) {
  const { tenantId, projectId } = await params;
  const [dataComponents, artifactComponents, tools, credentials] = await Promise.all([
    fetchDataComponentsAction(tenantId, projectId),
    fetchArtifactComponentsAction(tenantId, projectId),
    fetchToolsAction(tenantId, projectId),
    fetchCredentialsAction(tenantId, projectId),
  ]);

  if (!dataComponents.success || !artifactComponents.success || !tools.success) {
    console.error(
      'Failed to fetch components:',
      dataComponents.error,
      artifactComponents.error,
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
        { label: 'Agent', href: `/${tenantId}/projects/${projectId}/agents` },
        { label: 'New Agent' },
      ]}
    >
      <Agent
        dataComponentLookup={dataComponentLookup}
        artifactComponentLookup={artifactComponentLookup}
        toolLookup={toolLookup}
        credentialLookup={credentialLookup}
      />
    </BodyTemplate>
  );
}

export default NewAgentPage;
