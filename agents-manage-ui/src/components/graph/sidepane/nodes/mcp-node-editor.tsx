import { type Node, useReactFlow } from '@xyflow/react';
import { Check } from 'lucide-react';
import { useParams } from 'next/navigation';
import { getActiveTools } from '@/app/utils/active-tools';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from '@/components/ui/external-link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useGraphStore } from '@/features/graph/state/use-graph-store';
import { getToolTypeAndName } from '@/lib/utils/mcp-utils';
import type { MCPNodeData } from '../../configuration/node-types';

interface MCPServerNodeEditorProps {
  selectedNode: Node<MCPNodeData>;
  selectedToolsLookup: Record<string, Record<string, string[]>>;
}

export function MCPServerNodeEditor({
  selectedNode,
  selectedToolsLookup,
}: MCPServerNodeEditorProps) {
  const { updateNodeData } = useReactFlow();
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  const activeTools = getActiveTools({
    availableTools: selectedNode.data.availableTools,
    activeTools: selectedNode.data.config?.mcp?.activeTools,
  });

  const markUnsaved = useGraphStore((state) => state.markUnsaved);

  const getCurrentSelectedTools = (): string[] | null => {
    // First check if we have temporary selections stored on the node (from recent clicks)
    if ((selectedNode.data as any).tempSelectedTools !== undefined) {
      return (selectedNode.data as any).tempSelectedTools;
    }

    // Otherwise, get from the database/initial state
    const allSelectedTools = new Set<string>();
    let hasAnyData = false;
    let hasEmptyArray = false;
    let hasNullValue = false;

    Object.values(selectedToolsLookup).forEach((agentTools) => {
      const toolsForThisMCP = agentTools[selectedNode.data.id];
      if (toolsForThisMCP !== undefined) {
        hasAnyData = true;
        if (Array.isArray(toolsForThisMCP) && toolsForThisMCP.length === 0) {
          // Empty array = NONE selected
          hasEmptyArray = true;
        } else if (toolsForThisMCP === null) {
          // null = ALL selected
          hasNullValue = true;
        } else if (Array.isArray(toolsForThisMCP)) {
          // Specific tools selected
          toolsForThisMCP.forEach((tool) => {
            allSelectedTools.add(tool);
          });
        }
      }
    });

    // If we found a null value, return null (all selected)
    if (hasNullValue) {
      return null;
    }

    // If we found an empty array, return empty array
    if (hasEmptyArray) {
      return [];
    }

    // If no data exists (undefined), default to ALL selected (null)
    if (!hasAnyData) {
      return null;
    }

    return Array.from(allSelectedTools);
  };

  const selectedTools = getCurrentSelectedTools();

  const toggleToolSelection = (toolName: string) => {
    // Handle null case (all tools selected) - convert to array of all tool names
    const currentSelections =
      selectedTools === null ? activeTools?.map((tool) => tool.name) || [] : [...selectedTools];
    const isSelected = currentSelections.includes(toolName);

    let newSelections: string[];
    if (isSelected) {
      newSelections = currentSelections.filter((t) => t !== toolName);
    } else {
      newSelections = [...currentSelections, toolName];
    }

    // Check if all tools are now selected - if so, use null to represent "all selected"
    const allToolNames = activeTools?.map((tool) => tool.name) || [];
    let finalSelection: string[] | null = newSelections;

    if (
      newSelections.length === allToolNames.length &&
      allToolNames.every((toolName) => newSelections.includes(toolName))
    ) {
      // All tools are selected, use null to represent this
      finalSelection = null;
    }

    // For now, store in node data - we'll need to properly save to agent relations later
    updateNodeData(selectedNode.id, {
      ...selectedNode.data,
      tempSelectedTools: finalSelection,
    });
    markUnsaved();
  };

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
          <Label>Selected tools (click to select/deselect)</Label>
          <Badge
            variant="code"
            className="border-none px-2 text-[10px] text-gray-700 dark:text-gray-300"
          >
            {
              selectedTools === null
                ? (activeTools?.length ?? 0) // All tools selected
                : selectedTools.filter((toolName) =>
                    activeTools?.some((tool) => tool.name === toolName)
                  ).length // Only count selected tools that are currently active
            }
          </Badge>
        </div>
        {activeTools && activeTools.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeTools.map((tool) => {
              const isSelected =
                selectedTools === null
                  ? true // If null, all tools are selected
                  : selectedTools.includes(tool.name);
              return (
                <Tooltip key={tool.name}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={isSelected ? 'primary' : 'code'}
                      className={`flex items-center gap-1 cursor-pointer transition-colors ${
                        isSelected
                          ? 'hover:bg-primary/10'
                          : 'bg-transparent dark:bg-transparent dark:hover:bg-muted/50 hover:bg-muted/100'
                      }`}
                      onClick={() => toggleToolSelection(tool.name)}
                    >
                      {tool.name}
                      {isSelected && (
                        <span className="text-xs">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-sm">
                    <div className="line-clamp-4">{tool.description}</div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
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
