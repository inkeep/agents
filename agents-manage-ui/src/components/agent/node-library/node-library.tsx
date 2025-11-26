import type { FC } from 'react';
import { NodeType, nodeTypeMap } from '../configuration/node-types';
import { CopilotTrigger } from './copilot-trigger';
import { NodeItem } from './node-item';
import { cn } from '@/lib/utils';

const nodeTypes: NodeItem[] = [
  nodeTypeMap[NodeType.TeamAgentPlaceholder],
  nodeTypeMap[NodeType.ExternalAgentPlaceholder],
  nodeTypeMap[NodeType.MCPPlaceholder],
  nodeTypeMap[NodeType.FunctionTool],
];

export const NodeLibrary: FC = () => {
  return (
    <div className="group/STACK flex flex-col gap-1">
      <NodeItem node={nodeTypeMap[NodeType.SubAgent]} />
      <div
        className={cn(
          'flex flex-col gap-2',
          'opacity-0 max-h-0 pointer-events-none',
          'transition-all duration-300',
          'group-hover/STACK:pointer-events-auto group-focus-within/STACK:pointer-events-auto',
          'group-hover/STACK:max-h-100 group-focus-within/STACK:max-h-100',
          'group-hover/STACK:opacity-100 group-focus-within/STACK:opacity-100',
          'group-hover/STACK:py-1 group-focus-within/STACK:py-1'
        )}
      >
        {nodeTypes.map((node) => (
          <NodeItem key={node.type} node={node} />
        ))}
      </div>
      <CopilotTrigger />
    </div>
  );
};
