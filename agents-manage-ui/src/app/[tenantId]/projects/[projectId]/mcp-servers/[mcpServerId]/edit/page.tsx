import { MCPTransportType } from '@inkeep/agents-core/client-exports';
import FullPageError from '@/components/errors/full-page-error';
import { MCPServerForm } from '@/components/mcp-servers/form/mcp-server-form';
import {
  type CredentialScope,
  CredentialScopeEnum,
  type MCPToolFormData,
} from '@/components/mcp-servers/form/validation';
import { type Credential, fetchCredentials } from '@/lib/api/credentials';
import { fetchMCPTool } from '@/lib/api/tools';
import { checkProjectPermissionOrRedirect } from '@/lib/auth/check-permission-or-redirect';
import type { MCPTool } from '@/lib/types/tools';
import { getErrorCode } from '@/lib/utils/error-serialization';

async function EditMCPPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/mcp-servers/[mcpServerId]/edit'>) {
  const { mcpServerId, tenantId, projectId } = await params;

  await checkProjectPermissionOrRedirect(
    tenantId,
    projectId,
    'edit',
    `/${tenantId}/projects/${projectId}/mcp-servers/${mcpServerId}`
  );

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
        errorCode={getErrorCode(mcpToolResult.reason)}
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
        toolOverrides: mcpTool.config.mcp.toolOverrides || {},
        prompt: mcpTool.config.mcp.prompt || '',
      },
    },
    credentialReferenceId: mcpTool.credentialReferenceId || 'none',
    credentialScope: (mcpTool.credentialScope as CredentialScope) ?? CredentialScopeEnum.project,
    imageUrl: mcpTool.imageUrl?.trim() || undefined,
  };

  return (
    <MCPServerForm
      className="max-w-3xl mx-auto"
      initialData={initialFormData}
      tool={mcpTool}
      credentials={credentials}
      tenantId={tenantId}
      projectId={projectId}
    />
  );
}

export default EditMCPPage;
