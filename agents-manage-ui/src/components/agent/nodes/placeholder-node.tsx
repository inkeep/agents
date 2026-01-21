import type { NodeProps } from '@xyflow/react';
import { nodeTypeMap, type PlaceholderType } from '../configuration/node-types';
import { BaseNode, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';

type PlaceholderNodeData = {
  name: string;
  type: PlaceholderType;
};

export function PlaceholderNode(props: NodeProps & { data: PlaceholderNodeData }) {
  const { data, selected } = props;
  const { name, type } = data;
  const Icon = nodeTypeMap[type].Icon;

  return (
    <BaseNode
      isSelected={selected}
      className={`rounded-4xl border-dashed min-w-40 min-h-13 flex items-center justify-center max-w-3xs ${selected ? 'outline-dashed outline-2 outline-gray-700 hover:outline-gray-700 ring-0 hover:ring-0' : ''}`}
    >
      <BaseNodeHeader className="mb-0 py-3">
        <Icon className="size-4 text-muted-foreground/65" />
        <BaseNodeHeaderTitle className="text-muted-foreground">{name}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
    </BaseNode>
  );
}
