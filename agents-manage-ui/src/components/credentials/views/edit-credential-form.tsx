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
import { Button } from '@/components/ui/button';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { InfoCard } from '@/components/ui/info-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteCredentialAction } from '@/lib/actions/credentials';
import { type Credential, updateCredential } from '@/lib/api/credentials';
import { setNangoConnectionMetadata } from '@/lib/mcp-tools/nango';

// Edit-specific validation schema
const editCredentialFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .refine((val) => val.length > 0, 'Name cannot be empty after transformation')
    .refine((val) => val.length <= 50, 'Name must be 50 characters or less'),
  metadata: z.record(z.string(), z.string()).default({}),
});

export type EditCredentialFormData = z.output<typeof editCredentialFormSchema>;

interface EditCredentialFormProps {
  tenantId: string;
  projectId: string;
  credential: Credential;
  initialFormData: EditCredentialFormData;
  ref?: string;
}

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
  ref,
}: EditCredentialFormProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

      if (
        credential.retrievalParams?.providerConfigKey &&
        credential.retrievalParams?.connectionId &&
        formData.metadata &&
        Object.keys(formData.metadata).length > 0
      ) {
        await setNangoConnectionMetadata({
          providerConfigKey: credential.retrievalParams.providerConfigKey as string,
          connectionId: credential.retrievalParams.connectionId as string,
          metadata: formData.metadata as Record<string, string>,
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
    try {
      const result = await deleteCredentialAction(tenantId, projectId, credential.id, ref);
      if (result.success) {
        setIsDeleteOpen(false);
        toast.success('Credential deleted.');
        router.push(`/${tenantId}/projects/${projectId}/credentials`);
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const credentialAuthenticationType = getCredentialAuthenticationType(credential);

  return (
    <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Credential Details Section */}
          <div className="space-y-8">
            <GenericInput
              control={form.control}
              name="name"
              label="Name"
              placeholder="e.g., production-api-key"
            />

            {/* Credential Type Display */}
            <div className="space-y-3">
              <Label>Credential type</Label>
              <Input
                type="text"
                disabled={true}
                value={
                  credentialAuthenticationType
                    ? `${credentialAuthenticationType} (${credential.type})`
                    : credential.type
                }
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

            {/* Metadata / Headers Section */}
            {credential.type === CredentialStoreType.nango && (
              <div className="space-y-3">
                <GenericKeyValueInput
                  control={form.control}
                  name="metadata"
                  label="Headers (optional)"
                  keyPlaceholder="Header name (e.g., X-API-Key)"
                  valuePlaceholder="Header value"
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
            />
          </div>

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
