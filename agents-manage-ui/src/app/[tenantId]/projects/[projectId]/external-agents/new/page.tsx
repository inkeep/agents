import { ExternalAgentForm } from '@/components/external-agents/form/external-agent-form';
import { BodyTemplate } from '@/components/layout/body-template';
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
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'External agents',
          href: `/${tenantId}/projects/${projectId}/external-agents`,
        },
        'New',
      ]}
      className="max-w-2xl mx-auto"
    >
      <ExternalAgentForm
        mode="create"
        credentials={credentials}
        tenantId={tenantId}
        projectId={projectId}
      />
    </BodyTemplate>
  );
}

export default NewExternalAgentPage;
