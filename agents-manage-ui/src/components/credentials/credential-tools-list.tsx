import Link from 'next/link';
import { Label } from '@/components/ui/label';

interface Tool {
  id: string;
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown' | 'disabled' | 'needs_auth';
  config: {
    mcp: {
      server: {
        url: string;
      };
    };
  };
}

interface CredentialToolsListProps {
  tools?: Tool[];
  label?: string;
  tenantId?: string;
  projectId?: string;
}

interface ToolItemProps {
  tool: Tool;
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
        <div
          className={`w-2 h-2 rounded-full ${
            tool.status === 'healthy'
              ? 'bg-green-500 dark:bg-green-400'
              : tool.status === 'unhealthy'
                ? 'bg-red-500 dark:bg-red-400'
                : tool.status === 'needs_auth'
                  ? 'bg-yellow-500 dark:bg-yellow-400'
                  : 'bg-muted-foreground'
          }`}
        />
        <div>
          <p className="font-medium text-sm">{tool.name}</p>
          <p className="text-xs text-muted-foreground">{tool.config.mcp.server.url}</p>
        </div>
      </div>
      <div
        className={`px-2 py-1 text-xs rounded-full ${
          tool.status === 'healthy'
            ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : tool.status === 'unhealthy'
              ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              : tool.status === 'needs_auth'
                ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                : 'bg-muted text-muted-foreground'
        }`}
      >
        {tool.status}
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
  label = 'MCP Servers Using This Credential',
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
        <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-md">
          No MCP servers are currently using this credential
        </div>
      )}
    </div>
  );
}
