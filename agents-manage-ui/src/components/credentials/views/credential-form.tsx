'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CredentialStoreType } from '@inkeep/agents-core/client-exports';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericKeyValueInput } from '@/components/form/generic-key-value-input';
import { GenericSelect } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form } from '@/components/ui/form';
import { InfoCard } from '@/components/ui/info-card';
import {
  type CredentialStoreStatus,
  listCredentialStores,
} from '@/lib/api/credentialStores';
import { fetchMCPTools } from '@/lib/api/tools';
import type { MCPTool } from '@/lib/types/tools';
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
  credentialStoreId: '',
  credentialStoreType: 'nango',
  selectedTool: undefined,
};

export function CredentialForm({ onCreateCredential, tenantId, projectId }: CredentialFormProps) {
  const [availableMCPServers, setAvailableMCPServers] = useState<MCPTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [shouldLinkToServer, setShouldLinkToServer] = useState(false);
  const [credentialStores, setCredentialStores] = useState<CredentialStoreStatus[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);

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
        setAvailableMCPServers(toolsWithoutCredentials);
      } catch (err) {
        console.error('Failed to load MCP tools:', err);
      } finally {
        setToolsLoading(false);
      }
    };

    loadAvailableTools();
  }, [tenantId, projectId]);

  useEffect(() => {
    const loadCredentialStores = async () => {
      try {
        const stores = await listCredentialStores(tenantId, projectId);
        setCredentialStores(stores);

        // Auto-select preferred store: prioritize Nango, then other available non-memory stores
        const availableStores = stores.filter(
          (store) => store.available && store.type !== 'memory'
        );
        if (availableStores.length > 0) {
          // First try to find Nango store
          const nangoStore = availableStores.find((store) => store.type === 'nango');
          const preferredStore = nangoStore || availableStores[0];

          // Only set values if form doesn't already have a credentialStoreId value
          const currentStoreId = form.getValues('credentialStoreId');
          if (!currentStoreId) {
            form.setValue('credentialStoreId', preferredStore.id, { shouldValidate: true });
            form.setValue('credentialStoreType', preferredStore.type as 'keychain' | 'nango', { shouldValidate: true });
          }
        }
      } catch (err) {
        console.error('Failed to load credential stores:', err);
      } finally {
        setStoresLoading(false);
      }
    };

    loadCredentialStores();
  }, [tenantId, projectId, form.getValues, form.setValue]);

  // Handle checkbox state changes
  useEffect(() => {
    if (!shouldLinkToServer) {
      // Clear the selectedTool field when not linking to server
      form.setValue('selectedTool', undefined);
    }
  }, [shouldLinkToServer, form]);

  useEffect(() => {
    const subscription = form.watch((value: any, { name }: any) => {
      if (name === 'credentialStoreId' && value.credentialStoreId) {
        const selectedStore = credentialStores.find(
          (store) => store.id === value.credentialStoreId
        );
        if (selectedStore && selectedStore.type !== 'memory') {
          form.setValue('credentialStoreType', selectedStore.type);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, credentialStores]);

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
      ...availableMCPServers.map((tool) => ({
        value: tool.id,
        label: `${tool.name} - ${tool.config.type === 'mcp' ? tool.config.mcp.server.url : ''}`,
      })),
    ],
    [availableMCPServers, toolsLoading]
  );

  const credentialStoreOptions = useMemo(() => {
    if (storesLoading) {
      return [
        {
          value: 'loading',
          label: 'Loading credential stores...',
          disabled: true,
        },
      ];
    }

    const availableStores = credentialStores.filter(
      (store) => store.available && store.type !== 'memory'
    );

    if (availableStores.length === 0) {
      return [
        {
          value: 'none',
          label: 'No credential stores available',
          disabled: true,
        },
      ];
    }

    const options = availableStores.map((store) => ({
      value: store.id,
      label: `${store.type === 'keychain' ? 'Keychain Store' : 'Nango Store'} (${store.id})`,
    }));

    return options;
  }, [credentialStores, storesLoading]);

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
              label="API key"
              placeholder="e.g., sk-1234567890abcdef1234567890abcdef"
              isRequired
            />
            <InfoCard title="How this works">
              <p>
                When your agent connects to the MCP server, this API key will be automatically sent
                as an authentication header:
              </p>
              <p className="my-2">
                <code className="bg-background px-1.5 py-0.5 rounded border">
                  Authorization: Bearer your-api-key-here
                </code>
              </p>
              <p>This ensures secure access to the server's tools and data.</p>
            </InfoCard>
          </div>

          {!storesLoading && form.watch('credentialStoreType') === CredentialStoreType.nango && (
            <div className="space-y-3">
              <GenericKeyValueInput
                control={form.control}
                name="metadata"
                label="Metadata (optional)"
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
                  <code className="bg-background px-1.5 py-0.5 rounded border mx-1">X-API-Key</code>
                  <code className="bg-background px-1.5 py-0.5 rounded border mx-1">
                    Content-Type
                  </code>
                </p>
              </InfoCard>
            </div>
          )}

          {/* Credential Store Selection Section */}
          <div className="space-y-3">
            <GenericSelect
              isRequired
              control={form.control}
              name="credentialStoreId"
              label="Credential store"
              options={credentialStoreOptions}
              key={`credential-store-${credentialStores.length}-${storesLoading}`} // Force re-render when stores change
            />
          </div>

          {/* Tool Selection Section */}
          {availableMCPServers.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 relative">
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
                  selectTriggerClassName="w-full"
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
