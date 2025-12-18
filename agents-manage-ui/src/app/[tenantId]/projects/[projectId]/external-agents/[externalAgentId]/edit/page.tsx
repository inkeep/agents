import FullPageError from '@/components/errors/full-page-error';
import { ExternalAgentForm } from '@/components/external-agents/form/external-agent-form';
import type { ExternalAgentFormData } from '@/components/external-agents/form/validation';
import { SetBreadcrumbs } from '@/components/layout/set-breadcrumbs';
import { type Credential, fetchCredentials } from '@/lib/api/credentials';
import { fetchExternalAgent } from '@/lib/api/external-agents';
import type { ExternalAgent } from '@/lib/types/external-agents';
import { getErrorCode } from '@/lib/utils/error-serialization';

async function EditExternalAgentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/external-agents/[externalAgentId]/edit'>) {
  const { externalAgentId, tenantId, projectId } = await params;

  // Fetch both in parallel with individual error handling
  const [externalAgentResult, credentialsResult] = await Promise.allSettled([
    fetchExternalAgent(tenantId, projectId, externalAgentId),
    fetchCredentials(tenantId, projectId),
  ]);

  // Handle external agent result (required)
  let externalAgent: ExternalAgent;
  if (externalAgentResult.status === 'fulfilled') {
    externalAgent = externalAgentResult.value;
  } else {
    console.error('Failed to load external agent:', externalAgentResult.reason);
    return (
      <FullPageError
        errorCode={getErrorCode(externalAgentResult.reason)}
        link={`/${tenantId}/projects/${projectId}/external-agents`}
        linkText="Back to external agents"
        context="external agent"
      />
    );
  }

  // Handle credentials result (optional - fallback to empty array)
  let credentials: Credential[] = [];
  if (credentialsResult.status === 'fulfilled') {
    credentials = credentialsResult.value;
  } else {
    console.error('Failed to load credentials:', credentialsResult.reason);
    // Continue without credentials
  }

  // Convert ExternalAgent to ExternalAgentFormData format
  const initialFormData: ExternalAgentFormData = {
    name: externalAgent.name,
    description: externalAgent.description || '',
    baseUrl: externalAgent.baseUrl,
    credentialReferenceId: externalAgent.credentialReferenceId || 'none',
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ExternalAgentForm
        initialData={initialFormData}
        mode="update"
        externalAgent={externalAgent}
        credentials={credentials}
        tenantId={tenantId}
        projectId={projectId}
      />
    </div>
  );
}

export default EditExternalAgentPage;
