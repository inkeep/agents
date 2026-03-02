import { CredentialNameBadge } from '@/components/credentials/credential-name-badge';
import FullPageError from '@/components/errors/full-page-error';
import { ViewExternalAgentDetails } from '@/components/external-agents/view-external-agent-details';
import { fetchExternalAgent } from '@/lib/api/external-agents';
import { getErrorCode } from '@/lib/utils/error-serialization';

async function ExternalAgentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/external-agents/[externalAgentId]'>) {
  const { externalAgentId, tenantId, projectId } = await params;

  try {
    const externalAgent = await fetchExternalAgent(tenantId, projectId, externalAgentId);
    return (
      <ViewExternalAgentDetails
        className="max-w-2xl mx-auto"
        externalAgent={externalAgent}
        credentialBadge={
          externalAgent.credentialReferenceId ? (
            <CredentialNameBadge
              tenantId={tenantId}
              projectId={projectId}
              credentialReferenceId={externalAgent.credentialReferenceId}
            />
          ) : undefined
        }
        tenantId={tenantId}
        projectId={projectId}
      />
    );
  } catch (error) {
    return (
      <FullPageError
        errorCode={getErrorCode(error)}
        link={`/${tenantId}/projects/${projectId}/external-agents`}
        linkText="Back to external agents"
        context="external agent"
      />
    );
  }
}

export default ExternalAgentPage;
