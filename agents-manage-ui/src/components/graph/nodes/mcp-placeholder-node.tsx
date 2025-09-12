import type { NodeProps } from '@xyflow/react';
import { Hammer } from 'lucide-react';
import { BaseNode, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';

type MCPPlaceholderNodeData = {
  name: string;
};

export function MCPPlaceholderNode(props: NodeProps & { data: MCPPlaceholderNodeData }) {
  const { data, selected } = props;
  const { name } = data;
  return (
    <BaseNode
      isSelected={selected}
      className={`rounded-full border-dashed min-w-40 min-h-13 flex items-center justify-center max-w-3xs ${selected ? 'outline-dashed outline-2 outline-gray-700 hover:outline-gray-700 ring-0 hover:ring-0' : ''}`}
    >
      <BaseNodeHeader className="mb-0 py-3">
        <Hammer className="size-4 text-muted-foreground/65" />
        <BaseNodeHeaderTitle className="text-muted-foreground">{name}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
    </BaseNode>
  );
}
