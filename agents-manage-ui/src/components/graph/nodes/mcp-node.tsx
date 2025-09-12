import { type NodeProps, Position } from '@xyflow/react';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import type { MCPTool } from '@/lib/api/tools';
import { getToolTypeAndName } from '@/lib/utils/mcp-utils';
import { mcpNodeHandleId } from '../configuration/node-types';
import { BaseNode, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';

export function MCPNode(props: NodeProps & { data: MCPTool }) {
  const { data, selected } = props;
  const { name, imageUrl } = data;
  let provider = null;
  try {
    provider = getToolTypeAndName(data).type;
  } catch (error) {
    console.error(error);
  }

  return (
    <BaseNode
      isSelected={selected}
      className="rounded-full min-w-40 min-h-13 max-w-3xs flex items-center justify-center"
    >
      <BaseNodeHeader className="mb-0 py-3">
        <MCPToolImage
          imageUrl={imageUrl}
          name={name}
          provider={provider || undefined}
          size={24}
          className="mt-[1px] flex-shrink-0"
        />
        <BaseNodeHeaderTitle>{name}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <Handle id={mcpNodeHandleId} type="target" position={Position.Top} isConnectable />
    </BaseNode>
  );
}
