import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { ViewMCPServerDetails } from '@/components/mcp-servers/view-mcp-server-details';
import { fetchMCPTool } from '@/lib/api/tools';

async function MCPPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/mcp-servers/[mcpServerId]'>) {
  const { mcpServerId, tenantId, projectId } = await params;

  let tool: Awaited<ReturnType<typeof fetchMCPTool>>;
  try {
    tool = await fetchMCPTool(tenantId, projectId, mcpServerId);
  } catch (error) {
    return (
      <FullPageError
        error={error as Error}
        link={`/${tenantId}/projects/${projectId}/mcp-servers`}
        linkText="Back to MCP servers"
        context="MCP server"
      />
    );
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'MCP servers',
          href: `/${tenantId}/projects/${projectId}/mcp-servers`,
        },
        {
          label: tool.name,
          href: `/${tenantId}/projects/${projectId}/mcp-servers/${mcpServerId}`,
        },
      ]}
    >
      <MainContent>
        <ViewMCPServerDetails tool={tool} tenantId={tenantId} projectId={projectId} />
      </MainContent>
    </BodyTemplate>
  );
}

export default MCPPage;
