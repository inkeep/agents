import { type Node, useReactFlow } from '@xyflow/react';
import { AlertTriangle, Check, CircleAlert, Loader2, Shield, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericJsonEditor } from '@/components/form/generic-json-editor';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink } from '@/components/ui/external-link';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useProjectPermissions } from '@/contexts/project';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { useNodeEditor } from '@/hooks/use-node-editor';
import { useMcpToolStatusQuery } from '@/lib/query/mcp-tools';
import { headersTemplate } from '@/lib/templates';
import type { AgentToolConfigLookup } from '@/lib/types/agent-full';
import { getActiveTools } from '@/lib/utils/active-tools';
import {
  findOrphanedTools,
  getCurrentHeadersForNode,
  getCurrentSelectedToolsForNode,
  getCurrentToolPoliciesForNode,
} from '@/lib/utils/orphaned-tools-detector';
import type { MCPNodeData } from '../../configuration/node-types';
import { SchemaOverrideBadge } from './schema-override-badge';

interface MCPServerNodeEditorProps {
  selectedNode: Node<MCPNodeData>;
  agentToolConfigLookup: AgentToolConfigLookup;
}

export function MCPServerNodeEditor({
  selectedNode,
  agentToolConfigLookup,
}: MCPServerNodeEditorProps) {
  const form = useFullAgentFormContext();
  const { fields } = useFieldArray({
    control: form.control,
    name: 'tools',
    keyName: '_rhfKey5',
  });
  const toolIndex = fields.findIndex((s) => s.id === selectedNode.data.toolId);
  const tool = useWatch({ control: form.control, name: `tools.${toolIndex}` });

  const path = <K extends string>(k: K) => `tools.${toolIndex}.${k}` as const;

  const { canEdit } = useProjectPermissions();
  const { deleteNode } = useNodeEditor({
    selectedNodeId: selectedNode.id,
  });
  const { updateNodeData } = useReactFlow();

  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { markUnsaved } = useAgentActions();

  // Get skeleton data from store
  const toolLookup = useAgentStore((state) => state.toolLookup);

  // Lazy-load actual tool status
  const { data: liveToolData, isLoading: isLoadingToolStatus } = useMcpToolStatusQuery({
    tenantId,
    projectId,
    toolId: selectedNode.data.toolId,
    enabled: !!selectedNode.data.toolId,
  });

  // Use live data if available, fall back to skeleton from store
  const skeletonToolData = toolLookup[selectedNode.data.toolId];
  const toolData = liveToolData ?? skeletonToolData;

  const getCurrentHeaders = useCallback((): Record<string, string> => {
    return getCurrentHeadersForNode(selectedNode, agentToolConfigLookup);
  }, [selectedNode, agentToolConfigLookup]);

  // Sync input value when node changes (but not on every data change)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omit getCurrentHeaders to prevent reset loops
  useEffect(() => {
    const newHeaders = getCurrentHeaders();
    form.setValue(path('headers'), JSON.stringify(newHeaders, null, 2));
  }, [selectedNode.id]);

  const availableTools = toolData?.availableTools;
  const toolOverrides =
    toolData?.config && toolData.config.type === 'mcp'
      ? toolData.config.mcp.toolOverrides
      : undefined;

  const activeTools = getActiveTools({
    availableTools: availableTools,
    activeTools:
      toolData?.config && toolData.config.type === 'mcp'
        ? toolData.config.mcp.activeTools
        : undefined,
  });

  const selectedTools = getCurrentSelectedToolsForNode(selectedNode, agentToolConfigLookup);
  const currentToolPolicies = getCurrentToolPoliciesForNode(selectedNode, agentToolConfigLookup);
  const orphanedTools = findOrphanedTools(selectedTools, activeTools);

  // Track if we've already shown the warning for this node to avoid repeated toasts
  const hasShownOrphanedWarningRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      liveToolData &&
      orphanedTools.length > 0 &&
      hasShownOrphanedWarningRef.current !== selectedNode.id
    ) {
      hasShownOrphanedWarningRef.current = selectedNode.id;
      const toolText = orphanedTools.length > 1 ? 'tools are' : 'tool is';
      toast.warning(
        `${orphanedTools.length} selected ${toolText} no longer available: ${orphanedTools.join(', ')}. Uncheck to remove.`,
        {
          closeButton: true,
          duration: 6000,
        }
      );
    }
  }, [liveToolData, orphanedTools, selectedNode.id]);
  if (!tool) {
    return;
  }
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

  const toggleAllApprovalsForEnabledTools = () => {
    // Get enabled tool names
    const enabledToolNames =
      selectedTools === null
        ? activeTools?.map((tool) => tool.name) || []
        : selectedTools.filter((toolName) => activeTools?.some((tool) => tool.name === toolName));

    if (enabledToolNames.length === 0) return;

    // Check if all enabled tools currently need approval
    const allEnabledNeedApproval = enabledToolNames.every(
      (toolName) => currentToolPolicies[toolName]?.needsApproval
    );

    const updatedPolicies = { ...currentToolPolicies };

    if (allEnabledNeedApproval) {
      // Remove approval from all enabled tools
      for (const toolName of enabledToolNames) {
        delete updatedPolicies[toolName];
      }
    } else {
      // Add approval to all enabled tools
      for (const toolName of enabledToolNames) {
        updatedPolicies[toolName] = { needsApproval: true };
      }
    }

    updateNodeData(selectedNode.id, {
      ...selectedNode.data,
      tempToolPolicies: updatedPolicies,
    });
    markUnsaved();
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

      {/* Warning banner for needs_auth status */}
      {toolData?.status === 'needs_auth' && (
        <Alert className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 [&>svg]:text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-foreground">Authentication Required</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            This MCP server requires authentication to work properly.{' '}
            <Link
              href={`/${tenantId}/projects/${projectId}/mcp-servers/${selectedNode.data.toolId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline hover:no-underline"
            >
              Go to MCP Server details to connect
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <GenericInput control={form.control} name={path('id')} label="Id" disabled isRequired />

      <GenericInput
        control={form.control}
        name={path('name')}
        label="Name"
        placeholder="MCP server"
        disabled
        isRequired
      />

      <GenericInput
        control={form.control}
        name={path('config.mcp.server.url')}
        label="URL"
        placeholder="https://mcp.inkeep.com"
        disabled
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label>Tool Configuration</Label>
            <Badge variant="count">
              {
                selectedTools === null
                  ? (activeTools?.length ?? 0) // All tools selected
                  : selectedTools.length // Count all selected tools (including orphaned ones)
              }
            </Badge>
          </div>
          {activeTools &&
            activeTools.length > 1 &&
            (() => {
              const allToolsSelected =
                selectedTools === null || selectedTools.length === activeTools.length;

              return (
                <>
                  {allToolsSelected ? (
                    <Button
                      type="button"
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
                      <X className="w-4 h-4 text-muted-foreground" />
                      Deselect all
                    </Button>
                  ) : (
                    <Button
                      type="button"
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
                      <Check className="w-4 h-4 text-muted-foreground" />
                      Select all
                    </Button>
                  )}
                </>
              );
            })()}
        </div>

        {isLoadingToolStatus ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground border rounded-md bg-muted/10">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading...
          </div>
        ) : (activeTools && activeTools.length > 0) || orphanedTools.length > 0 ? (
          <div className="border rounded-md">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto] gap-4 px-3 py-2.5 text-xs font-medium text-muted-foreground rounded-t-md border-b">
              <div>Tool</div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <Shield className="w-3 h-3" />
                    Needs Approval?
                    {(() => {
                      const enabledToolNames =
                        selectedTools === null
                          ? activeTools?.map((tool) => tool.name) || []
                          : selectedTools.filter((toolName) =>
                              activeTools?.some((tool) => tool.name === toolName)
                            );
                      const hasEnabledTools = enabledToolNames.length > 0;
                      const allEnabledNeedApproval =
                        hasEnabledTools &&
                        enabledToolNames.every(
                          (toolName) => currentToolPolicies[toolName]?.needsApproval
                        );
                      const someEnabledNeedApproval =
                        hasEnabledTools &&
                        enabledToolNames.some(
                          (toolName) => currentToolPolicies[toolName]?.needsApproval
                        );

                      return (
                        <Checkbox
                          checked={
                            allEnabledNeedApproval
                              ? true
                              : someEnabledNeedApproval
                                ? 'indeterminate'
                                : false
                          }
                          disabled={!hasEnabledTools}
                          onCheckedChange={() => toggleAllApprovalsForEnabledTools()}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Toggle approval for all enabled tools"
                        />
                      );
                    })()}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="text-sm">
                    Tools requiring approval will pause execution and wait for user confirmation
                    before running. Use the checkbox to toggle approval for all enabled tools.{' '}
                    <a
                      href="https://docs.inkeep.com/visual-builder/tools/tool-approvals"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:no-underline"
                    >
                      Learn more
                    </a>
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
              const override = toolOverrides?.[tool.name];
              const displayName = override?.displayName || tool.name;
              const displayDescription = override?.description || tool.description;
              const hasSchemaOverride = !!override?.schema;
              const hasMetadataOverride = !!override?.displayName || !!override?.description;

              return (
                <div
                  key={tool.name}
                  className="grid grid-cols-[1fr_auto] gap-4 px-3 py-2 hover:bg-muted/30 transition-colors border-b last:border-b-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleToolSelection(tool.name)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{displayName}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {displayDescription}
                      </div>
                      {hasMetadataOverride && !hasSchemaOverride && (
                        <Badge variant="violet" className="mt-1 uppercase">
                          Modified
                        </Badge>
                      )}
                      {hasSchemaOverride && <SchemaOverrideBadge schema={override.schema} />}
                    </div>
                  </div>
                  <div className="items-center">
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
                          <div className="flex-1 max-w-full">
                            <div className="text-sm font-medium truncate">{toolName}</div>
                            <div className="flex items-center gap-1">
                              <CircleAlert className="w-3 h-3 text-amber-500 shrink-0" />
                              <div className="text-xs text-amber-600 dark:text-amber-400">
                                Tool no longer available
                              </div>
                            </div>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-sm">
                        This tool was selected but is not available in the MCP server. Uncheck to
                        remove it.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {/* Needs Approval Checkbox hidden b/c we don't support it yet */}
                  <div className="items-center">
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

      <GenericJsonEditor
        control={form.control}
        name={path('headers')}
        label="Headers"
        placeholder={headersTemplate}
        customTemplate={headersTemplate}
      />

      <ExternalLink
        href={`/${tenantId}/projects/${projectId}/mcp-servers/${selectedNode.data.toolId}/edit`}
      >
        View MCP Server
      </ExternalLink>
      {canEdit && (
        <>
          <Separator />
          <div className="flex justify-end">
            <Button variant="destructive-outline" size="sm" onClick={deleteNode}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
