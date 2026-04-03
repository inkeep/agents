'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CredentialStoreType } from '@inkeep/agents-core/client-exports';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CredentialResourcesList } from '@/components/credentials/credential-resources-list';
import { GenericInput } from '@/components/form/generic-input';
import { GenericKeyValueInput } from '@/components/form/generic-key-value-input';
import { ProviderIcon } from '@/components/icons/provider-icon';
import { Button } from '@/components/ui/button';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { InfoCard } from '@/components/ui/info-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { deleteCredentialAction } from '@/lib/actions/credentials';
import { type Credential, updateCredential } from '@/lib/api/credentials';
import type { NangoIntegrationWithMaskedCredentials } from '@/lib/mcp-tools/nango';
import { setNangoConnectionMetadata } from '@/lib/mcp-tools/nango';
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import { cn } from '@/lib/utils';
import { keyValuePairsToRecord, metadataSchema } from './credential-form-validation';

// Edit-specific validation schema
const editCredentialFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .refine((val) => val.length > 0, 'Name cannot be empty after transformation')
    .refine((val) => val.length <= 50, 'Name must be 50 characters or less'),
  metadata: metadataSchema,
});

export type EditCredentialFormData = z.output<typeof editCredentialFormSchema>;

interface EditCredentialFormProps {
  tenantId: string;
  projectId: string;
  credential: Credential;
  initialFormData: EditCredentialFormData;
  nangoIntegration?: NangoIntegrationWithMaskedCredentials | null;
  className?: string;
}

const normalizeMetadata = (metadata: Record<string, string>): string =>
  JSON.stringify(
    Object.keys(metadata)
      .sort()
      .map((key) => [key, metadata[key]])
  );

const AUTH_SCHEME_LABELS: Record<string, string> = {
  OAUTH2: 'OAuth 2.0',
  OAUTH1: 'OAuth 1.0',
  OAUTH2_CC: 'OAuth 2.0 (Client Credentials)',
  TBA: 'Token-based authentication',
  API_KEY: 'API Key',
  APP: 'App authentication',
  BASIC: 'Basic authentication',
  BASIC_WITH_JWT: 'Basic + JWT authentication',
  BEARER_TOKEN: 'Bearer token authentication',
  CUSTOM: 'Custom authentication',
  APP_STORE: 'App Store authentication',
  BILL: 'Bill authentication',
  SIGNATURE: 'Signature authentication',
  JWT: 'JWT authentication',
  TWO_STEP: 'Two-step authentication',
  TABLEAU: 'Tableau authentication',
  NO_AUTH: 'No authentication',
};

function getCredentialAuthenticationType(credential: Credential): string | undefined {
  if (
    credential.type === CredentialStoreType.nango &&
    credential.retrievalParams?.provider === 'private-api-bearer'
  ) {
    return 'Bearer authentication';
  }

  if (
    credential.type === CredentialStoreType.nango &&
    credential.retrievalParams?.provider === 'mcp-generic'
  ) {
    return 'OAuth';
  }

  if (credential.type === CredentialStoreType.nango && credential.retrievalParams?.authMode) {
    const authMode = credential.retrievalParams.authMode as string;
    return AUTH_SCHEME_LABELS[authMode] ?? authMode;
  }

  if (credential.type === CredentialStoreType.composio) {
    const authScheme = credential.retrievalParams?.authScheme as string | undefined;
    if (authScheme) {
      return AUTH_SCHEME_LABELS[authScheme] ?? authScheme;
    }
    return 'Composio';
  }

  if (
    credential.type === CredentialStoreType.keychain &&
    credential.retrievalParams?.key &&
    typeof credential.retrievalParams?.key === 'string'
  ) {
    if (credential.retrievalParams?.key.startsWith('oauth_token_')) {
      return 'OAuth';
    }

    return 'Bearer authentication';
  }

  return undefined;
}

export function EditCredentialForm({
  tenantId,
  projectId,
  credential,
  initialFormData,
  nangoIntegration,
  className,
}: EditCredentialFormProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT } = useRuntimeConfig();

  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();

  const form = useForm({
    resolver: zodResolver(editCredentialFormSchema),
    defaultValues: initialFormData,
  });

  const { isSubmitting } = form.formState;

  const handleUpdateCredential = async (formData: EditCredentialFormData) => {
    try {
      await updateCredential(tenantId, projectId, credential.id, {
        name: formData.name.trim(),
      });

      const metadataRecord = keyValuePairsToRecord(formData.metadata);
      const initialMetadataRecord = keyValuePairsToRecord(initialFormData.metadata);
      const metadataChanged =
        normalizeMetadata(metadataRecord) !== normalizeMetadata(initialMetadataRecord);
      if (
        credential.retrievalParams?.providerConfigKey &&
        credential.retrievalParams?.connectionId &&
        metadataChanged
      ) {
        await setNangoConnectionMetadata({
          providerConfigKey: credential.retrievalParams.providerConfigKey as string,
          connectionId: credential.retrievalParams.connectionId as string,
          metadata: metadataRecord,
        });
      }

      toast.success('Credential updated successfully');
      router.push(`/${tenantId}/projects/${projectId}/credentials`);
    } catch (err) {
      console.error('Failed to update credential:', err);
      toast(err instanceof Error ? err.message : 'Failed to update credential');
    }
  };

  const onSubmit = async (data: EditCredentialFormData) => {
    await handleUpdateCredential(data);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteCredentialAction(tenantId, projectId, credential.id);
    if (result.success) {
      setIsDeleteOpen(false);
      toast.success('Credential deleted.');
      router.push(`/${tenantId}/projects/${projectId}/credentials`);
    } else {
      toast.error(result.error);
    }
    setIsDeleting(false);
  };

  const credentialAuthenticationType = getCredentialAuthenticationType(credential);
  const forceCredentialType = PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true' ? 'API Key' : undefined;

  return (
    <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className={cn('space-y-8', className)}>
          {/* Credential Details Section */}
          <div className="space-y-8">
            <GenericInput
              control={form.control}
              name="name"
              label="Name"
              placeholder="e.g., production-api-key"
              disabled={!canEdit}
            />

            {/* Credential Type Display */}
            <div className="space-y-3">
              <Label>Credential type</Label>
              <Input
                type="text"
                disabled={true}
                value={credentialAuthenticationType ?? forceCredentialType ?? credential.type}
              />
              {credentialAuthenticationType === 'Bearer authentication' && (
                <InfoCard title="How this works">
                  <p>
                    When your agent connects to the MCP server, this API key will be automatically
                    sent as an authentication header:
                  </p>
                  <p className="my-2">
                    <code className="bg-background px-1.5 py-0.5 rounded border">
                      Authorization: Bearer your-api-key-here
                    </code>
                  </p>
                  <p>This ensures secure access to the server's tools and data.</p>
                </InfoCard>
              )}
            </div>

            {/* Linked App Configuration */}
            {nangoIntegration &&
              !['mcp-generic', 'private-api-bearer'].includes(nangoIntegration.provider) && (
                <div className="space-y-3">
                  <Label>App configuration</Label>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <ProviderIcon provider={nangoIntegration.provider} size={20} />
                      <span className="text-sm font-medium">{nangoIntegration.provider}</span>
                    </div>
                    {nangoIntegration.maskedCredentials?.client_id && (
                      <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
                        <span className="shrink-0">Client ID:</span>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate">
                          {nangoIntegration.maskedCredentials.client_id}
                        </code>
                      </div>
                    )}
                    {nangoIntegration.maskedCredentials?.client_secret && (
                      <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
                        <span className="shrink-0">Secret:</span>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {nangoIntegration.maskedCredentials.client_secret}
                        </code>
                      </div>
                    )}
                    {nangoIntegration.maskedCredentials?.app_id && (
                      <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
                        <span className="shrink-0">App ID:</span>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {nangoIntegration.maskedCredentials.app_id}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* Created By Display */}
            {credential.createdBy && (
              <div className="space-y-3">
                <Label>Created by</Label>
                <Input type="text" disabled={true} value={credential.createdBy} />
              </div>
            )}

            {/* Metadata / Headers Section */}
            {credential.type === CredentialStoreType.nango && (
              <div className="space-y-3">
                <GenericKeyValueInput
                  control={form.control}
                  name="metadata"
                  label="Headers (optional)"
                  keyPlaceholder="Key (e.g. X-API-Key)"
                  valuePlaceholder="Value (e.g. your-api-key)"
                  addButtonLabel="Add header"
                  disabled={!canEdit}
                />
                <InfoCard title="How this works">
                  <p className="mb-2">
                    Add extra headers to be included with authentication requests.
                  </p>
                  <p>
                    Examples:{' '}
                    <code className="bg-background px-1.5 py-0.5 rounded border mx-1">
                      User-Agent
                    </code>
                    <code className="bg-background px-1.5 py-0.5 rounded border mx-1">
                      X-API-Key
                    </code>
                    <code className="bg-background px-1.5 py-0.5 rounded border mx-1">
                      Content-Type
                    </code>
                  </p>
                </InfoCard>
              </div>
            )}

            {/* Resources Using This Credential */}
            <CredentialResourcesList
              tools={credential.tools}
              externalAgents={credential.externalAgents}
              tenantId={tenantId}
              projectId={projectId}
              toolId={credential.toolId || undefined}
            />
          </div>

          {canEdit && (
            <div className="flex w-full justify-between">
              {credential.type === CredentialStoreType.nango && (
                <Button type="submit" disabled={isSubmitting}>
                  Save
                </Button>
              )}
              <DialogTrigger asChild>
                <Button type="button" variant="destructive-outline">
                  Delete Credential
                </Button>
              </DialogTrigger>
            </div>
          )}
        </form>
      </Form>
      {isDeleteOpen && (
        <DeleteConfirmation
          itemName={credential.id || 'this credential'}
          isSubmitting={isDeleting}
          onDelete={handleDelete}
        />
      )}
    </Dialog>
  );
}
