'use client';

import { SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NodeType, nodeTypeMap } from '../configuration/node-types';
import { NodeItem } from './node-item';

const nodeTypes: NodeItem[] = [
  nodeTypeMap[NodeType.SubAgent],
  nodeTypeMap[NodeType.ExternalAgentPlaceholder],
  nodeTypeMap[NodeType.TeamAgentPlaceholder],
  nodeTypeMap[NodeType.MCPPlaceholder],
  nodeTypeMap[NodeType.FunctionTool],
];

export default function NodeLibrary() {
  return (
    <div className="flex flex-col gap-2 max-w-72 w-40 min-w-0">
      {nodeTypes.map((node) => (
        <NodeItem key={node.type} node={node} />
      ))}
      <Button
        data-inkeep-sidebar-chat-trigger
        className="normal-case justify-start font-sans dark:bg-input/30 dark:border-input dark:hover:bg-input/50 backdrop-blur-3xl"
        variant="outline-primary"
      >
        <SparklesIcon />
        Build with AI
      </Button>
    </div>
  );
}
