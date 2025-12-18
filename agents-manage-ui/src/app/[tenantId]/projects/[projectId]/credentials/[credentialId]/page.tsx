import {
  EditCredentialForm,
  type EditCredentialFormData,
} from '@/components/credentials/views/edit-credential-form';
import FullPageError from '@/components/errors/full-page-error';
import { type Credential, fetchCredential } from '@/lib/api/credentials';
import { getNangoConnectionMetadata } from '@/lib/mcp-tools/nango';
import { getErrorCode } from '@/lib/utils/error-serialization';

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
    name: credential.name,
    metadata: connectionMetadata,
  };
}

async function EditCredentialsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/[credentialId]'>) {
  const { tenantId, projectId, credentialId } = await params;

  let credential: Credential;
  let initialFormData: EditCredentialFormData;

  try {
    credential = await fetchCredential(tenantId, projectId, credentialId);
    initialFormData = await credentialToFormData(credential);
  } catch (error) {
    return (
      <FullPageError
        errorCode={getErrorCode(error)}
        link={`/${tenantId}/projects/${projectId}/credentials`}
        linkText="Back to credentials"
        context="credential"
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <EditCredentialForm
        tenantId={tenantId}
        projectId={projectId}
        credential={credential}
        initialFormData={initialFormData}
      />
    </div>
  );
}

export default EditCredentialsPage;
