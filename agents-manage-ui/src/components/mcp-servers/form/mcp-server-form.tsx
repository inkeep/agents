'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { nanoid } from 'nanoid';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import type { Credential } from '@/lib/api/credentials';
import { createMCPTool, type MCPTool, syncMCPTool, updateMCPTool } from '@/lib/api/tools';
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
        type: 'streamable_http',
      },
      toolsConfig: { type: 'all' },
    },
  },
  imageUrl: '', // Initialize as empty string to avoid uncontrolled/controlled warning
  credentialReferenceId: 'none',
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

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: MCPToolFormData) => {
    try {
      // Transform form data to API format
      const transformedData = {
        ...data,
        credentialReferenceId:
          data.credentialReferenceId === 'none' ? null : data.credentialReferenceId,
        config: {
          ...data.config,
          mcp: {
            server: data.config.mcp.server,
            transport: data.config.mcp.transport,
            // Convert discriminated union to API format: type='all' → activeTools=undefined
            activeTools:
              data.config.mcp.toolsConfig.type === 'all'
                ? undefined
                : data.config.mcp.toolsConfig.tools,
          },
        },
      };

      if (mode === 'update' && tool) {
        await updateMCPTool(tenantId, projectId, tool.id, transformedData);
        await syncMCPTool(tenantId, projectId, tool.id);
        toast.success('MCP server updated successfully');
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${tool.id}`);
      } else {
        const newTool = await createMCPTool(tenantId, projectId, {
          ...transformedData,
          id: nanoid(),
        });
        await syncMCPTool(tenantId, projectId, newTool.id);
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
          placeholder="MCP Server"
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
          name="config.mcp.transport.type"
          label="Transport Type"
          placeholder="Select transport type"
          options={[
            { value: 'streamable_http', label: 'Streamable HTTP' },
            { value: 'sse', label: 'Server-Sent Events (SSE)' },
          ]}
        />
        <GenericInput
          control={form.control}
          name="imageUrl"
          label="Image URL (optional)"
          placeholder="https://example.com/icon.png or data:image/png;base64,..."
        />
        <GenericSelect
          control={form.control}
          name="credentialReferenceId"
          label="Credential"
          placeholder="Select a credential"
          options={[
            { value: 'none', label: 'No Authentication' },
            ...credentials.map((credential) => ({
              value: credential.id,
              label: credential.id,
            })),
          ]}
        />

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
