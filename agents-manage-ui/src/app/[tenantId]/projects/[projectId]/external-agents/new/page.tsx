import { ExternalAgentForm } from '@/components/external-agents/form/external-agent-form';
import { type Credential, fetchCredentials } from '@/lib/api/credentials';

async function NewExternalAgentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/external-agents/new'>) {
  const { tenantId, projectId } = await params;
  let credentials: Credential[] = [];
  try {
    credentials = await fetchCredentials(tenantId, projectId);
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }

  return (
    <ExternalAgentForm
      className="max-w-2xl mx-auto"
      credentials={credentials}
      tenantId={tenantId}
      projectId={projectId}
    />
  );
}

export default NewExternalAgentPage;
