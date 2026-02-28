import { CredentialNameBadge } from '@/components/credentials/credential-name-badge';
import FullPageError from '@/components/errors/full-page-error';
import { ViewMCPServerDetailsProjectScope } from '@/components/mcp-servers/view-mcp-server-details-project-scope';
import { ViewMCPServerDetailsUserScope } from '@/components/mcp-servers/view-mcp-server-details-user-scope';
import { fetchMCPTool } from '@/lib/api/tools';
import { getErrorCode } from '@/lib/utils/error-serialization';

async function MCPPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/mcp-servers/[mcpServerId]'>) {
  const { mcpServerId, tenantId, projectId } = await params;

  try {
    const tool = await fetchMCPTool(tenantId, projectId, mcpServerId);
    return tool.credentialScope === 'user' ? (
      <ViewMCPServerDetailsUserScope tool={tool} tenantId={tenantId} projectId={projectId} />
    ) : (
      <ViewMCPServerDetailsProjectScope
        tool={tool}
        credentialBadge={
          tool.credentialReferenceId ? (
            <CredentialNameBadge
              tenantId={tenantId}
              projectId={projectId}
              credentialReferenceId={tool.credentialReferenceId}
            />
          ) : undefined
        }
        tenantId={tenantId}
        projectId={projectId}
      />
    );
  } catch (error) {
    return (
      <FullPageError
        errorCode={getErrorCode(error)}
        link={`/${tenantId}/projects/${projectId}/mcp-servers`}
        linkText="Back to MCP servers"
        context="MCP server"
      />
    );
  }
}

export default MCPPage;
