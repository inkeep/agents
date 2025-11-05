'use client';

import { generateIdFromName } from '@inkeep/agents-core/client-exports';
import { CredentialStoreType } from '@inkeep/agents-core/types';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { CredentialFormData } from '@/components/credentials/views/credential-form-validation';
import { createCredentialInStore } from '@/lib/api/credentialStores';
import { updateExternalAgent } from '@/lib/api/external-agents';
import { updateMCPTool } from '@/lib/api/tools';
import { findOrCreateCredential } from '@/lib/utils/credentials-utils';
import { generateId } from '@/lib/utils/id-utils';
import { CredentialForm } from './credential-form';

export function NewCredentialForm() {
  const router = useRouter();
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  const handleCreateCredential = async (data: CredentialFormData) => {
    try {
      const newCredentialId = generateId();

      let newCredential: Credential | undefined;
      let credentialKeyToSet: string;
      let credentialValueToSet: string;
      let retrievalParams: Record<string, string>;

      switch (data.credentialStoreType) {
        case CredentialStoreType.nango: {
          credentialKeyToSet = JSON.stringify({
            connectionId: newCredentialId,
            providerConfigKey: newCredentialId,
            integrationDisplayName: data.name.trim(),
          });
          credentialValueToSet = data.apiKeyToSet;
          retrievalParams = {
            connectionId: newCredentialId,
            providerConfigKey: newCredentialId,
            provider: 'private-api-bearer',
            authMode: 'API_KEY',
          };
          break;
        }
        case CredentialStoreType.keychain: {
          const idFromName = generateIdFromName(data.name.trim());
          credentialKeyToSet = idFromName;
          credentialValueToSet = JSON.stringify({
            access_token: data.apiKeyToSet,
          });
          retrievalParams = {
            key: idFromName,
          };
          break;
        }
        default:
          throw new Error(`Unsupported credential store type: ${data.credentialStoreType}`);
      }

      await createCredentialInStore({
        tenantId,
        projectId,
        storeId: data.credentialStoreId,
        key: credentialKeyToSet,
        value: credentialValueToSet,
        metadata: data.metadata as Record<string, string>,
      });

      newCredential = await findOrCreateCredential(tenantId, projectId, {
        id: newCredentialId,
        name: data.name.trim(),
        type: data.credentialStoreType,
        credentialStoreId: data.credentialStoreId,
        retrievalParams,
      });

      if (data.selectedTool && newCredential) {
        const updatedTool = {
          credentialReferenceId: newCredential.id,
        };
        await updateMCPTool(tenantId, projectId, data.selectedTool, updatedTool);
      }

      if (data.selectedExternalAgent && newCredential) {
        const updatedExternalAgent = {
          credentialReferenceId: newCredential.id,
        };
        await updateExternalAgent(
          tenantId,
          projectId,
          data.selectedExternalAgent,
          updatedExternalAgent
        );
      }

      toast.success('Credential created successfully');
      router.push(`/${tenantId}/projects/${projectId}/credentials`);
    } catch (error) {
      console.error('Failed to create credential:', error);
      toast.error('Failed to create credential. Please try again.');
    }
  };

  return (
    <CredentialForm
      onCreateCredential={handleCreateCredential}
      tenantId={tenantId}
      projectId={projectId}
    />
  );
}
