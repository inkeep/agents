'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { detectAuthenticationRequired, MCPTransportType } from '@inkeep/agents-core/client-exports';
import { nanoid } from 'nanoid';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { InfoCard } from '@/components/ui/info-card';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import type { Credential } from '@/lib/api/credentials';
import { createMCPTool, updateMCPTool } from '@/lib/api/tools';
import type { MCPTool } from '@/lib/types/tools';
import { ActiveToolsSelector } from './active-tools-selector';
import { type MCPToolFormData, mcpToolSchema } from './validation';

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
      // handle oauth login
      if (data.credentialReferenceId === 'oauth') {
        const toolId = nanoid();

        const isAuthenticationRequired = await detectAuthenticationRequired({
          serverUrl: data.config.mcp.server.url,
          toolId,
        });

        if (!isAuthenticationRequired) {
          toast.error(
            'This MCP server does not support OAuth authentication. Please select a different credential.'
          );
          return;
        }

        const mcpToolData = {
          id: toolId,
          name: data.name,
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
          imageUrl: data.imageUrl,
        };

        const newTool = await createMCPTool(tenantId, projectId, mcpToolData);

        handleOAuthLogin({
          toolId: newTool.id,
          mcpServerUrl: data.config.mcp.server.url,
          toolName: data.name,
        });

        return;
      }

      // Transform form data to API format
      const transformedData = {
        ...data,
        credentialReferenceId:
          data.credentialReferenceId === 'none' ? null : data.credentialReferenceId,
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
          id: nanoid(),
        });
        toast.success('MCP server created successfully');
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${newTool.id}`);
      }
    } catch (error) {
      console.error(`Failed to ${mode} MCP tool:`, error);
      toast.error(`Failed to ${mode} MCP server. Please try again.`);
    }
  };

  return (
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
            name="credentialReferenceId"
            label="Credential"
            placeholder="Select a credential"
            options={[
              { value: 'oauth', label: 'OAuth' },
              { value: 'none', label: 'No Authentication' },
              ...credentials.map((credential) => ({
                value: credential.id,
                label: credential.id,
              })),
            ]}
          />
          <InfoCard title="How this works">
            <div className="space-y-2">
              <p>
                Select <code className="bg-background px-1.5 py-0.5 rounded border">OAuth</code> to
                authenticate with the MCP server's OAuth flow, which will start after you click
                "Create".
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

        {mode === 'update' && (
          <ActiveToolsSelector
            control={form.control}
            name="config.mcp.toolsConfig"
            label="Tools"
            availableTools={tool?.availableTools || []}
            description="Select which tools should be enabled for this MCP server"
          />
        )}

        <Button type="submit" disabled={isSubmitting}>
          {mode === 'update' ? 'Save' : 'Create'}
        </Button>
      </form>
    </Form>
  );
}
