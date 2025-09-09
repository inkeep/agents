import { type Node, useReactFlow } from '@xyflow/react';
import { ExternalLink } from '@/components/ui/external-link';
import { useParams } from 'next/navigation';
import { getActiveTools } from '@/app/utils/active-tools';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useGraphStore } from '@/features/graph/state/use-graph-store';
import { getToolTypeAndName } from '@/lib/utils/mcp-utils';
import type { MCPNodeData } from '../../configuration/node-types';

interface MCPServerNodeEditorProps {
  selectedNode: Node<MCPNodeData>;
}

export function MCPServerNodeEditor({ selectedNode }: MCPServerNodeEditorProps) {
  const { updateNodeData } = useReactFlow();
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();

  const activeTools = getActiveTools({
    availableTools: selectedNode.data.availableTools,
    activeTools: selectedNode.data.config?.mcp?.activeTools,
  });

  const markUnsaved = useGraphStore((state) => state.markUnsaved);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (selectedNode) {
      updateNodeData(selectedNode.id, { [name]: value });
      markUnsaved();
    }
  };

  let provider = null;
  try {
    provider = getToolTypeAndName(selectedNode.data).type;
  } catch (error) {
    console.error(error);
  }

  return (
    <div className="space-y-8">
      {selectedNode.data.imageUrl && (
        <div className="flex items-center gap-2">
          <MCPToolImage
            imageUrl={selectedNode.data.imageUrl}
            name={selectedNode.data.name}
            provider={provider || undefined}
            size={32}
            className="rounded-lg"
          />
          <span className="font-medium text-sm truncate">{selectedNode.data.name}</span>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="node-id">Id</Label>
        <Input id="node-id" value={selectedNode.data.id} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          value={selectedNode.data.name || ''}
          onChange={handleInputChange}
          placeholder="MCP Server"
          className="w-full"
          disabled
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="url">URL</Label>
        <Input
          id="url"
          name="url"
          value={selectedNode.data.config?.mcp?.server?.url || ''}
          onChange={handleInputChange}
          placeholder="https://mcp.inkeep.com"
          disabled
          className="w-full"
        />
      </div>
      {selectedNode.data.imageUrl && (
        <div className="space-y-2">
          <Label htmlFor="imageUrl">Image URL</Label>
          <Input
            id="imageUrl"
            name="imageUrl"
            value={selectedNode.data.imageUrl || ''}
            onChange={handleInputChange}
            placeholder="https://example.com/icon.png"
            disabled
            className="w-full"
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Label>Active tools</Label>
          <Badge
            variant="code"
            className="border-none px-2 text-[10px] text-gray-700 dark:text-gray-300"
          >
            {activeTools?.length ?? 0}
          </Badge>
        </div>
        {activeTools && activeTools.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeTools.map((tool) => (
              <Tooltip key={tool.name}>
                <TooltipTrigger asChild>
                  <Badge variant="code" className="flex items-center gap-2">
                    {tool.name}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  <div className="line-clamp-4">{tool.description}</div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
      </div>

      <ExternalLink
        href={`/${tenantId}/projects/${projectId}/mcp-servers/${selectedNode.data.id}/edit`}
      >
        Edit MCP Server
      </ExternalLink>
    </div>
  );
}
