import FullPageError from '@/components/errors/full-page-error';
import { ExternalAgentForm } from '@/components/external-agents/form/external-agent-form';
import type { ExternalAgentFormData } from '@/components/external-agents/form/validation';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { type Credential, fetchCredentials } from '@/lib/api/credentials';
import { fetchExternalAgent } from '@/lib/api/external-agents';
import type { ExternalAgent } from '@/lib/types/external-agents';

interface EditExternalAgentPageProps {
  params: Promise<{ externalAgentId: string; tenantId: string; projectId: string }>;
}

async function EditExternalAgentPage({ params }: EditExternalAgentPageProps) {
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
        error={externalAgentResult.reason as Error}
        link={`/${tenantId}/projects/${projectId}/external-agents`}
        linkText="Back to external agents"
        context="External agent"
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
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'External agents',
          href: `/${tenantId}/projects/${projectId}/external-agents`,
        },
        {
          label: externalAgent.name,
          href: `/${tenantId}/projects/${projectId}/external-agents/${externalAgentId}`,
        },
        { label: 'Edit' },
      ]}
    >
      <MainContent>
        <div className="max-w-2xl mx-auto py-4">
          <ExternalAgentForm
            initialData={initialFormData}
            mode="update"
            externalAgent={externalAgent}
            credentials={credentials}
            tenantId={tenantId}
            projectId={projectId}
          />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}

export default EditExternalAgentPage;
