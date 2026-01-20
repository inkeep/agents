import { Plus } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { MCPToolItem } from '@/components/mcp-servers/mcp-tool-item';
import { Button } from '@/components/ui/button';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchMCPTools } from '@/lib/api/tools';
import { getErrorCode } from '@/lib/utils/error-serialization';

const mcpServerDescription = 'Create MCP servers that agents can use to access external services.';

async function MCPServersPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/mcp-servers'>) {
  const { tenantId, projectId } = await params;

  try {
    const tools = await fetchMCPTools(tenantId, projectId);
    return tools.length ? (
      <>
        <PageHeader
          title={STATIC_LABELS['mcp-servers']}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {tools.map((tool) => (
            <MCPToolItem key={tool.id} tenantId={tenantId} projectId={projectId} tool={tool} />
          ))}
        </div>
      </>
    ) : (
      <EmptyState
        title="No MCP servers yet."
        description={mcpServerDescription}
        link={`/${tenantId}/projects/${projectId}/mcp-servers/new`}
        linkText="Create MCP server"
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="MCP servers" />;
  }
}

export default MCPServersPage;
