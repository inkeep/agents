import { NewCredentialForm } from '@/components/credentials/views/new-credential-form';
import { BodyTemplate } from '@/components/layout/body-template';
import { checkProjectPermissionOrRedirect } from '@/lib/auth/require-project-permission';

async function NewBearerCredentialsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/new/bearer'>) {
  const { tenantId, projectId } = await params;

  await checkProjectPermissionOrRedirect(
    tenantId,
    projectId,
    'edit',
    `/${tenantId}/projects/${projectId}/credentials`
  );

  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Credentials',
          href: `/${tenantId}/projects/${projectId}/credentials`,
        },
        {
          label: 'New credential',
          href: `/${tenantId}/projects/${projectId}/credentials/new`,
        },
        'Bearer',
      ]}
      className="max-w-2xl mx-auto"
    >
      <NewCredentialForm />
    </BodyTemplate>
  );
}

export default NewBearerCredentialsPage;
