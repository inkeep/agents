'use client';

import { NodeType, nodeTypeMap } from '../configuration/node-types';
import { CopilotTrigger } from './copilot-trigger';
import { NodeItem } from './node-item';

export default function NodeLibrary({ sandboxEnabled }: { sandboxEnabled: boolean }) {
  const nodeTypes: NodeItem[] = [
    nodeTypeMap[NodeType.MCPPlaceholder],
    nodeTypeMap[NodeType.SubAgentPlaceholder],
    ...(sandboxEnabled ? [nodeTypeMap[NodeType.FunctionTool]] : []),
  ];

  return (
    <div className="flex flex-col gap-2 max-w-72 w-40 min-w-0">
      {nodeTypes.map((node) => (
        <NodeItem key={node.type} node={node} />
      ))}
      <CopilotTrigger />
    </div>
  );
}
