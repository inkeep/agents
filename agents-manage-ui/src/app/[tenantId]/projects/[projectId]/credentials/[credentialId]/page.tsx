import {
  EditCredentialForm,
  type EditCredentialFormData,
} from '@/components/credentials/views/edit-credential-form';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { type Credential, fetchCredential } from '@/lib/api/credentials';
import { getNangoConnectionMetadata } from '@/lib/mcp-tools/nango';

async function credentialToFormData(credential: Credential): Promise<EditCredentialFormData> {
  let connectionMetadata: Record<string, string> = {};
  if (credential.retrievalParams?.providerConfigKey && credential.retrievalParams?.connectionId) {
    connectionMetadata =
      (await getNangoConnectionMetadata({
        providerConfigKey: credential.retrievalParams.providerConfigKey as string,
        connectionId: credential.retrievalParams.connectionId as string,
      })) || {};
  }

  return {
    name: credential.id,
    metadata: connectionMetadata,
  };
}

async function EditCredentialsPage({
  params,
}: {
  params: Promise<{
    tenantId: string;
    projectId: string;
    credentialId: string;
  }>;
}) {
  const { tenantId, projectId, credentialId } = await params;

  let credential: Credential;
  let initialFormData: EditCredentialFormData;

  try {
    credential = await fetchCredential(tenantId, projectId, credentialId);
    initialFormData = await credentialToFormData(credential);
  } catch (error) {
    return (
      <FullPageError
        error={error as Error}
        link={`/${tenantId}/projects/${projectId}/credentials`}
        linkText="Back to credentials"
        context="credential"
      />
    );
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Credentials',
          href: `/${tenantId}/projects/${projectId}/credentials`,
        },
        { label: 'Edit' },
      ]}
    >
      <MainContent>
        <div className="max-w-2xl mx-auto py-4">
          <EditCredentialForm
            tenantId={tenantId}
            projectId={projectId}
            credential={credential}
            initialFormData={initialFormData}
          />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}

export default EditCredentialsPage;
