'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MCPTransportType } from '@inkeep/agents-core/client-exports';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { InfoCard } from '@/components/ui/info-card';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import { deleteToolAction, detectOAuthServerAction } from '@/lib/actions/tools';
import type { Credential } from '@/lib/api/credentials';
import { createMCPTool, updateMCPTool } from '@/lib/api/tools';
import type { MCPTool } from '@/lib/types/tools';
import { generateId } from '@/lib/utils/id-utils';
import { ActiveToolsSelector } from './active-tools-selector';
import { CredentialScopeEnum, type MCPToolFormData, mcpToolSchema } from './validation';

interface MCPServerFormProps {
  initialData?: MCPToolFormData;
  mode?: 'create' | 'update';
  tool?: MCPTool;
  credentials: Credential[];
  tenantId: string;
  projectId: string;
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
    },
  },
  imageUrl: '', // Initialize as empty string to avoid uncontrolled/controlled warning
  credentialReferenceId: 'oauth',
  credentialScope: CredentialScopeEnum.project,
};

export function MCPServerForm({
  initialData,
  mode = 'create',
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

  const { isSubmitting } = form.formState;

  // Helper function to filter active tools against available tools
  const getActiveTools = (toolsConfig: MCPToolFormData['config']['mcp']['toolsConfig']) => {
    if (toolsConfig.type === 'all') return undefined;

    const availableToolNames = tool?.availableTools?.map((t) => t.name) || [];
    return toolsConfig.tools.filter((toolName) => availableToolNames.includes(toolName));
  };

  const onSubmit = async (data: MCPToolFormData) => {
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
            },
          },
          credentialReferenceId: null,
          credentialScope: CredentialScopeEnum.user,
          imageUrl: data.imageUrl,
        };

        const newTool = await createMCPTool(tenantId, projectId, mcpToolData);
        toast.success(
          'MCP server created. Users can connect their own accounts from the detail page.'
        );
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${newTool.id}`);
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
            },
          },
          credentialReferenceId: null,
          credentialScope: CredentialScopeEnum.project,
          imageUrl: data.imageUrl,
        };

        const newTool = await createMCPTool(tenantId, projectId, mcpToolData);

        handleOAuthLogin({
          toolId: newTool.id,
          mcpServerUrl: data.config.mcp.server.url,
          toolName: mcpServerName,
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

      if (mode === 'update' && tool) {
        await updateMCPTool(tenantId, projectId, tool.id, transformedData);
        toast.success('MCP server updated successfully');
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${tool.id}`);
      } else {
        const newTool = await createMCPTool(tenantId, projectId, {
          ...transformedData,
          id: generateId(),
        });
        toast.success('MCP server created successfully');
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${newTool.id}`);
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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

          <div className="space-y-3">
            <GenericSelect
              control={form.control}
              selectTriggerClassName="w-full"
              name="credentialScope"
              label="Credential Scope"
              placeholder="Select credential scope"
              disabled={mode === 'update'}
              options={[
                { value: CredentialScopeEnum.project, label: 'Project (shared team credential)' },
                { value: CredentialScopeEnum.user, label: 'User (each user connects their own)' },
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
                  ...credentials.map((credential) => ({
                    value: credential.id,
                    label: credential.name,
                  })),
                ]}
              />
              <InfoCard title="How this works">
                <div className="space-y-2">
                  <p>
                    Select <code className="bg-background px-1.5 py-0.5 rounded border">OAuth</code>{' '}
                    to authenticate with the MCP server's OAuth flow, which will start after you
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

          {mode === 'update' && (
            <ActiveToolsSelector
              control={form.control}
              name="config.mcp.toolsConfig"
              label="Tools"
              availableTools={tool?.availableTools || []}
              description="Select which tools should be enabled for this MCP server"
            />
          )}

          <div className="flex w-full justify-between">
            <Button type="submit" disabled={isSubmitting}>
              {mode === 'update' ? 'Save' : 'Create'}
            </Button>
            {mode === 'update' && tool && (
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
