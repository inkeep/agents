'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MCPTransportType } from '@inkeep/agents-core/client-exports';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { InfoCard } from '@/components/ui/info-card';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import {
  createToolAction,
  deleteToolAction,
  detectOAuthServerAction,
  updateToolAction,
} from '@/lib/actions/tools';
import type { Credential } from '@/lib/api/credentials';
import { useMcpToolInvalidation } from '@/lib/query/mcp-tools';
import type { MCPTool } from '@/lib/types/tools';
import { cn } from '@/lib/utils';
import { generateId } from '@/lib/utils/id-utils';
import { ActiveToolsSelector } from './active-tools-selector';
import { CredentialScopeEnum, type MCPToolFormData, mcpToolSchema } from './validation';

interface MCPServerFormProps {
  initialData?: MCPToolFormData;
  tool?: MCPTool;
  credentials: Credential[];
  tenantId: string;
  projectId: string;
  className?: string;
}

const defaultValues: MCPToolFormData = {
  name: '',
  config: {
    type: 'mcp' as const,
    mcp: {
      server: {
        url: '',
      },
      transport: {
        type: MCPTransportType.streamableHttp,
      },
      toolsConfig: { type: 'all' },
      toolOverrides: {},
      prompt: '',
    },
  },
  imageUrl: '', // Initialize as empty string to avoid uncontrolled/controlled warning
  credentialReferenceId: 'oauth',
  credentialScope: CredentialScopeEnum.project,
};

export function MCPServerForm({
  initialData,
  className,
  tool,
  credentials,
  tenantId,
  projectId,
}: MCPServerFormProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm({
    resolver: zodResolver(mcpToolSchema),
    defaultValues: {
      ...defaultValues,
      ...initialData,
    },
  });

  const { handleOAuthLogin } = useOAuthLogin({
    tenantId,
    projectId,
  });

  const invalidateMcpToolCache = useMcpToolInvalidation(tenantId, projectId);

  const { isSubmitting } = form.formState;

  // Helper function to filter active tools against available tools
  const getActiveTools = (toolsConfig: MCPToolFormData['config']['mcp']['toolsConfig']) => {
    if (toolsConfig.type === 'all') return undefined;

    const availableToolNames = tool?.availableTools?.map((t) => t.name) || [];
    return toolsConfig.tools.filter((toolName) => availableToolNames.includes(toolName));
  };

  const onSubmit = async (data: MCPToolFormData) => {
    const mode = tool ? 'update' : 'create';
    try {
      const mcpServerName = data.name;
      const isUserScoped = data.credentialScope === CredentialScopeEnum.user;

      // For user-scoped in CREATE mode: skip OAuth (users connect later from detail page)
      if (isUserScoped && mode === 'create') {
        const mcpToolData = {
          id: generateId(),
          name: mcpServerName,
          config: {
            type: 'mcp' as const,
            mcp: {
              server: {
                url: data.config.mcp.server.url,
              },
              transport: {
                type: data.config.mcp.transport.type,
              },
              prompt: data.config.mcp.prompt,
            },
          },
          credentialReferenceId: null,
          credentialScope: CredentialScopeEnum.user,
          imageUrl: data.imageUrl,
        };

        const result = await createToolAction(tenantId, projectId, mcpToolData);
        if (!result.success || !result.data) {
          toast.error(result.error || 'Failed to create MCP server.');
          return;
        }
        await invalidateMcpToolCache();
        toast.success(
          'MCP server created. Users can connect their own accounts from the detail page.'
        );
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${result.data.id}`);
        return;
      }

      // Handle OAuth login for project-scoped in CREATE mode
      if (data.credentialReferenceId === 'oauth' && mode === 'create') {
        const result = await detectOAuthServerAction(data.config.mcp.server.url);

        if (!result.success) {
          toast.error(result.error || 'Failed to detect OAuth support');
          return;
        }

        if (!result.data) {
          toast.error(
            'This MCP server does not support OAuth authentication. Please select a different credential.'
          );
          return;
        }

        const mcpToolData = {
          id: generateId(),
          name: mcpServerName,
          config: {
            type: 'mcp' as const,
            mcp: {
              server: {
                url: data.config.mcp.server.url,
              },
              transport: {
                type: data.config.mcp.transport.type,
              },
              prompt: data.config.mcp.prompt,
            },
          },
          credentialReferenceId: null,
          credentialScope: CredentialScopeEnum.project,
          imageUrl: data.imageUrl,
        };

        const createResult = await createToolAction(tenantId, projectId, mcpToolData);
        if (!createResult.success || !createResult.data) {
          toast.error(createResult.error || 'Failed to create MCP server.');
          return;
        }

        await invalidateMcpToolCache();

        handleOAuthLogin({
          toolId: createResult.data.id,
          mcpServerUrl: data.config.mcp.server.url,
          toolName: mcpServerName,
          credentialScope: data.credentialScope,
        });

        return;
      }

      // Transform form data to API format (for both create and update)
      const transformedData = {
        ...data,
        name: mcpServerName,
        credentialReferenceId:
          data.credentialReferenceId === 'none' ? null : data.credentialReferenceId,
        credentialScope: data.credentialScope,
        config: {
          ...data.config,
          mcp: {
            ...data.config.mcp,
            activeTools: getActiveTools(data.config.mcp.toolsConfig),
          },
        },
      };

      if (tool) {
        const updateResult = await updateToolAction(tenantId, projectId, tool.id, transformedData);
        if (!updateResult.success) {
          toast.error(updateResult.error || 'Failed to update MCP server.');
          return;
        }
        await invalidateMcpToolCache(tool.id);
        toast.success('MCP server updated successfully');
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${tool.id}`);
      } else {
        const createResult = await createToolAction(tenantId, projectId, {
          ...transformedData,
          id: generateId(),
        });
        if (!createResult.success || !createResult.data) {
          toast.error(createResult.error || 'Failed to create MCP server.');
          return;
        }
        await invalidateMcpToolCache();
        toast.success('MCP server created successfully');
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${createResult.data.id}`);
      }
    } catch (error) {
      console.error(`Failed to ${mode} MCP tool:`, error);
      toast.error(`Failed to ${mode} MCP server. Please try again.`);
    }
  };

  const handleDelete = async () => {
    if (!tool) return;

    setIsDeleting(true);
    try {
      // Don't revalidate to avoid Next.js trying to refetch the deleted resource on current page
      const result = await deleteToolAction(tenantId, projectId, tool.id, false);
      if (result.success) {
        setIsDeleteOpen(false);
        toast.success('MCP server deleted.');
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers`);
      } else {
        toast.error(result.error || 'Failed to delete MCP server.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className={cn('space-y-8', className)}>
          <GenericInput
            control={form.control}
            name="name"
            label="Name"
            placeholder="MCP server"
            isRequired
          />
          <GenericInput
            control={form.control}
            name="config.mcp.server.url"
            label="URL"
            placeholder="https://api.example.com/mcp"
            isRequired
            disabled={tool?.isWorkApp}
          />
          <GenericSelect
            control={form.control}
            selectTriggerClassName="w-full"
            name="config.mcp.transport.type"
            label="Transport type"
            placeholder="Select transport type"
            options={[
              {
                value: MCPTransportType.streamableHttp,
                label: 'Streamable HTTP',
              },
              { value: MCPTransportType.sse, label: 'Server-Sent Events (SSE)' },
            ]}
          />
          <GenericInput
            control={form.control}
            name="imageUrl"
            label="Image URL (optional)"
            placeholder="https://example.com/icon.png or data:image/png;base64,..."
          />
          <GenericTextarea
            control={form.control}
            name="config.mcp.prompt"
            label="Prompt (optional)"
            placeholder={
              tool?.capabilities?.serverInstructions
                ? `Leave empty to use server default: "${tool.capabilities.serverInstructions.slice(0, 100)}${tool.capabilities.serverInstructions.length > 100 ? '...' : ''}"`
                : 'Override the instructions sent by the MCP server...'
            }
          />

          {/* Hide credential options for workapp tools (they manage auth differently) */}
          {!tool?.isWorkApp && (
            <>
              <div className="space-y-3">
                <GenericSelect
                  control={form.control}
                  selectTriggerClassName="w-full"
                  name="credentialScope"
                  label="Credential Scope"
                  placeholder="Select credential scope"
                  disabled={!!tool}
                  options={[
                    {
                      value: CredentialScopeEnum.project,
                      label: 'Project (shared team credential)',
                    },
                    {
                      value: CredentialScopeEnum.user,
                      label: 'User (each user connects their own)',
                    },
                  ]}
                />
                <InfoCard title="Credential Scope">
                  <div className="space-y-2">
                    <p>
                      <strong>Project:</strong> One shared credential for the entire team. You'll
                      connect an OAuth account now that everyone will use.
                    </p>
                    <p>
                      <strong>User:</strong> Each team member connects their own account. No OAuth
                      required during setup — users connect later from the detail page.
                    </p>
                  </div>
                </InfoCard>
              </div>

              {form.watch('credentialScope') === CredentialScopeEnum.project && (
                <div className="space-y-3">
                  <GenericSelect
                    control={form.control}
                    selectTriggerClassName="w-full"
                    name="credentialReferenceId"
                    label="Credential"
                    placeholder="Select a credential"
                    options={[
                      { value: 'oauth', label: 'OAuth' },
                      { value: 'none', label: 'No Authentication' },
                      ...credentials.map((credential) => {
                        const displayName = credential.name || credential.id;
                        const hasDuplicateName = credentials.some(
                          (c) => c.id !== credential.id && c.name === credential.name
                        );
                        return {
                          value: credential.id,
                          label:
                            hasDuplicateName || !credential.name
                              ? `${displayName} (${credential.id.slice(0, 8)})`
                              : credential.name,
                        };
                      }),
                    ]}
                  />
                  <InfoCard title="How this works">
                    <div className="space-y-2">
                      <p>
                        Select{' '}
                        <code className="bg-background px-1.5 py-0.5 rounded border">OAuth</code> to
                        authenticate with the MCP server's OAuth flow, which will start after you
                        click "Create".
                      </p>
                      <p>
                        Select{' '}
                        <code className="bg-background px-1.5 py-0.5 rounded border">
                          No Authentication
                        </code>{' '}
                        to skip authentication (i.e. none required or add a credential later).
                      </p>
                      <p>Or select from the existing credentials you have already created.</p>
                    </div>
                  </InfoCard>
                </div>
              )}
            </>
          )}

          {tool && (
            <>
              <ActiveToolsSelector
                control={form.control}
                name="config.mcp.toolsConfig"
                label="Tools"
                availableTools={tool?.availableTools || []}
                description="Select which tools should be enabled for this MCP server"
                toolOverrides={form.watch('config.mcp.toolOverrides') || {}}
                onToolOverrideChange={(toolName, override) => {
                  const currentOverrides = form.watch('config.mcp.toolOverrides') || {};
                  const newOverrides = { ...currentOverrides };

                  if (Object.keys(override).length === 0) {
                    // Remove override if empty
                    delete newOverrides[toolName];
                  } else {
                    newOverrides[toolName] = override;
                  }

                  form.setValue('config.mcp.toolOverrides', newOverrides);
                  form.trigger('config.mcp.toolOverrides');
                }}
              />
            </>
          )}

          <div className="flex w-full justify-between">
            <Button type="submit" disabled={isSubmitting}>
              {tool ? 'Save' : 'Create'}
            </Button>
            {tool && (
              <DialogTrigger asChild>
                <Button type="button" variant="destructive-outline">
                  Delete Server
                </Button>
              </DialogTrigger>
            )}
          </div>
        </form>
      </Form>
      {isDeleteOpen && tool && (
        <DeleteConfirmation
          itemName={tool.name || 'this MCP server'}
          isSubmitting={isDeleting}
          onDelete={handleDelete}
        />
      )}
    </Dialog>
  );
}
