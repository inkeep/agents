import { type Node, useReactFlow } from '@xyflow/react';
import { useParams } from 'next/navigation';
import { useMcpToolsQuery } from '@/lib/query/mcp-tools';
import type { MCPTool } from '@/lib/types/tools';
import { NodeType } from '../../../configuration/node-types';
import { EmptyState } from '../empty-state';
import { MCPSelectorLoading } from './loading';
import { MCPServerItem } from './mcp-server-item';

export function MCPSelector({ selectedNode }: { selectedNode: Node }) {
  const { updateNode } = useReactFlow();
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const { data: tools, isLoading, error } = useMcpToolsQuery(tenantId, projectId);

  const handleSelect = (mcp: MCPTool) => {
    updateNode(selectedNode.id, {
      type: NodeType.MCP,
      data: { toolId: mcp.id, subAgentId: null, relationshipId: null },
    });
  };

  if (isLoading) {
    return <MCPSelectorLoading title="Select MCP server" />;
  }

  if (error) {
    return (
      <EmptyState
        message="Something went wrong."
        actionText="Create MCP server"
        actionHref={`/${tenantId}/projects/${projectId}/mcp-servers/new`}
      />
    );
  }

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
