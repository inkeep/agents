import { type Node, useReactFlow } from '@xyflow/react';
import { Check, CircleAlert, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getActiveTools } from '@/app/utils/active-tools';
import { ExpandableJsonEditor } from '@/components/form/expandable-json-editor';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { useNodeEditor } from '@/hooks/use-node-editor';
import { getToolTypeAndName } from '@/lib/utils/mcp-utils';
import {
  getCurrentHeadersForNode,
  getCurrentSelectedToolsForNode,
} from '@/lib/utils/orphaned-tools-detector';
import type { AgentToolConfigLookup } from '../../agent';
import type { MCPNodeData } from '../../configuration/node-types';

interface MCPServerNodeEditorProps {
  selectedNode: Node<MCPNodeData>;
  agentToolConfigLookup: AgentToolConfigLookup;
}

export function MCPServerNodeEditor({
  selectedNode,
  agentToolConfigLookup,
}: MCPServerNodeEditorProps) {
  const { deleteNode } = useNodeEditor({
    selectedNodeId: selectedNode.id,
  });
  const { updateNodeData } = useReactFlow();

  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const { markUnsaved } = useAgentActions();

  // Only use toolLookup - single source of truth
  const { toolLookup, edges } = useAgentStore((state) => ({
    toolLookup: state.toolLookup,
    edges: state.edges,
  }));

  const getCurrentHeaders = useCallback((): Record<string, string> => {
    return getCurrentHeadersForNode(selectedNode, agentToolConfigLookup, edges);
  }, [selectedNode, agentToolConfigLookup, edges]);

  // Local state for headers input (allows invalid JSON while typing)
  const [headersInputValue, setHeadersInputValue] = useState('{}');

  // Sync input value when node changes (but not on every data change)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omit getCurrentHeaders to prevent reset loops
  useEffect(() => {
    const newHeaders = getCurrentHeaders();
    setHeadersInputValue(JSON.stringify(newHeaders, null, 2));
  }, [selectedNode.id]);

  const toolData = toolLookup[selectedNode.data.toolId];

  const availableTools = toolData?.availableTools;

  const activeTools = getActiveTools({
    availableTools: availableTools,
    activeTools:
      toolData?.config && toolData.config.type === 'mcp'
        ? toolData.config.mcp.activeTools
        : undefined,
  });

  // Handle missing tool data
  if (!toolData) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-muted-foreground">
          Tool data not found for {selectedNode.data.toolId}.
        </div>
      </div>
    );
  }
  const selectedTools = getCurrentSelectedToolsForNode(selectedNode, agentToolConfigLookup, edges);

  // Find orphaned tools - tools that are selected but no longer available in activeTools
  const orphanedTools =
    selectedTools && Array.isArray(selectedTools)
      ? selectedTools.filter((toolName) => !activeTools?.some((tool) => tool.name === toolName))
      : [];

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

  const handleHeadersChange = (value: string) => {
    // Always update the input state (allows user to type invalid JSON)
    setHeadersInputValue(value);

    // Only save to node data if the JSON is valid
    try {
      const parsedHeaders = value.trim() === '' ? {} : JSON.parse(value);

      if (
        typeof parsedHeaders === 'object' &&
        parsedHeaders !== null &&
        !Array.isArray(parsedHeaders)
      ) {
        // Valid format - save to node data
        updateNodeData(selectedNode.id, {
          ...selectedNode.data,
          tempHeaders: parsedHeaders,
        });
        markUnsaved();
      }
    } catch {
      // Invalid JSON - don't save, but allow user to continue typing
      // The ExpandableJsonEditor will show the validation error
    }
  };

  let provider = null;
  try {
    provider = toolData ? getToolTypeAndName(toolData).type : null;
  } catch (error) {
    console.error(error);
  }

  return (
    <div className="space-y-8">
      {toolData?.imageUrl && (
        <div className="flex items-center gap-2">
          <MCPToolImage
            imageUrl={toolData.imageUrl}
            name={toolData.name}
            provider={provider || undefined}
            size={32}
            className="rounded-lg"
          />
          <span className="font-medium text-sm truncate">{toolData.name}</span>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="node-id">Id</Label>
        <Input id="node-id" value={selectedNode.data.toolId} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          value={toolData?.name || ''}
          onChange={handleInputChange}
          placeholder="MCP server"
          className="w-full"
          disabled
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="url">URL</Label>
        <Input
          id="url"
          name="url"
          value={
            toolData?.config && toolData.config.type === 'mcp' ? toolData.config.mcp.server.url : ''
          }
          onChange={handleInputChange}
          placeholder="https://mcp.inkeep.com"
          disabled
          className="w-full"
        />
      </div>
      {toolData?.imageUrl && (
        <div className="space-y-2">
          <Label htmlFor="imageUrl">Image URL</Label>
          <Input
            id="imageUrl"
            name="imageUrl"
            value={toolData.imageUrl || ''}
            onChange={handleInputChange}
            placeholder="https://example.com/icon.png"
            disabled
            className="w-full"
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Label>Selected tools</Label>
          <Badge
            variant="code"
            className="border-none px-2 text-[10px] text-gray-700 dark:text-gray-300"
          >
            {
              selectedTools === null
                ? (activeTools?.length ?? 0) // All tools selected
                : selectedTools.length // Count all selected tools (including orphaned ones)
            }
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-1.5">Click to select/deselect</p>
        {(activeTools && activeTools.length > 0) || orphanedTools.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {/* Active tools */}
            {activeTools?.map((tool) => {
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

            {/* Orphaned tools (selected but no longer available) */}
            {orphanedTools.map((toolName) => (
              <Tooltip key={`orphaned-${toolName}`}>
                <TooltipTrigger asChild>
                  <Badge
                    variant="warning"
                    className="flex items-center gap-1 cursor-pointer transition-colors hover:bg-primary/10 normal-case"
                    onClick={() => toggleToolSelection(toolName)}
                  >
                    {toolName}
                    <span className="text-xs">
                      <CircleAlert className="w-2.5 h-2.5" />
                    </span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  <div className="line-clamp-4">
                    This tool was selected but is not available in the MCP server. Click to remove
                    it from the selection.
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <ExpandableJsonEditor
          name="headers"
          label="Headers (JSON)"
          value={headersInputValue}
          onChange={handleHeadersChange}
          placeholder='{"X-Your-Header": "your-value", "Content-Type": "application/json"}'
          className=""
        />
      </div>

      <ExternalLink
        href={`/${tenantId}/projects/${projectId}/mcp-servers/${selectedNode.data.toolId}/edit`}
      >
        Edit MCP Server
      </ExternalLink>
      <Separator />
      <div className="flex justify-end">
        <Button variant="destructive-outline" size="sm" onClick={deleteNode}>
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
