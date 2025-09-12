import { type Node, useReactFlow } from '@xyflow/react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchMCPTools, type MCPTool } from '@/lib/api/tools';
import { NodeType } from '../../../configuration/node-types';
import { EmptyState } from '../empty-state';
import { MCPSelectorLoading } from './loading';
import { MCPServerItem } from './mcp-server-item';

interface MCPSelectorState {
  tools: MCPTool[];
  isLoading: boolean;
  error: string | null;
}

const useFetchAvailableMCPs = (): MCPSelectorState => {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  useEffect(() => {
    const loadTools = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const mcpTools = await fetchMCPTools(tenantId, projectId);
        setTools(mcpTools);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load MCP tools';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadTools();
  }, [tenantId, projectId]);

  return { tools, isLoading, error };
};

export function MCPSelector({ selectedNode }: { selectedNode: Node }) {
  const { updateNode } = useReactFlow();
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const { tools, isLoading, error } = useFetchAvailableMCPs();

  const handleSelect = (mcp: MCPTool) => {
    updateNode(selectedNode.id, {
      type: NodeType.MCP,
      data: { ...mcp },
    });
  };

  if (isLoading) {
    return <MCPSelectorLoading title="Select MCP Server" />;
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
        <h3 className="text-sm font-medium mb-2">Select MCP Server</h3>
        <div className="flex flex-col gap-2 min-w-0 min-h-0">
          {tools.map((mcp: MCPTool) => (
            <MCPServerItem key={mcp.id} mcp={mcp} onClick={handleSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}
