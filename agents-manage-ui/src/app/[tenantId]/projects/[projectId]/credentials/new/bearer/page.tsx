import { NewCredentialForm } from '@/components/credentials/views/new-credential-form';
import { BodyTemplate } from '@/components/layout/body-template';

async function NewBearerCredentialsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/new/bearer'>) {
  const { tenantId, projectId } = await params;
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
        { label: 'Bearer' },
      ]}
    >
      <div className="max-w-2xl mx-auto">
        <NewCredentialForm />
      </div>
    </BodyTemplate>
  );
}

export default NewBearerCredentialsPage;
