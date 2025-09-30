import { type NodeProps, Position } from '@xyflow/react';
import { getActiveTools } from '@/app/utils/active-tools';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Badge } from '@/components/ui/badge';
import { useGraphStore } from '@/features/graph/state/use-graph-store';
import { getCurrentSelectedToolsForNode } from '@/lib/utils/orphaned-tools-detector';
import { type MCPNodeData, mcpNodeHandleId } from '../configuration/node-types';
import { BaseNode, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';

export function MCPNode(props: NodeProps & { data: MCPNodeData }) {
  const { data, selected } = props;
  const toolLookup = useGraphStore((state) => state.toolLookup);
  const agentToolConfigLookup = useGraphStore((state) => state.agentToolConfigLookup);
  const edges = useGraphStore((state) => state.edges);

  const name = data.name || `Tool: ${data.toolId}`;
  const imageUrl = data.imageUrl;
  const provider = data.provider;
  const toolData = toolLookup[data.toolId];

  const availableTools = toolData?.availableTools;

  const activeTools = getActiveTools({
    availableTools: availableTools,
    activeTools: toolData?.config?.mcp?.activeTools,
  });

  const selectedTools = getCurrentSelectedToolsForNode(props, agentToolConfigLookup, edges);

  // Format the tool display
  const getToolDisplay = () => {
    if (selectedTools === null) {
      // All tools selected
      return {
        toolBadges: [(activeTools?.length ?? 0).toString()],
        additionalBadge: null,
      };
    }

    const selectedCount = selectedTools.length;
    const totalCount = activeTools?.length ?? 0;

    // If no tools selected, show 0
    if (selectedCount === 0) {
      return {
        toolBadges: ['0'],
        additionalBadge: null,
      };
    }

    // If all tools are selected, show total count
    if (selectedCount === totalCount) {
      return {
        toolBadges: [totalCount.toString()],
        additionalBadge: null,
      };
    }

    // If 2 or fewer tools selected, show each tool name as separate badge
    if (selectedCount <= 2) {
      return {
        toolBadges: selectedTools,
        additionalBadge: null,
      };
    }

    // Show first 2 tool names as separate badges, remaining count in additional badge
    const firstTwoTools = selectedTools.slice(0, 2);
    const remainingCount = selectedCount - 2;
    return {
      toolBadges: firstTwoTools,
      additionalBadge: `+${remainingCount}`,
    };
  };

  const toolDisplay = getToolDisplay();

  return (
    <BaseNode isSelected={selected} className="rounded-full min-w-40 min-h-13 max-w-3xs">
      <BaseNodeHeader className="mb-0 py-3">
        <div className="flex items-center flex-wrap gap-1">
          <div className="flex items-center gap-2 flex-shrink-0 mr-4">
            <MCPToolImage
              imageUrl={imageUrl}
              name={name}
              provider={provider || undefined}
              size={24}
              className="mt-[1px] flex-shrink-0"
            />
            <BaseNodeHeaderTitle className="flex-shrink-0">{name}</BaseNodeHeaderTitle>
          </div>
          {toolDisplay.toolBadges.map((toolName, index) => (
            <Badge
              key={index}
              variant="code"
              className="px-2 text-2xs text-gray-700 dark:text-gray-300 flex-shrink-0"
            >
              {toolName}
            </Badge>
          ))}
          {toolDisplay.additionalBadge && (
            <Badge
              variant="code"
              className="px-2 text-2xs text-gray-700 dark:text-gray-300 flex-shrink-0"
            >
              {toolDisplay.additionalBadge}
            </Badge>
          )}
        </div>
      </BaseNodeHeader>
      <Handle id={mcpNodeHandleId} type="target" position={Position.Top} isConnectable />
    </BaseNode>
  );
}
