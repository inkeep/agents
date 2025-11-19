import { type Node, useReactFlow } from '@xyflow/react';
import { CircleAlert, Shield, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getActiveTools } from '@/app/utils/active-tools';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink } from '@/components/ui/external-link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { useNodeEditor } from '@/hooks/use-node-editor';
import {
  getCurrentHeadersForNode,
  getCurrentSelectedToolsForNode,
  getCurrentToolPoliciesForNode,
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
  const currentToolPolicies = getCurrentToolPoliciesForNode(
    selectedNode,
    agentToolConfigLookup,
    edges
  );

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
    const finalSelection: string[] | null =
      newSelections.length === allToolNames.length &&
      allToolNames.every((toolName) => newSelections.includes(toolName))
        ? null // All tools are selected, use null to represent this
        : newSelections;

    // When deselecting a tool, remove its approval policy
    const updatedPolicies = { ...currentToolPolicies };
    if (isSelected && !newSelections.includes(toolName)) {
      delete updatedPolicies[toolName];
    }

    // For now, store in node data - we'll need to properly save to agent relations later
    updateNodeData(selectedNode.id, {
      ...selectedNode.data,
      tempSelectedTools: finalSelection,
      tempToolPolicies: updatedPolicies,
    });
    markUnsaved();
  };

  const toggleToolApproval = (toolName: string) => {
    const updatedPolicies = { ...currentToolPolicies };

    if (updatedPolicies[toolName]?.needsApproval) {
      // Remove approval requirement
      delete updatedPolicies[toolName];
    } else {
      // Add approval requirement
      updatedPolicies[toolName] = { needsApproval: true };
    }

    updateNodeData(selectedNode.id, {
      ...selectedNode.data,
      tempToolPolicies: updatedPolicies,
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

  return (
    <div className="space-y-8">
      {toolData?.imageUrl && (
        <div className="flex items-center gap-2">
          <MCPToolImage
            imageUrl={toolData.imageUrl}
            name={toolData.name}
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
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Label>Tool Configuration</Label>
            <Badge
              variant="code"
              className="border-none px-2 text-[10px] text-gray-700 dark:text-gray-300"
            >
              {
                selectedTools === null
                  ? (activeTools?.length ?? 0) // All tools selected
                  : selectedTools.length // Count all selected tools (including orphaned ones)
              }{' '}
              selected
            </Badge>
          </div>
          {activeTools && activeTools.length > 1 && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  updateNodeData(selectedNode.id, {
                    ...selectedNode.data,
                    tempSelectedTools: null, // null means all tools selected
                  });
                  markUnsaved();
                }}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  updateNodeData(selectedNode.id, {
                    ...selectedNode.data,
                    tempSelectedTools: [],
                    tempToolPolicies: {}, // Clear all approval policies
                  });
                  markUnsaved();
                }}
              >
                Deselect All
              </Button>
            </div>
          )}
        </div>

        {(activeTools && activeTools.length > 0) || orphanedTools.length > 0 ? (
          <div className="space-y-1 border rounded-md">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/20 rounded-t-md border-b">
              <div>Tool</div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-help">
                    <Shield className="w-3 h-3" />
                    Needs Approval?
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="text-sm">
                    Tools requiring approval will pause execution and wait for user confirmation
                    before running.
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Active tools */}
            {activeTools?.map((tool) => {
              const isSelected =
                selectedTools === null
                  ? true // If null, all tools are selected
                  : selectedTools.includes(tool.name);
              const needsApproval = currentToolPolicies[tool.name]?.needsApproval || false;

              return (
                <div
                  key={tool.name}
                  className="grid grid-cols-[1fr_auto] gap-4 px-3 py-2 hover:bg-muted/30 transition-colors border-b last:border-b-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleToolSelection(tool.name)}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{tool.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {tool.description}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-sm">
                        <div>{tool.description}</div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex items-center">
                    <Checkbox
                      checked={needsApproval}
                      disabled={!isSelected}
                      onCheckedChange={() => toggleToolApproval(tool.name)}
                    />
                  </div>
                </div>
              );
            })}

            {/* Orphaned tools (selected but no longer available) */}
            {orphanedTools.map((toolName) => {
              const needsApproval = currentToolPolicies[toolName]?.needsApproval || false;

              return (
                <div
                  key={`orphaned-${toolName}`}
                  className="grid grid-cols-[1fr_auto] gap-4 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border-b last:border-b-0 border-amber-200 dark:border-amber-800"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => toggleToolSelection(toolName)}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <div className="flex-1">
                            <div className="text-sm font-medium truncate">{toolName}</div>
                            <div className="text-xs text-amber-600 dark:text-amber-400">
                              Tool no longer available
                            </div>
                          </div>
                          <CircleAlert className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-sm">
                        This tool was selected but is not available in the MCP server. Uncheck to
                        remove it.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex items-center">
                    <Checkbox
                      checked={needsApproval}
                      onCheckedChange={() => toggleToolApproval(toolName)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-8 text-center border rounded-md bg-muted/10">
            No tools available for this MCP server
          </div>
        )}
      </div>

      <div className="space-y-2">
        <ExpandableJsonEditor
          name="headers"
          label="Headers (JSON)"
          value={headersInputValue}
          onChange={handleHeadersChange}
          placeholder='{"X-Your-Header": "your-value", "Content-Type": "application/json"}'
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
