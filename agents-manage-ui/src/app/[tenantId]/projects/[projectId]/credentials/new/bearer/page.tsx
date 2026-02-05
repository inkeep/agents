'use client';
import { generateIdFromName } from '@inkeep/agents-core/client-exports';
import { CredentialStoreType } from '@inkeep/agents-core/types';
import { useRouter } from 'next/navigation';
import { use, useEffect } from 'react';
import { toast } from 'sonner';
import { CredentialForm } from '@/components/credentials/views/credential-form';
import { CredentialFormInkeepCloud } from '@/components/credentials/views/credential-form-inkeep-cloud';
import type { CredentialFormOutput } from '@/components/credentials/views/credential-form-validation';
import { useProjectPermissions } from '@/contexts/project';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useAuthSession } from '@/hooks/use-auth';
import { createCredentialInStore } from '@/lib/api/credentialStores';
import { updateExternalAgent } from '@/lib/api/external-agents';
import { updateMCPTool } from '@/lib/api/tools';
import { findOrCreateCredential } from '@/lib/utils/credentials-utils';
import { generateId } from '@/lib/utils/id-utils';

export default function NewCredentialForm({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/new/bearer'>) {
  const router = useRouter();
  const { PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT } = useRuntimeConfig();
  const { tenantId, projectId } = use(params);
  const { user } = useAuthSession();
  const { canEdit } = useProjectPermissions();

  // Redirect if user doesn't have edit permission
  useEffect(() => {
    if (!canEdit) {
      router.replace(`/${tenantId}/projects/${projectId}/credentials`);
    }
  }, [canEdit, router, tenantId, projectId]);

  const handleCreateCredential = async (data: CredentialFormOutput) => {
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
        metadata: data.metadata,
      });

      newCredential = await findOrCreateCredential(tenantId, projectId, {
        id: newCredentialId,
        createdBy: user?.email ?? undefined,
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

  const FormToUse =
    PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true' ? CredentialFormInkeepCloud : CredentialForm;

  return (
    <div className="max-w-2xl mx-auto">
      <FormToUse onCreateCredential={handleCreateCredential} />
    </div>
  );
}
