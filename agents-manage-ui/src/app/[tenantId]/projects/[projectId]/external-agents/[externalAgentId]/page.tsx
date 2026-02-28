import { Lock } from 'lucide-react';
import { Suspense } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { ViewExternalAgentDetails } from '@/components/external-agents/view-external-agent-details';
import { Badge } from '@/components/ui/badge';
import { fetchCredential } from '@/lib/api/credentials';
import { fetchExternalAgent } from '@/lib/api/external-agents';
import { getErrorCode } from '@/lib/utils/error-serialization';

async function CredentialBadge({
  tenantId,
  projectId,
  credentialReferenceId,
}: {
  tenantId: string;
  projectId: string;
  credentialReferenceId: string;
}) {
  const credential = await fetchCredential(tenantId, projectId, credentialReferenceId).catch(
    () => null
  );
  return (
    <Badge variant="code" className="flex items-center gap-2">
      <Lock className="w-4 h-4" />
      {credential?.name || credentialReferenceId}
    </Badge>
  );
}

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
            <Suspense
              fallback={
                <Badge variant="code" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  {externalAgent.credentialReferenceId}
                </Badge>
              }
            >
              <CredentialBadge
                tenantId={tenantId}
                projectId={projectId}
                credentialReferenceId={externalAgent.credentialReferenceId}
              />
            </Suspense>
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
