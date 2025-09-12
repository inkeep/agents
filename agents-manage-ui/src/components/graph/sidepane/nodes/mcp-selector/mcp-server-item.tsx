import { getActiveTools } from '@/app/utils/active-tools';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MCPTool } from '@/lib/api/tools';

interface MCPServerItemProps {
  mcp: MCPTool;
  onClick: (mcp: MCPTool) => void;
}

export function MCPServerItem({ mcp, onClick }: MCPServerItemProps) {
  const server = mcp.config?.mcp?.server;
  const { id, name, availableTools, imageUrl, config } = mcp;

  const activeTools = getActiveTools({
    availableTools,
    activeTools: config?.mcp?.activeTools,
  });

  const toolCount = activeTools?.length ?? 0;

  return (
    <Button
      variant="unstyled"
      size="unstyled"
      type="button"
      key={id}
      className="w-full p-3 rounded-lg border cursor-pointer transition-colors border-border hover:bg-muted/50 text-left inline-block"
      id={id}
      onClick={() => onClick(mcp)}
    >
      <div className="flex items-start gap-3">
        <MCPToolImage
          imageUrl={imageUrl}
          name={name}
          provider={name}
          size={32}
          className="flex-shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1 gap-2 min-w-0 truncate">
            <span className="font-medium text-sm truncate">{name}</span>
            {availableTools && (
              <div>
                <Badge variant="code" className="text-2xs flex-shrink-0">
                  {toolCount === 1 ? '1 tool' : `${toolCount} tools`}
                </Badge>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{server?.url}</p>
        </div>
      </div>
    </Button>
  );
}
