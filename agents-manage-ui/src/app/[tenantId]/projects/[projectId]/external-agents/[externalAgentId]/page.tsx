import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { ViewExternalAgentDetails } from '@/components/external-agents/view-external-agent-details';
import { fetchExternalAgent } from '@/lib/api/external-agents';

interface ExternalAgentPageProps {
  params: Promise<{ externalAgentId: string; tenantId: string; projectId: string }>;
}

async function ExternalAgentPage({ params }: ExternalAgentPageProps) {
  const { externalAgentId, tenantId, projectId } = await params;

  let externalAgent: Awaited<ReturnType<typeof fetchExternalAgent>>;
  try {
    externalAgent = await fetchExternalAgent(tenantId, projectId, externalAgentId);
  } catch (error) {
    return (
      <FullPageError
        error={error as Error}
        link={`/${tenantId}/projects/${projectId}/external-agents`}
        linkText="Back to external agents"
        context="External agent"
      />
    );
  }

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
    >
      <MainContent>
        <ViewExternalAgentDetails
          externalAgent={externalAgent}
          tenantId={tenantId}
          projectId={projectId}
        />
      </MainContent>
    </BodyTemplate>
  );
}

export default ExternalAgentPage;
