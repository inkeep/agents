import { NewCredentialForm } from '@/components/credentials/views/new-credential-form';

async function NewBearerCredentialsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/new/bearer'>) {
  const { tenantId, projectId } = await params;
  return (
    <div className="max-w-2xl mx-auto">
      <NewCredentialForm />
    </div>
  );
}

export default NewBearerCredentialsPage;
