import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { ExternalAgentForm } from '@/components/external-agents/form/external-agent-form';
import { type Credential, fetchCredentials } from '@/lib/api/credentials';

async function NewExternalAgentPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
}) {
  const { tenantId, projectId } = await params;
  let credentials: Credential[] = [];
  try {
    credentials = await fetchCredentials(tenantId, projectId);
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'External agents',
          href: `/${tenantId}/projects/${projectId}/external-agents`,
        },
        { label: 'New' },
      ]}
    >
      <MainContent>
        <div className="max-w-2xl mx-auto py-4">
          <ExternalAgentForm
            mode="create"
            credentials={credentials}
            tenantId={tenantId}
            projectId={projectId}
          />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}

export default NewExternalAgentPage;
