import { recordToKeyValuePairs } from '@/components/credentials/views/credential-form-validation';
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
    metadata: recordToKeyValuePairs(connectionMetadata),
  };
}

async function EditCredentialsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/[credentialId]'>) {
  const { tenantId, projectId, credentialId } = await params;

  try {
    const credential = await fetchCredential(tenantId, projectId, credentialId);
    const initialFormData = await credentialToFormData(credential);
    return (
      <EditCredentialForm
        className="max-w-2xl mx-auto"
        tenantId={tenantId}
        projectId={projectId}
        credential={credential}
        initialFormData={initialFormData}
      />
    );
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
}

export default EditCredentialsPage;
