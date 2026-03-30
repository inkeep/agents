'use client';

import { Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Badge } from '@/components/ui/badge';
import { useMcpToolStatusQuery } from '@/lib/query/mcp-tools';
import type { MCPTool } from '@/lib/types/tools';
import { getActiveTools } from '@/lib/utils/active-tools';
import { SelectorItem } from '../selector-item';

interface MCPServerItemProps {
  mcp: MCPTool;
  onClick: (mcp: MCPTool) => void;
}

export function MCPServerItem({ mcp: skeletonMcp, onClick }: MCPServerItemProps) {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();

  const { data: liveToolData, isLoading: isLoadingStatus } = useMcpToolStatusQuery({
    tenantId,
    projectId,
    toolId: skeletonMcp.id,
  });

  // Use live data if available, fall back to skeleton from store
  const mcp = liveToolData ?? skeletonMcp;

  const server = mcp.config?.type === 'mcp' ? (mcp.config as any).mcp?.server : undefined;
  const { id, name, availableTools, imageUrl, config } = mcp;

  const activeTools = getActiveTools({
    availableTools,
    activeTools: config?.type === 'mcp' ? (config as any).mcp?.activeTools : undefined,
  });

  const toolCount = activeTools?.length ?? 0;

  const getStatusBadge = () => {
    if (isLoadingStatus) {
      return (
        <Badge variant="code" className="flex items-center gap-1 text-2xs">
          <Loader2 className="size-2.5 animate-spin" />
        </Badge>
      );
    }

    switch (mcp.status) {
      case 'healthy':
        return (
          <Badge variant="success" className="text-2xs">
            Healthy
          </Badge>
        );
      case 'unhealthy':
      case 'unknown':
        return (
          <Badge variant="error" className="text-2xs">
            {mcp.status}
          </Badge>
        );
      case 'unavailable':
        return (
          <Badge variant="warning" className="text-2xs">
            Unavailable
          </Badge>
        );
      case 'needs_auth':
        return (
          <Badge variant="warning" className="text-2xs">
            Needs Login
          </Badge>
        );
      default:
        return null;
    }
  };

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
          {getStatusBadge()}
          {!isLoadingStatus && availableTools && (
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
