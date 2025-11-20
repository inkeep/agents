'use client';

import { NodeType, nodeTypeMap } from '../configuration/node-types';
import { CopilotTrigger } from './copillot-trigger';
import { NodeItem } from './node-item';

const nodeTypes: NodeItem[] = [
  nodeTypeMap[NodeType.SubAgent],
  nodeTypeMap[NodeType.TeamAgentPlaceholder],
  nodeTypeMap[NodeType.ExternalAgentPlaceholder],
  nodeTypeMap[NodeType.MCPPlaceholder],
  nodeTypeMap[NodeType.FunctionTool],
];

export default function NodeLibrary() {
  return (
    <div className="flex flex-col gap-2 max-w-72 w-40 min-w-0">
      {nodeTypes.map((node) => (
        <NodeItem key={node.type} node={node} />
      ))}
      <CopilotTrigger />
    </div>
  );
}
