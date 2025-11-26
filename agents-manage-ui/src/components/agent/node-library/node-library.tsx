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

export default function NodeLibrary() {
  return (
    <div className="flex flex-col gap-2 w-40">
      <div className="group/node-stack flex flex-col gap-0 group-hover/node-stack:gap-2 group-focus-within/node-stack:gap-2">
        <NodeItem node={nodeTypeMap[NodeType.SubAgent]} />
        <div
          className={cn(
            'opacity-0 max-h-0',
            'flex flex-col gap-2',
            'transition-[max-height,opacity,transform] duration-300',
            'pointer-events-none',
            'group-hover/node-stack:pointer-events-auto group-focus-within/node-stack:pointer-events-auto',
            'group-hover/node-stack:max-h-100 group-focus-within/node-stack:max-h-100',
            'group-hover/node-stack:opacity-100 group-focus-within/node-stack:opacity-100'
          )}
        >
          {nodeTypes.map((node) => (
            <NodeItem key={node.type} node={node} />
          ))}
        </div>
      </div>
      <div>hello</div>
      <CopilotTrigger />
    </div>
  );
}
