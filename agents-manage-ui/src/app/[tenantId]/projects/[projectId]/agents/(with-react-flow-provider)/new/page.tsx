import { Agent } from '@/components/agent/agent';
import { BodyTemplate } from '@/components/layout/body-template';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import { fetchCredentialsAction } from '@/lib/actions/credentials';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import { fetchExternalAgentsAction } from '@/lib/actions/external-agents';
import { fetchToolsAction } from '@/lib/actions/tools';
import { createLookup } from '@/lib/utils';
import { getValidSearchParamsAsync } from '@/lib/utils/search-params';

async function NewAgentPage({
  params,
  searchParams,
}: PageProps<'/[tenantId]/projects/[projectId]/agents/new'>) {
  const { tenantId, projectId } = await params;
  const { ref } = await getValidSearchParamsAsync(searchParams);
  const [dataComponents, artifactComponents, tools, credentials, externalAgents] =
    await Promise.all([
      fetchDataComponentsAction(tenantId, projectId, ref),
      fetchArtifactComponentsAction(tenantId, projectId, ref),
      fetchToolsAction(tenantId, projectId, ref),
      fetchCredentialsAction(tenantId, projectId, ref),
      fetchExternalAgentsAction(tenantId, projectId, ref),
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
  const externalAgentLookup = createLookup(
    externalAgents.success ? externalAgents.data : undefined
  );

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Agents', href: `/${tenantId}/projects/${projectId}/agents` },
        { label: 'New Agent' },
      ]}
    >
      <Agent
        dataComponentLookup={dataComponentLookup}
        artifactComponentLookup={artifactComponentLookup}
        toolLookup={toolLookup}
        credentialLookup={credentialLookup}
        externalAgentLookup={externalAgentLookup}
      />
    </BodyTemplate>
  );
}

export default NewAgentPage;
