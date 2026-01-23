import { getActiveTools } from '@/lib/utils/active-tools';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Badge } from '@/components/ui/badge';
import type { MCPTool } from '@/lib/types/tools';
import { SelectorItem } from '../selector-item';

interface MCPServerItemProps {
  mcp: MCPTool;
  onClick: (mcp: MCPTool) => void;
}

export function MCPServerItem({ mcp, onClick }: MCPServerItemProps) {
  const server = mcp.config?.type === 'mcp' ? (mcp.config as any).mcp?.server : undefined;
  const { id, name, availableTools, imageUrl, config } = mcp;

  const activeTools = getActiveTools({
    availableTools,
    activeTools: config?.type === 'mcp' ? (config as any).mcp?.activeTools : undefined,
  });

  const toolCount = activeTools?.length ?? 0;

  return (
    <SelectorItem
      id={id}
      name={name}
      subtitle={server?.url}
      icon={<MCPToolImage imageUrl={imageUrl} name={name} size={32} className="shrink-0 mt-0.5" />}
      badges={
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="code" className="text-2xs uppercase bg-transparent">
            {mcp.credentialScope === 'user' ? 'User' : 'Project'}
          </Badge>
          {availableTools && (
            <Badge variant="code" className="text-2xs">
              {toolCount === 1 ? '1 tool' : `${toolCount} tools`}
            </Badge>
          )}
        </div>
      }
      onClick={() => onClick(mcp)}
    />
  );
}
