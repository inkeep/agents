'use client';

import { SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NodeType, nodeTypeMap } from '../configuration/node-types';
import { useCopilotContext } from '../copilot/copilot-context';
import { NodeItem } from './node-item';

const nodeTypes: NodeItem[] = [
  nodeTypeMap[NodeType.SubAgent],
  nodeTypeMap[NodeType.ExternalAgentPlaceholder],
  nodeTypeMap[NodeType.TeamAgentPlaceholder],
  nodeTypeMap[NodeType.MCPPlaceholder],
  nodeTypeMap[NodeType.FunctionTool],
];

export default function NodeLibrary() {
  const { openCopilot } = useCopilotContext();
  return (
    <div className="flex flex-col gap-2 max-w-72 w-40 min-w-0">
      {nodeTypes.map((node) => (
        <NodeItem key={node.type} node={node} />
      ))}
      <Button
        className="normal-case justify-start font-sans dark:bg-input/30 dark:border-input dark:hover:bg-input/50 backdrop-blur-3xl"
        variant="outline-primary"
        type="button"
        onClick={openCopilot}
      >
        <SparklesIcon />
        Build with AI
      </Button>
    </div>
  );
}
