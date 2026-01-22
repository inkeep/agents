'use client';

import { Button } from '@/components/ui/button';
import { NodeType, nodeTypeMap } from '../configuration/node-types';
import { CopilotTrigger } from './copilot-trigger';
import { NodeItem } from './node-item';

export default function NodeLibrary({ sandboxEnabled }: { sandboxEnabled: boolean }) {
  const nodeTypes: NodeItem[] = [
    nodeTypeMap[NodeType.MCPPlaceholder],
    nodeTypeMap[NodeType.SubAgentPlaceholder],
    {
      ...nodeTypeMap[NodeType.FunctionTool],
      disabled: !sandboxEnabled,
      disabledTooltip: (
        <div className="flex flex-col gap-2">
          <div className="font-medium">Sandbox required</div>
          <div className="text-muted-foreground">
            Function tools run inside a sandbox. Configure a sandbox provider to enable them.
          </div>
          <Button asChild size="sm" variant="secondary" className="w-fit">
            <a
              href="https://docs.inkeep.com/typescript-sdk/tools/function-tools#sandbox-providers"
              target="_blank"
              rel="noreferrer"
            >
              View docs
            </a>
          </Button>
        </div>
      ),
    },
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
