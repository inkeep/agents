import { type NodeProps, Position } from '@xyflow/react';
import { getActiveTools } from '@/app/utils/active-tools';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Badge } from '@/components/ui/badge';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { cn } from '@/lib/utils';
import { getCurrentSelectedToolsForNode } from '@/lib/utils/orphaned-tools-detector';
import { type MCPNodeData, mcpNodeHandleId } from '../configuration/node-types';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';

const TOOLS_SHOWN_LIMIT = 4;

export function MCPNode(props: NodeProps & { data: MCPNodeData }) {
  const { data, selected } = props;
  const { toolLookup, agentToolConfigLookup, edges } = useAgentStore((state) => ({
    toolLookup: state.toolLookup,
    agentToolConfigLookup: state.agentToolConfigLookup,
    edges: state.edges,
  }));

  const name = data.name || `Tool: ${data.toolId}`;
  const imageUrl = data.imageUrl;
  const provider = data.provider;
  const toolData = toolLookup[data.toolId];

  const availableTools = toolData?.availableTools;

  const activeTools = getActiveTools({
    availableTools: availableTools,
    activeTools: toolData?.config?.type === 'mcp' ? toolData.config.mcp.activeTools : undefined,
  });

  const selectedTools = getCurrentSelectedToolsForNode(props, agentToolConfigLookup, edges);

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
      return ['0'];
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

  const toolBadges = getToolDisplay();

  return (
    <BaseNode
      isSelected={selected || data.isDelegating}
      className={cn(
        'rounded-4xl min-w-40 min-h-13 max-w-3xs',
        data.isExecuting && 'node-executing'
      )}
    >
      <BaseNodeHeader className="flex items-center justify-between gap-2">
        <MCPToolImage imageUrl={imageUrl} name={name} size={24} className="flex-shrink-0" />
        <BaseNodeHeaderTitle>{name}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        {toolBadges.map((label, index) => (
          <Badge
            key={index}
            variant="code"
            className="px-2 text-2xs text-gray-700 dark:text-gray-300 flex-shrink-0"
          >
            {label}
          </Badge>
        ))}
      </BaseNodeContent>
      <Handle id={mcpNodeHandleId} type="target" position={Position.Top} isConnectable />
    </BaseNode>
  );
}
