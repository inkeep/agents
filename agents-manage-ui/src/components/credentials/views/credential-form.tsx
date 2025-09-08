'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericKeyValueInput } from '@/components/form/generic-key-value-input';
import { GenericSelect } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form } from '@/components/ui/form';
import { fetchMCPTools, type MCPTool } from '@/lib/api/tools';
import { type CredentialFormData, credentialFormSchema } from './credential-form-validation';

interface CredentialFormProps {
  /** Handler for creating new credentials */
  onCreateCredential: (data: CredentialFormData) => Promise<void>;
  /** Tenant ID */
  tenantId: string;
  /** Project ID */
  projectId: string;
}

const defaultValues: CredentialFormData = {
  name: '',
  apiKeyToSet: '',
  metadata: {},
  selectedTool: undefined,
};

export function CredentialForm({ onCreateCredential, tenantId, projectId }: CredentialFormProps) {
  const [availableTools, setAvailableTools] = useState<MCPTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [shouldLinkToServer, setShouldLinkToServer] = useState(false);

  const form = useForm({
    resolver: zodResolver(credentialFormSchema),
    defaultValues: defaultValues,
  });

  const { isSubmitting } = form.formState;

  useEffect(() => {
    const loadAvailableTools = async () => {
      try {
        const allTools = await fetchMCPTools(tenantId, projectId);
        const toolsWithoutCredentials = allTools.filter((tool) => !tool.credentialReferenceId);
        setAvailableTools(toolsWithoutCredentials);
      } catch (err) {
        console.error('Failed to load MCP tools:', err);
      } finally {
        setToolsLoading(false);
      }
    };

    loadAvailableTools();
  }, [tenantId, projectId]);

  // Handle checkbox state changes
  useEffect(() => {
    if (!shouldLinkToServer) {
      // Clear the selectedTool field when not linking to server
      form.setValue('selectedTool', undefined);
    }
  }, [shouldLinkToServer, form]);

  const handleLinkToServerChange = (checked: boolean | 'indeterminate') => {
    setShouldLinkToServer(checked === true);
  };

  const onSubmit = async (data: CredentialFormData) => {
    try {
      if (
        shouldLinkToServer &&
        (data.selectedTool === 'loading' || data.selectedTool === 'error')
      ) {
        toast('Please select a valid MCP server');
        return;
      }

      await onCreateCredential(data);
    } catch (err) {
      console.error('Failed to create credential:', err);
      toast(err instanceof Error ? err.message : 'Failed to create credential');
    }
  };

  const serverOptions = useMemo(
    () => [
      ...(toolsLoading
        ? [
            {
              value: 'loading',
              label: 'Loading MCP servers...',
              disabled: true,
            },
          ]
        : []),
      ...availableTools.map((tool) => ({
        value: tool.id,
        label: `${tool.name} - ${tool.config.mcp.server.url}`,
      })),
    ],
    [availableTools, toolsLoading]
  );

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
            isRequired
          />

          <div className="space-y-3">
            <GenericInput
              control={form.control}
              name="apiKeyToSet"
              label="API Key"
              placeholder="e.g., sk-1234567890abcdef1234567890abcdef"
              isRequired
            />
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
          </div>

          {/* Metadata Section */}
          <div className="space-y-3">
            <GenericKeyValueInput
              control={form.control}
              name="metadata"
              label="Metadata (Optional)"
              keyPlaceholder="Header name (e.g., X-API-Key)"
              valuePlaceholder="Header value"
            />
            <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-md">
              <p className="mb-2">Add extra headers to be included with authentication requests.</p>
              <p>
                Examples:{' '}
                <code className="bg-background px-1.5 py-0.5 rounded border mx-1">User-Agent</code>
                <code className="bg-background px-1.5 py-0.5 rounded border mx-1">X-API-Key</code>
                <code className="bg-background px-1.5 py-0.5 rounded border mx-1">
                  Content-Type
                </code>
              </p>
            </div>
          </div>

          {/* Tool Selection Section */}
          {availableTools.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="linkToServer"
                  checked={shouldLinkToServer}
                  onCheckedChange={handleLinkToServerChange}
                />
                <label
                  htmlFor="linkToServer"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Link this credential to an MCP server
                </label>
              </div>

              {shouldLinkToServer && (
                <GenericSelect
                  control={form.control}
                  name="selectedTool"
                  label=""
                  options={serverOptions}
                  placeholder="Choose an MCP server"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Credential'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
