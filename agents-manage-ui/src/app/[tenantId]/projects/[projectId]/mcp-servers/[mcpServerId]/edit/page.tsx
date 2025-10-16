import { MCPTransportType } from '@inkeep/agents-core/client-exports';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { MCPServerForm } from '@/components/mcp-servers/form/mcp-server-form';
import type { MCPToolFormData } from '@/components/mcp-servers/form/validation';
import { type Credential, fetchCredentials } from '@/lib/api/credentials';
import { fetchMCPTool } from '@/lib/api/tools';
import type { MCPTool } from '@/lib/types/tools';

interface EditMCPPageProps {
  params: Promise<{ mcpServerId: string; tenantId: string; projectId: string }>;
}

async function EditMCPPage({ params }: EditMCPPageProps) {
  const { mcpServerId, tenantId, projectId } = await params;

  // Fetch both in parallel with individual error handling
  const [mcpToolResult, credentialsResult] = await Promise.allSettled([
    fetchMCPTool(tenantId, projectId, mcpServerId),
    fetchCredentials(tenantId, projectId),
  ]);

  // Handle MCP tool result (required)
  let mcpTool: MCPTool;
  if (mcpToolResult.status === 'fulfilled') {
    mcpTool = mcpToolResult.value;
  } else {
    console.error('Failed to load MCP tool:', mcpToolResult.reason);
    return (
      <FullPageError
        error={mcpToolResult.reason as Error}
        link={`/${tenantId}/projects/${projectId}/mcp-servers`}
        linkText="Back to MCP servers"
        context="MCP server"
      />
    );
  }

  // Handle credentials result (optional - fallback to empty array)
  let credentials: Credential[] = [];
  if (credentialsResult.status === 'fulfilled') {
    credentials = credentialsResult.value;
  } else {
    console.error('Failed to load credentials:', credentialsResult.reason);
    // Continue without credentials
  }

  // Type guard - this page is only for MCP tools
  if (mcpTool.config.type !== 'mcp') {
    throw new Error('Invalid tool type - expected MCP tool');
  }

  // Convert MCPTool to MCPToolFormData format
  const initialFormData: MCPToolFormData = {
    name: mcpTool.name,
    config: {
      type: 'mcp' as const,
      mcp: {
        server: {
          url: mcpTool.config.mcp.server.url,
        },
        transport: {
          type: mcpTool.config.mcp.transport?.type || MCPTransportType.streamableHttp,
        },
        toolsConfig:
          mcpTool.config.mcp.activeTools === undefined
            ? { type: 'all' as const }
            : {
                type: 'selective' as const,
                tools: mcpTool.config.mcp.activeTools,
              },
      },
    },
    credentialReferenceId: mcpTool.credentialReferenceId || 'none',
    imageUrl: mcpTool.imageUrl?.trim() || undefined,
  };

  // MCPServerForm handles all the form logic

  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'MCP servers',
          href: `/${tenantId}/projects/${projectId}/mcp-servers`,
        },
        {
          label: mcpTool.name,
          href: `/${tenantId}/projects/${projectId}/mcp-servers/${mcpServerId}`,
        },
        { label: 'Edit' },
      ]}
    >
      <MainContent>
        <div className="max-w-2xl mx-auto py-4">
          <MCPServerForm
            initialData={initialFormData}
            mode="update"
            tool={mcpTool}
            credentials={credentials}
            tenantId={tenantId}
            projectId={projectId}
          />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}

export default EditMCPPage;
