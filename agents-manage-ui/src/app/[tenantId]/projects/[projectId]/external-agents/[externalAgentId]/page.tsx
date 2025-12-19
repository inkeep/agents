import FullPageError from '@/components/errors/full-page-error';
import { ViewExternalAgentDetails } from '@/components/external-agents/view-external-agent-details';
import { BodyTemplate } from '@/components/layout/body-template';
import { fetchExternalAgent } from '@/lib/api/external-agents';
import { getErrorCode } from '@/lib/utils/error-serialization';

async function ExternalAgentPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/external-agents/[externalAgentId]'>) {
  const { externalAgentId, tenantId, projectId } = await params;

  try {
    const externalAgent = await fetchExternalAgent(tenantId, projectId, externalAgentId);
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
        ]}
        className="max-w-2xl mx-auto"
      >
        <ViewExternalAgentDetails
          externalAgent={externalAgent}
          tenantId={tenantId}
          projectId={projectId}
        />
      </BodyTemplate>
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
