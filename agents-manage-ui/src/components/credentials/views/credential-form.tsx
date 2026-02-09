'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CredentialStoreType } from '@inkeep/agents-core/client-exports';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericKeyValueInput } from '@/components/form/generic-key-value-input';

import { GenericSelect } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form } from '@/components/ui/form';
import { InfoCard } from '@/components/ui/info-card';
import { useCredentialStoresQuery } from '@/lib/query/credential-stores';
import { useExternalAgentsQuery } from '@/lib/query/external-agents';
import { useMcpToolsQuery } from '@/lib/query/mcp-tools';
import {
  type CredentialFormData,
  type CredentialFormOutput,
  credentialFormSchema,
  keyValuePairsToRecord,
} from './credential-form-validation';

interface CredentialFormProps {
  /** Handler for creating new credentials (receives metadata as record) */
  onCreateCredential: (data: CredentialFormOutput) => Promise<void>;
}

const defaultValues: CredentialFormData = {
  name: '',
  apiKeyToSet: '',
  metadata: [{ key: '', value: '' }],
  credentialStoreId: '',
  credentialStoreType: 'nango',
  selectedTool: undefined,
  selectedExternalAgent: undefined,
};

export function CredentialForm({ onCreateCredential }: CredentialFormProps) {
  'use memo';
  const [shouldLinkToServer, setShouldLinkToServer] = useState(false);
  const [shouldLinkToExternalAgent, setShouldLinkToExternalAgent] = useState(false);

  const form = useForm({
    resolver: zodResolver(credentialFormSchema),
    defaultValues: defaultValues,
  });
  const credentialStoreId = useWatch({ control: form.control, name: 'credentialStoreId' });
  const credentialStoreType = useWatch({ control: form.control, name: 'credentialStoreType' });

  const { isSubmitting } = form.formState;
  const { data: externalAgents, isFetching: externalAgentsLoading } = useExternalAgentsQuery();
  const { data: mcpTools, isFetching: toolsLoading } = useMcpToolsQuery();
  const { data: credentialStores, isFetching: storesLoading } = useCredentialStoresQuery();

  const availableExternalAgents = externalAgents.filter((agent) => !agent.credentialReferenceId);
  const availableMCPServers = mcpTools.filter((tool) => !tool.credentialReferenceId);

  useEffect(() => {
    if (storesLoading) {
      return;
    }

    // Auto-select preferred store: prioritize Nango, then other available non-memory stores
    const availableStores = credentialStores.filter(
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
        form.setValue('credentialStoreType', preferredStore.type as 'keychain' | 'nango', {
          shouldValidate: true,
        });
      }
    }
  }, [form, credentialStores, storesLoading]);

  // Handle checkbox state changes
  useEffect(() => {
    if (!shouldLinkToServer) {
      // Clear the selectedTool field when not linking to server
      form.setValue('selectedTool', undefined);
    }
  }, [shouldLinkToServer, form]);

  useEffect(() => {
    if (!shouldLinkToExternalAgent) {
      // Clear the selectedExternalAgent field when not linking to external agent
      form.setValue('selectedExternalAgent', undefined);
    }
  }, [shouldLinkToExternalAgent, form]);

  useEffect(() => {
    if (!credentialStoreId) {
      return;
    }

    const selectedStore = credentialStores.find((store) => store.id === credentialStoreId);
    if (
      selectedStore &&
      selectedStore.type !== 'memory' &&
      selectedStore.type !== credentialStoreType
    ) {
      form.setValue('credentialStoreType', selectedStore.type);
    }
  }, [credentialStoreId, credentialStoreType, credentialStores, form]);

  const handleLinkToServerChange = (checked: boolean | 'indeterminate') => {
    setShouldLinkToServer(checked === true);
  };

  const handleLinkToExternalAgentChange = (checked: boolean | 'indeterminate') => {
    setShouldLinkToExternalAgent(checked === true);
  };

  const onSubmit = async (data: CredentialFormData) => {
    const isInvalidServerSelection =
      shouldLinkToServer && (data.selectedTool === 'loading' || data.selectedTool === 'error');
    const isInvalidExternalAgentSelection =
      shouldLinkToExternalAgent &&
      (data.selectedExternalAgent === 'loading' || data.selectedExternalAgent === 'error');
    try {
      if (isInvalidServerSelection) {
        toast('Please select a valid MCP server');
        return;
      }

      if (isInvalidExternalAgentSelection) {
        toast('Please select a valid external agent');
        return;
      }

      // Convert metadata array to record for API
      const submitData: CredentialFormOutput = {
        ...data,
        metadata: keyValuePairsToRecord(data.metadata),
      };

      await onCreateCredential(submitData);
    } catch (err) {
      console.error('Failed to create credential:', err);
      toast(err instanceof Error ? err.message : 'Failed to create credential');
    }
  };

  const serverOptions = [
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
  ];

  const externalAgentOptions = [
    ...(externalAgentsLoading
      ? [
          {
            value: 'loading',
            label: 'Loading external agents...',
            disabled: true,
          },
        ]
      : []),
    ...availableExternalAgents.map((agent) => ({
      value: agent.id,
      label: `${agent.name} - ${agent.baseUrl}`,
    })),
  ];

  const availableStores = credentialStores.filter(
    (store) => store.available && store.type !== 'memory'
  );

  const credentialStoreOptions = storesLoading
    ? [
        {
          value: 'loading',
          label: 'Loading credential stores...',
          disabled: true,
        },
      ]
    : availableStores.length
      ? availableStores.map((store) => ({
          value: store.id,
          label: `${store.type === 'keychain' ? 'Keychain Store' : 'Nango Store'} (${store.id})`,
        }))
      : [
          {
            value: 'none',
            label: 'No credential stores available',
            disabled: true,
          },
        ];

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

          {!storesLoading && credentialStoreType === CredentialStoreType.nango && (
            <div className="space-y-3">
              <GenericKeyValueInput
                control={form.control}
                name="metadata"
                label="Headers (optional)"
                keyPlaceholder="Key (e.g. X-API-Key)"
                valuePlaceholder="Value (e.g. your-api-key)"
                addButtonLabel="Add header"
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
              placeholder="Select a credential store"
              selectTriggerClassName="w-full"
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

          {/* External Agent Selection Section */}
          {availableExternalAgents.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 relative">
                <Checkbox
                  id="linkToExternalAgent"
                  checked={shouldLinkToExternalAgent}
                  onCheckedChange={handleLinkToExternalAgentChange}
                />
                <label
                  htmlFor="linkToExternalAgent"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Link this credential to an external agent
                </label>
              </div>

              {shouldLinkToExternalAgent && (
                <GenericSelect
                  control={form.control}
                  name="selectedExternalAgent"
                  label=""
                  options={externalAgentOptions}
                  selectTriggerClassName="w-full"
                  placeholder="Choose an external agent"
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
