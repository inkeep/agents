import { Plus } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { MCPToolsList } from '@/components/mcp-servers/mcp-tools-list';
import { Button } from '@/components/ui/button';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { fetchMCPTools } from '@/lib/api/tools';
import { getErrorCode } from '@/lib/utils/error-serialization';

const mcpServerDescription = 'Create MCP servers that agents can use to access external services.';

async function MCPServersPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/mcp-servers'>) {
  const { tenantId, projectId } = await params;

  try {
    const [tools, permissions] = await Promise.all([
      fetchMCPTools(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);
    const canEdit = permissions.canEdit;
    const content = tools.length ? (
      <>
        <PageHeader
          title="MCP servers"
          description={mcpServerDescription}
          action={
            canEdit ? (
              <Button asChild>
                <Link
                  href={`/${tenantId}/projects/${projectId}/mcp-servers/new`}
                  className="flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  New MCP server
                </Link>
              </Button>
            ) : undefined
          }
        />
        <MCPToolsList tools={tools} />
      </>
    ) : (
      <EmptyState
        title="No MCP servers yet."
        description={mcpServerDescription}
        link={canEdit ? `/${tenantId}/projects/${projectId}/mcp-servers/new` : undefined}
        linkText={canEdit ? 'Create MCP server' : undefined}
      />
    );
    return <BodyTemplate breadcrumbs={['MCP servers']}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="MCP servers" />;
  }
}

export default MCPServersPage;
