import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { ViewMCPServerDetails } from '@/components/mcp-servers/view-mcp-server-details';
import { fetchMCPTool } from '@/lib/api/tools';

interface MCPPageProps {
  params: Promise<{ mcpServerId: string; tenantId: string; projectId: string }>;
}

async function MCPPage({ params }: MCPPageProps) {
  const { mcpServerId, tenantId, projectId } = await params;
  const tool = await fetchMCPTool(tenantId, projectId, mcpServerId);

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
