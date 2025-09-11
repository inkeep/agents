'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CredentialStoreType } from '@inkeep/agents-core/client-exports';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CredentialToolsList } from '@/components/credentials/credential-tools-list';
import { GenericInput } from '@/components/form/generic-input';
import { GenericKeyValueInput } from '@/components/form/generic-key-value-input';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
}

function getCredentialType(credential: Credential) {
  if (credential.retrievalParams?.provider === 'private-api-bearer') {
    return 'Bearer Auth';
  }

  if (credential.retrievalParams && 'authMode' in credential.retrievalParams) {
    return credential.retrievalParams.authMode as string;
  }

  return credential.type;
}

export function EditCredentialForm({
  tenantId,
  projectId,
  credential,
  initialFormData,
}: EditCredentialFormProps) {
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(editCredentialFormSchema),
    defaultValues: initialFormData,
  });

  const { isSubmitting } = form.formState;

  const handleUpdateCredential = async (formData: EditCredentialFormData) => {
    try {
      // Update credential metadata in our database
      await updateCredential(tenantId, projectId, credential.id, {
        retrievalParams: {
          ...credential.retrievalParams,
          ...formData.metadata,
        },
      });

      // Update connection metadata in Nango if we have connection info
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Credential Details Section */}
        <div className="space-y-8">
          <GenericInput
            control={form.control}
            name="name"
            label="Name"
            placeholder="e.g., production-api-key"
            disabled={true}
          />

          {/* Credential Type Display */}
          <div className="space-y-3">
            <Label>Credential Type</Label>
            <Input type="text" disabled={true} value={getCredentialType(credential)} />
            {getCredentialType(credential) === 'Bearer Auth' && (
              <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-md">
                <p className="mb-2">
                  <strong>How this works:</strong> When your agent connects to the MCP server, this
                  API key will be automatically sent as an authentication header:
                </p>
                <p>
                  <code className="bg-background px-1.5 py-0.5 rounded border mx-1">
                    Authorization: Bearer your-api-key-here
                  </code>
                </p>
                <p className="mt-2 text-muted-foreground/80">
                  This ensures secure access to the server's tools and data.
                </p>
              </div>
            )}
          </div>

          {/* Metadata Section */}
          {credential.type === CredentialStoreType.nango && (
            <div className="space-y-3">
              <GenericKeyValueInput
                control={form.control}
                name="metadata"
                label="Metadata (Optional)"
                keyPlaceholder="Header name (e.g., X-API-Key)"
                valuePlaceholder="Header value"
              />
              <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-md">
                <p className="mb-2">
                  Add extra headers to be included with authentication requests.
                </p>
                <p>
                  Examples:{' '}
                  <code className="bg-background px-1.5 py-0.5 rounded border mx-1">
                    User-Agent
                  </code>
                  <code className="bg-background px-1.5 py-0.5 rounded border mx-1">X-API-Key</code>
                  <code className="bg-background px-1.5 py-0.5 rounded border mx-1">
                    Content-Type
                  </code>
                </p>
              </div>
            </div>
          )}

          {/* MCP Servers Using This Credential */}
          <CredentialToolsList tools={credential.tools} tenantId={tenantId} projectId={projectId} />
        </div>

        <div className="flex gap-3 pt-4">
          {credential.type === CredentialStoreType.nango && (
            <Button type="submit" disabled={isSubmitting}>
              Save
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
