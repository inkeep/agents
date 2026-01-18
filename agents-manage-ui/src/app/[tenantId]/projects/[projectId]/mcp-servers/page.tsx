import { Plus } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { MCPToolsList } from '@/components/mcp-servers/mcp-tools-list';
import { Button } from '@/components/ui/button';
import { fetchMCPTools } from '@/lib/api/tools';
import { getErrorCode } from '@/lib/utils/error-serialization';

const mcpServerDescription = 'Create MCP servers that agents can use to access external services.';

async function MCPServersPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/mcp-servers'>) {
  const { tenantId, projectId } = await params;

  try {
    const tools = await fetchMCPTools(tenantId, projectId);
    const content = tools.length ? (
      <>
        <PageHeader
          title="MCP servers"
          description={mcpServerDescription}
          action={
            <Button asChild={true}>
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
    );
    return <BodyTemplate breadcrumbs={['MCP servers']}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="MCP servers" />;
  }
}

export default MCPServersPage;
