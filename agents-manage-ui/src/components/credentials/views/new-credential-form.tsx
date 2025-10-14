'use client';

import { generateIdFromName } from '@inkeep/agents-core/client-exports';
import { CredentialStoreType } from '@inkeep/agents-core/types';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { CredentialFormData } from '@/components/credentials/views/credential-form-validation';
import { createCredentialInStore } from '@/lib/api/credentialStores';
import { updateMCPTool } from '@/lib/api/tools';
import { createNangoApiKeyConnection } from '@/lib/mcp-tools/nango';
import { findOrCreateCredential } from '@/lib/utils/credentials-utils';
import { CredentialForm } from './credential-form';

export function NewCredentialForm() {
  const router = useRouter();
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  const handleCreateCredential = async (data: CredentialFormData) => {
    try {
      const idFromName = generateIdFromName(data.name.trim());

      let newCredential: Credential | undefined;

      if (data.credentialStoreType === CredentialStoreType.nango) {
        const { integration } = await createNangoApiKeyConnection({
          name: idFromName,
          apiKeyToSet: data.apiKeyToSet,
          metadata: data.metadata as Record<string, string>,
        });

        newCredential = await findOrCreateCredential(tenantId, projectId, {
          id: idFromName,
          type: data.credentialStoreType,
          credentialStoreId: data.credentialStoreId,
          retrievalParams: {
            connectionId: idFromName,
            providerConfigKey: integration.unique_key,
            provider: integration.provider,
            authMode: 'API_KEY',
          },
        });
      } else if (data.credentialStoreType === CredentialStoreType.keychain) {
        const keychainStoreValueToSet = JSON.stringify({
          access_token: data.apiKeyToSet,
        });
        
        await createCredentialInStore(
          tenantId,
          projectId,
          data.credentialStoreId,
          idFromName,
          keychainStoreValueToSet
        );

        newCredential = await findOrCreateCredential(tenantId, projectId, {
          id: idFromName,
          type: data.credentialStoreType,
          credentialStoreId: data.credentialStoreId,
          retrievalParams: {
            key: idFromName,
          },
        });
      }

      if (data.selectedTool && newCredential) {
        const updatedTool = {
          credentialReferenceId: newCredential.id,
        };
        await updateMCPTool(tenantId, projectId, data.selectedTool, updatedTool);
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
