import { type NodeProps, Position } from '@xyflow/react';
import { Shield } from 'lucide-react';
import { useParams } from 'next/navigation';
import type { FC, ReactNode } from 'react';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { useMcpToolStatusQuery } from '@/lib/query/mcp-tools';
import { cn } from '@/lib/utils';
import { getActiveTools } from '@/lib/utils/active-tools';
import {
  findOrphanedTools,
  getCurrentSelectedToolsForNode,
  getCurrentToolPoliciesForNode,
} from '@/lib/utils/orphaned-tools-detector';
import { toolPolicyNeedsApprovalForTool } from '@/lib/utils/tool-policies';
import { type MCPNodeData, mcpNodeHandleId } from '../configuration/node-types';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';

const TOOLS_SHOWN_LIMIT = 4;

export const TruncateBadge: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <Badge
      variant="code"
      className={cn(
        'text-2xs text-gray-700 dark:text-gray-300',
        // Add ellipsis for long names
        'truncate block max-w-full'
      )}
    >
      {children}
    </Badge>
  );
};

const TruncateToolBadge: FC<{
  label: string;
  needsApproval?: boolean;
}> = ({ label, needsApproval }) => {
  if (!needsApproval) {
    return <TruncateBadge>{label}</TruncateBadge>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative max-w-full">
          <TruncateBadge>{label}</TruncateBadge>
          <div className="absolute -top-1 -right-2 rounded-full bg-background p-0.5">
            <Shield className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>Requires approval</TooltipContent>
    </Tooltip>
  );
};

export function MCPNode(props: NodeProps & { data: MCPNodeData }) {
  'use memo';

  const { data, selected } = props;
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { toolLookup, agentToolConfigLookup } = useAgentStore((state) => ({
    toolLookup: state.toolLookup,
    agentToolConfigLookup: state.agentToolConfigLookup,
  }));

  // Get skeleton data from initial page load (status: 'unknown', availableTools: [])
  const skeletonToolData = toolLookup[data.toolId];

  // Lazy-load actual status for this specific tool
  const { data: liveToolData, isLoading: isConnecting } = useMcpToolStatusQuery({
    tenantId,
    projectId,
    toolId: data.toolId,
    enabled: !!data.toolId && !!tenantId && !!projectId,
  });

  // Use live data if available, fall back to skeleton
  const toolData = liveToolData ?? skeletonToolData;

  const name = data.name || `Tool: ${data.toolId}`;
  const imageUrl = data.imageUrl ?? toolData?.imageUrl;

  const activeTools = getActiveTools({
    availableTools: toolData?.availableTools,
    activeTools: toolData?.config?.type === 'mcp' ? toolData.config.mcp.activeTools : undefined,
  });

  const selectedTools = getCurrentSelectedToolsForNode(props, agentToolConfigLookup);
  const toolPolicies = getCurrentToolPoliciesForNode(props, agentToolConfigLookup);

  const orphanedTools = findOrphanedTools(selectedTools, activeTools);
  const hasOrphanedTools = orphanedTools.length > 0;

  // Format the tool display
  const getToolDisplay = () => {
    if (selectedTools === null) {
      // All tools selected
      const toolsToShow = (activeTools?.slice(0, TOOLS_SHOWN_LIMIT) || []).map((tool) => tool.name);
      const remainingCount = (activeTools?.length ?? 0) - TOOLS_SHOWN_LIMIT;
      const toolBadges = [...toolsToShow];
      if (remainingCount > 0) {
        toolBadges.push(`+${remainingCount} (ALL)`);
      }

      return toolBadges;
    }

    const selectedCount = selectedTools.length;
    const totalCount = activeTools?.length ?? 0;

    if (selectedCount === 0) {
      return [];
    }

    // If all tools are selected, show total count
    if (selectedCount === totalCount) {
      const toolsToShow = selectedTools.slice(0, TOOLS_SHOWN_LIMIT);
      const remainingCount = selectedCount - TOOLS_SHOWN_LIMIT;
      const toolBadges = [...toolsToShow];
      if (remainingCount > 0) {
        toolBadges.push(`+${remainingCount} (ALL)`);
      }
      return toolBadges;
    }

    // If TOOLS_SHOWN_LIMIT or fewer tools selected, show each tool name as separate badge
    if (selectedCount <= TOOLS_SHOWN_LIMIT) {
      return selectedTools;
    }

    // Show first TOOLS_SHOWN_LIMIT tool names as separate badges, remaining count in additional badge
    const toolsToShow = selectedTools.slice(0, TOOLS_SHOWN_LIMIT);
    const remainingCount = selectedCount - TOOLS_SHOWN_LIMIT;
    return [...toolsToShow, `+${remainingCount}`];
  };

  const toolBadges = getToolDisplay().map((label) => {
    const isSynthetic = label.startsWith('+') || label.includes('(ALL)');

    return {
      label,
      needsApproval: isSynthetic ? false : toolPolicyNeedsApprovalForTool(toolPolicies, label),
    };
  });
  const isDelegating = data.status === 'delegating';
  const isInvertedDelegating = data.status === 'inverted-delegating';
  const isExecuting = data.status === 'executing';
  const hasErrors = data.status === 'error';
  const needsAuth = toolData?.status === 'needs_auth';
  const isTimeout = toolData?.status === 'unavailable';

  return (
    <BaseNode
      isSelected={selected || isDelegating}
      className={cn(
        'rounded-4xl min-w-40 min-h-13 max-w-3xs',
        isConnecting && 'animate-pulse opacity-80',
        hasErrors && 'ring-2 ring-red-300 border-red-300',
        (needsAuth || hasOrphanedTools) &&
          'ring-2 ring-amber-400 border-amber-400 bg-amber-50 dark:bg-amber-950/30',
        isExecuting && 'node-executing',
        isInvertedDelegating && 'node-delegating-inverted'
      )}
    >
      <BaseNodeHeader className="flex items-center justify-between gap-2">
        <MCPToolImage imageUrl={imageUrl} name={name} size={24} className="shrink-0" />
        <BaseNodeHeaderTitle>{name}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent className="flex-row gap-2 flex-wrap">
        {isConnecting ? (
          <TruncateBadge>Connecting...</TruncateBadge>
        ) : isTimeout ? (
          <TruncateBadge>Unavailable</TruncateBadge>
        ) : toolBadges.length > 0 ? (
          toolBadges.map(({ label, needsApproval }) => (
            <TruncateToolBadge key={label} label={label} needsApproval={needsApproval} />
          ))
        ) : (
          <TruncateBadge>No tools</TruncateBadge>
        )}
      </BaseNodeContent>
      <Handle id={mcpNodeHandleId} type="target" position={Position.Top} isConnectable />
    </BaseNode>
  );
}
