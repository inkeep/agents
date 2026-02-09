import { type Node, useReactFlow } from '@xyflow/react';
import { useParams } from 'next/navigation';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import type { MCPTool } from '@/lib/types/tools';
import { NodeType } from '../../../configuration/node-types';
import { EmptyState } from '../empty-state';
import { MCPServerItem } from './mcp-server-item';

export function MCPSelector({ selectedNode }: { selectedNode: Node }) {
  'use memo';
  const { updateNode } = useReactFlow();
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const toolLookup = useAgentStore((state) => state.toolLookup);
  const tools = Object.values(toolLookup);

  const handleSelect = (mcp: MCPTool) => {
    updateNode(selectedNode.id, {
      type: NodeType.MCP,
      data: { toolId: mcp.id, subAgentId: null, relationshipId: null },
    });
  };

  if (!tools?.length) {
    return (
      <EmptyState
        message="No MCP servers found."
        actionText="Create MCP server"
        actionHref={`/${tenantId}/projects/${projectId}/mcp-servers/new`}
      />
    );
  }

  return (
    <div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium mb-2">Select MCP server</h3>
        <div className="flex flex-col gap-2 min-w-0 min-h-0">
          {tools.map((mcp: MCPTool) => (
            <MCPServerItem key={mcp.id} mcp={mcp} onClick={handleSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}
