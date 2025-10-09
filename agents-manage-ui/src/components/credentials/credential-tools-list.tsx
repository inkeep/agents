import Link from 'next/link';
import { Label } from '@/components/ui/label';
import type { McpTool } from '@inkeep/agents-core';

interface CredentialToolsListProps {
  tools?: McpTool[];
  label?: string;
  tenantId?: string;
  projectId?: string;
}

interface ToolItemProps {
  tool: McpTool;
  tenantId?: string;
  projectId?: string;
}

function ToolItem({ tool, tenantId, projectId }: ToolItemProps) {
  const canNavigate = tenantId && projectId;
  const href = canNavigate
    ? `/${tenantId}/projects/${projectId}/mcp-servers/${tool.id}`
    : undefined;

  const content = (
    <>
      <div className="flex items-center gap-3">
        <div>
          <p className="font-medium text-sm">{tool.name}</p>
          <p className="text-xs text-muted-foreground">
            {tool.config.type === 'mcp' ? tool.config.mcp.server.url : ''}
          </p>
        </div>
      </div>
    </>
  );

  if (canNavigate && href) {
    return (
      <Link
        href={href}
        className="flex items-center justify-between p-3 bg-background border rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 bg-background border rounded-md">
      {content}
    </div>
  );
}

export function CredentialToolsList({
  tools,
  label = 'MCP servers using this credential',
  tenantId,
  projectId,
}: CredentialToolsListProps) {
  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      {tools && tools.length > 0 ? (
        <div className="space-y-2">
          {tools.map((tool) => (
            <ToolItem key={tool.id} tool={tool} tenantId={tenantId} projectId={projectId} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground p-3 py-2 bg-gray-100/80 dark:bg-sidebar rounded-md">
          No MCP servers are currently using this credential
        </div>
      )}
    </div>
  );
}
