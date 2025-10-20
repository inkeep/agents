import { Plus } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { MCPToolsList } from '@/components/mcp-servers/mcp-tools-list';
import { Button } from '@/components/ui/button';
import { fetchMCPTools } from '@/lib/api/tools';

const mcpServerDescription = 'Create MCP servers that agents can use to access external services.';

async function MCPServersPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/mcp-servers'>) {
  const { tenantId, projectId } = await params;

  let tools: Awaited<ReturnType<typeof fetchMCPTools>>;
  try {
    tools = await fetchMCPTools(tenantId, projectId);
  } catch (error) {
    return <FullPageError error={error as Error} context="MCP servers" />;
  }

  return (
    <BodyTemplate breadcrumbs={[{ label: 'MCP servers' }]}>
      <MainContent className="min-h-full">
        {tools.length > 0 ? (
          <>
            <PageHeader
              title="MCP servers"
              description={mcpServerDescription}
              action={
                <Button asChild>
                  <Link
                    href={`/${tenantId}/projects/${projectId}/mcp-servers/new`}
                    className="flex items-center gap-2"
                  >
                    <Plus className="size-4" />
                    New MCP server
                  </Link>
                </Button>
              }
            />
            <MCPToolsList tools={tools} />
          </>
        ) : (
          <EmptyState
            title="No MCP servers yet."
            description={mcpServerDescription}
            link={`/${tenantId}/projects/${projectId}/mcp-servers/new`}
            linkText="Create MCP server"
          />
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default MCPServersPage;
