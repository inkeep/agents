'use client';

import {
  Background,
  ConnectionMode,
  Controls,
  type Edge,
  type Node,
  Panel,
  ReactFlow,
  type ReactFlowProps,
  useReactFlow,
} from '@xyflow/react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { Activity, type FC, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { EdgeType, edgeTypes } from '@/components/agent/configuration/edge-types';
import {
  agentNodeSourceHandleId,
  agentNodeTargetHandleId,
  externalAgentNodeTargetHandleId,
  functionToolNodeHandleId,
  isNodeType,
  mcpNodeHandleId,
  NodeType,
  newNodeDefaults,
  nodeTypes,
  teamAgentNodeTargetHandleId,
} from '@/components/agent/configuration/node-types';
import { resolveCollisions } from '@/components/agent/configuration/resolve-collisions';
import { CopilotStreamingOverlay } from '@/components/agent/copilot-streaming-overlay';
import { EmptyState } from '@/components/agent/empty-state';
import { AgentErrorSummary } from '@/components/agent/error-display/agent-error-summary';
import { apiToFormValues } from '@/components/agent/form/validation';
import NodeLibrary from '@/components/agent/node-library/node-library';
import { EditorLoadingSkeleton } from '@/components/agent/sidepane/editor-loading-skeleton';
import { SidePane } from '@/components/agent/sidepane/sidepane';
import { Toolbar } from '@/components/agent/toolbar';
import { UnsavedChangesDialog } from '@/components/agent/unsaved-changes-dialog';
import { useAgentSelectionSync } from '@/components/agent/use-agent-selection-sync';
import { useAgentShortcuts } from '@/components/agent/use-agent-shortcuts';
import { useAnimateGraph } from '@/components/agent/use-animate-graph';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useCopilotContext } from '@/contexts/copilot';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { commandManager } from '@/features/agent/commands/command-manager';
import { AddNodeCommand, AddPreparedEdgeCommand } from '@/features/agent/commands/commands';
import {
  apiToGraph,
  applySelectionFromQueryState,
  createFunctionToolFormInput,
  createFunctionToolRelationFormInput,
  createMcpRelationFormInput,
  createSubAgentFormInput,
  editorToPayload,
  getFunctionToolRelationFormKey,
  getMcpRelationFormKey,
  getNodeGraphKey,
  syncSavedAgentGraph,
} from '@/features/agent/domain';
import { agentStore, useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { useSidePane } from '@/hooks/use-side-pane';
import { EdgeArrow, SelectedEdgeArrow } from '@/icons';
import { updateFullAgentAction } from '@/lib/actions/agent-full';
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import type { FullAgentResponse } from '@/lib/types/agent-full';
import { generateId } from '@/lib/utils/id-utils';

// The Widget component is heavy, so we load it on the client only after the user clicks the "Try it" button.
const Playground = dynamic(
  () => import('@/components/agent/playground/playground').then((mod) => mod.Playground),
  {
    ssr: false,
    loading: () => <EditorLoadingSkeleton className="p-6" />,
  }
);

const CopilotChat = dynamic(
  () => import('@/components/agent/copilot/copilot-chat').then((mod) => mod.CopilotChat),
  { ssr: false }
);

function getEdgeId(a: string, b: string) {
  const [low, high] = [a, b].sort();
  return `edge-${low}-${high}`;
}

interface AgentProps {
  agent: FullAgentResponse;
}

const SHOW_CHAT_TO_CREATE = false;

const DEFAULT_FUNCTION_TOOL_CODE = `async function execute(args) {
  return {
    success: true,
    data: args,
  };
}`;

const DEFAULT_FUNCTION_TOOL_INPUT_SCHEMA = `{
  "type": "object",
  "properties": {},
  "required": []
}`;

// Handle non-validation errors (permission, auth, not found, server errors)
const nonValidationErrors = new Set([
  'forbidden',
  'unauthorized',
  'not_found',
  'internal_server_error',
  'bad_request',
]);

export const Agent: FC<AgentProps> = ({ agent }) => {
  'use memo';
  const [showPlayground, setShowPlayground] = useState(false);
  const {
    isOpen: isCopilotChatOpen,
    isCopilotConfigured,
    isStreaming: isCopilotStreaming,
  } = useCopilotContext();
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();
  const { tenantId, projectId, agentId } = useParams<{
    tenantId: string;
    projectId: string;
    agentId: string;
  }>();
  const { nodeId, edgeId, setQueryState, openAgentPane, isOpen } = useSidePane();

  const initialNodeId = generateId();
  const initialNode: Node = {
    id: initialNodeId,
    type: NodeType.SubAgent,
    position: { x: 0, y: 0 },
    data: newNodeDefaults[NodeType.SubAgent](initialNodeId),
  };

  const { screenToFlowPosition, fitView } = useReactFlow();
  const form = useFullAgentFormContext();
  const { nodes, edges } = useAgentStore((state) => ({
    nodes: state.nodes,
    edges: state.edges,
  }));
  const {
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange: onEdgesChangeAction,
    setInitial,
    markSaved,
    clearSelection,
    markUnsaved,
    reset,
  } = useAgentActions();
  const { backToAgent, closeSidePane, selectedEdge, selectedNode } = useAgentSelectionSync({
    nodes,
    edges,
    isOpen,
    nodeId,
    edgeId,
    setNodes,
    setEdges,
    setQueryState,
  });

  function onAddInitialNode(): void {
    const newNode = {
      ...initialNode,
      selected: true,
    };
    clearSelection();
    markUnsaved();
    commandManager.execute(new AddNodeCommand(newNode));
    form.setValue(
      `subAgents.${newNode.id}`,
      createSubAgentFormInput({
        id: newNode.id,
        name: 'Sub Agent',
      }),
      { shouldDirty: true }
    );
    form.setValue('defaultSubAgentNodeId', newNode.id, { shouldDirty: true });
    // Wait for sidebar to open (350ms for CSS transition) then center the node
    setTimeout(() => {
      fitView({
        maxZoom: 1,
        duration: 200,
        nodes: [newNode],
      });
    }, 350);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: we only want to run this effect on first render
  useEffect(() => {
    const result = apiToGraph(agent);
    const {
      nodes: agentNodes,
      edges: agentEdges,
      selectedNode,
      selectedEdge,
    } = applySelectionFromQueryState({
      nodes: result.nodes,
      edges: result.edges,
      nodeId,
      edgeId,
    });

    setInitial(agentNodes, agentEdges);

    // After initialization, if there are no nodes and copilot is not configured, auto-add initial node
    // Only auto-add if user has edit permission
    if (agentNodes.length === 0 && (!isCopilotConfigured || !SHOW_CHAT_TO_CREATE) && canEdit) {
      onAddInitialNode();
    }

    // If the nodeId or edgeId in URL doesn't exist in the agent, clear it
    if (nodeId && !selectedNode) {
      setQueryState((prev) => ({
        ...prev,
        nodeId: null,
        pane: 'agent',
      }));
    }
    if (edgeId && !selectedEdge) {
      setQueryState((prev) => ({
        ...prev,
        edgeId: null,
        pane: 'agent',
      }));
    }

    return () => {
      // we need to reset the agent store when the component unmounts otherwise the agent store will persist the changes from the previous agent
      reset();
    };
  }, []);

  // Auto-center agent when sidepane opens/closes
  useEffect(() => {
    // Delay to allow CSS transition to complete (300ms transition + 50ms buffer)
    if (isOpen) {
      return;
    }
    const timer = setTimeout(() => {
      fitView({ maxZoom: 1, duration: 200 });
    }, 350);

    return () => clearTimeout(timer);
  }, [isOpen]);

  // Auto-center agent when playground opens/closes
  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to trigger on showPlayground changes
  useEffect(() => {
    // Delay to allow CSS transition to complete
    const timer = setTimeout(() => {
      fitView({ maxZoom: 1, duration: 200 });
    }, 350);

    return () => clearTimeout(timer);
  }, [showPlayground, isCopilotChatOpen, fitView]);

  const onEdgesChangeWrapped: ReactFlowProps['onEdgesChange'] = (changes) => {
    const removedMcpRelationKeys = changes.flatMap((change) => {
      if (change.type !== 'remove') {
        return [];
      }

      const edgeToRemove = edges.find((edge) => edge.id === change.id);
      if (!edgeToRemove || edgeToRemove.targetHandle !== mcpNodeHandleId) {
        return [];
      }

      const targetNode = nodes.find((node) => node.id === edgeToRemove.target);
      if (!isNodeType(targetNode, NodeType.MCP)) {
        return [];
      }

      return [getMcpRelationFormKey({ nodeId: targetNode.id })];
    });
    const removedFunctionToolRelationKeys = changes.flatMap((change) => {
      if (change.type !== 'remove') {
        return [];
      }

      const edgeToRemove = edges.find((edge) => edge.id === change.id);
      if (!edgeToRemove || edgeToRemove.targetHandle !== functionToolNodeHandleId) {
        return [];
      }

      const targetNode = nodes.find((node) => node.id === edgeToRemove.target);
      if (!isNodeType(targetNode, NodeType.FunctionTool)) {
        return [];
      }

      const nodeKey = getNodeGraphKey(targetNode);
      return nodeKey ? [getFunctionToolRelationFormKey({ nodeKey })] : [];
    });

    onEdgesChangeAction(changes);

    const ids = [
      ...removedMcpRelationKeys.map(
        (relationKey) => `mcpRelations.${relationKey}.relationshipId` as const
      ),
      ...removedFunctionToolRelationKeys.map(
        (relationKey) => `functionToolRelations.${relationKey}.relationshipId` as const
      ),
    ];
    form.unregister(ids);
  };

  const onConnectWrapped: ReactFlowProps['onConnect'] = (params) => {
    if (!canEdit) return;
    markUnsaved();
    const isSelfLoop = params.source === params.target;
    const id = isSelfLoop ? `edge-self-${params.source}` : getEdgeId(params.source, params.target);
    let newEdge: Edge = { id, ...params };
    const { sourceHandle, targetHandle } = params;

    // Check for self-loop
    if (isSelfLoop) {
      newEdge = {
        ...newEdge,
        type: EdgeType.SelfLoop,
        selected: true,
        data: {
          relationships: {
            transferTargetToSource: false,
            transferSourceToTarget: true,
            delegateTargetToSource: false,
            delegateSourceToTarget: false,
          },
        },
      };
    } else if (
      (sourceHandle === agentNodeSourceHandleId || sourceHandle === agentNodeTargetHandleId) &&
      (targetHandle === agentNodeTargetHandleId || targetHandle === agentNodeSourceHandleId)
    ) {
      newEdge = {
        ...newEdge,
        type: EdgeType.A2A,
        selected: true,
        data: {
          relationships: {
            transferTargetToSource: false,
            transferSourceToTarget: false,
            delegateTargetToSource: false,
            delegateSourceToTarget: true,
          },
        },
      };
    } else if (
      (sourceHandle === agentNodeSourceHandleId || sourceHandle === agentNodeTargetHandleId) &&
      targetHandle === externalAgentNodeTargetHandleId
    ) {
      newEdge = {
        ...newEdge,
        type: EdgeType.A2AExternal,
        data: {
          relationships: {
            transferTargetToSource: false,
            transferSourceToTarget: false,
            delegateTargetToSource: false,
            delegateSourceToTarget: true, // this is the only valid option for external agents to connect to internal agents
          },
        },
      };
    } else if (
      (sourceHandle === agentNodeSourceHandleId || sourceHandle === agentNodeTargetHandleId) &&
      targetHandle === teamAgentNodeTargetHandleId
    ) {
      newEdge = {
        ...newEdge,
        type: EdgeType.A2ATeam,
        selected: true,
        data: {
          relationships: {
            transferTargetToSource: false,
            transferSourceToTarget: false,
            delegateTargetToSource: false,
            delegateSourceToTarget: true,
          },
        },
      };
    }

    if (
      (targetHandle === mcpNodeHandleId || targetHandle === functionToolNodeHandleId) &&
      (sourceHandle === agentNodeSourceHandleId || sourceHandle === agentNodeTargetHandleId)
    ) {
      const targetNode = nodes.find((n) => n.id === params.target);
      if (
        targetNode &&
        (targetNode.type === NodeType.MCP || targetNode.type === NodeType.FunctionTool)
      ) {
        if (edges.some((edge) => edge.target === targetNode.id)) {
          toast.error('This tool is already connected. Connect to a new tool node.');
          return;
        }
        if (isNodeType(targetNode, NodeType.MCP)) {
          const relationKey = getMcpRelationFormKey({ nodeId: targetNode.id });
          const existingRelation = form.getValues(`mcpRelations.${relationKey}`);
          form.setValue(
            `mcpRelations.${relationKey}`,
            {
              ...createMcpRelationFormInput({
                toolId: targetNode.data.toolId,
              }),
              ...existingRelation,
            },
            { shouldDirty: true }
          );
        } else {
          const relationKey = getNodeGraphKey(targetNode);
          if (!relationKey) {
            toast.error('Function tool is missing graph identity.');
            return;
          }
          const existingRelation = form.getValues(`functionToolRelations.${relationKey}`);
          form.setValue(
            `functionToolRelations.${getFunctionToolRelationFormKey({ nodeKey: relationKey })}`,
            {
              ...createFunctionToolRelationFormInput(),
              ...existingRelation,
            },
            { shouldDirty: true }
          );
        }
      }
    }

    requestAnimationFrame(() => {
      commandManager.execute(
        new AddPreparedEdgeCommand(newEdge, { deselectOtherEdgesIfA2A: true })
      );
    });
  };

  const onDrop: ReactFlowProps['onDrop'] = (event) => {
    event.preventDefault();
    if (!canEdit) return;
    const node = event.dataTransfer.getData('application/reactflow');
    if (!node) {
      return;
    }
    const nodeType: keyof typeof newNodeDefaults = JSON.parse(node).type;
    const newNodeId = generateId();
    const newNode = {
      id: newNodeId,
      type: nodeType,
      position: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      selected: true,
      data: newNodeDefaults[nodeType](newNodeId),
    } satisfies Node;
    const toolId = nodeType === NodeType.FunctionTool ? newNode.id : null;

    if (toolId) {
      form.setValue(
        `functionTools.${toolId}`,
        createFunctionToolFormInput({
          functionId: toolId,
          name: 'Function Tool',
        }),
        { shouldDirty: true }
      );
      form.setValue(
        `functions.${toolId}`,
        {
          executeCode: DEFAULT_FUNCTION_TOOL_CODE,
          inputSchema: DEFAULT_FUNCTION_TOOL_INPUT_SCHEMA,
        },
        { shouldDirty: true }
      );
    }

    clearSelection();
    commandManager.execute(new AddNodeCommand(newNode));
  };

  useAgentShortcuts();

  const onSubmit = form.handleSubmit(
    async ({ mcpRelations, defaultSubAgentNodeId, ...data }): Promise<void> => {
      const serializedData = editorToPayload(nodes, edges, {
        mcpRelations: mcpRelations ?? {},
        functionToolRelations: data.functionToolRelations ?? {},
        functionTools: data.functionTools ?? {},
        externalAgents: data.externalAgents ?? {},
        teamAgents: data.teamAgents ?? {},
        subAgents: data.subAgents ?? {},
        functions: data.functions ?? {},
        defaultSubAgentNodeId,
      });
      const res = await updateFullAgentAction(tenantId, projectId, agentId, {
        ...data,
        defaultSubAgentId: serializedData.defaultSubAgentId,
        subAgents: serializedData.subAgents,
        functionTools: serializedData.functionTools,
        functions: serializedData.functions,
      });

      if (res.success) {
        toast.success('Agent saved', { closeButton: true });
        markSaved();
        const syncedGraph = syncSavedAgentGraph({
          nodes,
          edges,
          savedAgent: res.data,
          nodeId,
          edgeId,
          subAgentFormData: data.subAgents,
          functionToolRelations: data.functionToolRelations,
        });

        setQueryState((prev) => ({
          ...prev,
          pane:
            (prev.pane === 'node' && !syncedGraph.nodeId) ||
            (prev.pane === 'edge' && !syncedGraph.edgeId)
              ? 'agent'
              : prev.pane,
          nodeId: syncedGraph.nodeId,
          edgeId: syncedGraph.edgeId,
        }));
        form.reset(apiToFormValues(res.data));
        setInitial(syncedGraph.nodes, syncedGraph.edges);
        return;
      }

      if (res.code && nonValidationErrors.has(res.code)) {
        const error = res.error || 'An error occurred while saving the agent';
        toast.error(error, { closeButton: true });
        return;
      }

      // Handle validation errors (422 status - unprocessable_entity)
      try {
        const issues: z.ZodIssue[] = JSON.parse(res.error);
        issues.forEach(({ path, code, message }) => {
          form.setError(path.join('.') as any, { type: code, message });
        });
      } catch (parseError) {
        // Fallback for unparseable errors
        console.error('Failed to parse validation errors:', parseError);
        toast.error('Failed to save agent', { closeButton: true });
      }
    },
    console.error
  );

  useAnimateGraph();

  const onNodeClick: ReactFlowProps['onNodeClick'] = (_, node) => {
    if (isOpen) {
      return;
    }
    setTimeout(() => {
      fitView({
        maxZoom: 1,
        duration: 200,
        nodes: [node],
      });
    }, 350);
  };

  const [showTraces, setShowTraces] = useState(false);
  const isMounted = useIsMounted();

  const showEmptyState = !nodes.length && isCopilotConfigured && SHOW_CHAT_TO_CREATE;

  const showSidePane =
    isOpen &&
    /**
     * Prevents layout shift of pane when it's opened by default (when nodeId/edgeId are in query params).
     *
     * The panel width depends on values stored in `localStorage`, which are only
     * accessible after the component has mounted. This component delays rendering
     * until then to avoid visual layout jumps.
     */
    isMounted &&
    !showEmptyState;

  return (
    <ResizablePanelGroup
      // Note: Without a specified `id`, Cypress tests may become flaky and fail with the error: `No group found for id '...'`
      id="agent-panel-group"
      direction="horizontal"
      autoSaveId="agent-resizable-layout-state"
      className="relative bg-muted/20 dark:bg-background flex overflow-hidden no-parent-container"
    >
      <CopilotChat />
      <ResizablePanel
        // Panel id and order props recommended when panels are dynamically rendered
        id="react-flow-pane"
        order={1}
        minSize={30}
        // fixes WARNING: Panel defaultSize prop recommended to avoid layout shift after server rendering
        defaultSize={100}
        className="relative"
      >
        {isCopilotStreaming && <CopilotStreamingOverlay />}
        <EdgeArrow className="absolute" />
        <SelectedEdgeArrow className="absolute" />
        <ReactFlow
          defaultEdgeOptions={{
            // Built-in 'default' edges ignore the `data` prop.
            // Use a custom edge type instead to access `data` in rendering.
            type: 'custom',
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChangeWrapped}
          onConnect={onConnectWrapped}
          onDrop={onDrop}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          fitView
          snapToGrid
          snapGrid={[20, 20]}
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.3}
          connectionMode={ConnectionMode.Loose}
          isValidConnection={({ sourceHandle, targetHandle }) => {
            // we don't want to allow connections between MCP nodes
            if (sourceHandle === mcpNodeHandleId && targetHandle === mcpNodeHandleId) {
              return false;
            }
            return true;
          }}
          nodesConnectable={canEdit}
          nodesDraggable={canEdit}
          onNodeClick={onNodeClick}
          onNodeDragStop={() => {
            setNodes(resolveCollisions);
          }}
          onBeforeDelete={async (state) => {
            const defaultSubAgentNodeId = form.getValues('defaultSubAgentNodeId')
            const hasDefaultNode = state.nodes.some((node) => node.id === defaultSubAgentNodeId);
            if (hasDefaultNode) {
              toast.error(`Cannot delete default subagent "${defaultSubAgentNodeId}"`);
              return false;
            }
            // Trigger dirty state
            agentStore.setState((state) => ({
              history: [...state.history, { nodes: state.nodes, edges: state.edges }],
              dirty: true,
            }));
            for (const node of state.nodes) {
              if (isNodeType(node, NodeType.FunctionTool)) {
                const { toolId } = node.data;
                const functionId = form.getValues(`functionTools.${toolId}.functionId`);
                const relationKey = getNodeGraphKey(node);
                form.unregister([
                  ...(functionId ? ([`functions.${functionId}`] as const) : []),
                  `functionTools.${toolId}`,
                  ...(relationKey ? ([`functionToolRelations.${relationKey}`] as const) : []),
                ]);
              } else if (isNodeType(node, NodeType.MCP)) {
                form.unregister(`mcpRelations.${getMcpRelationFormKey({ nodeId: node.id })}`);
              } else if (isNodeType(node, NodeType.TeamAgent)) {
                form.unregister(`teamAgents.${node.data.teamAgentId}`);
              } else if (isNodeType(node, NodeType.ExternalAgent)) {
                form.unregister(`externalAgents.${node.data.externalAgentId}`);
              } else if (node.type === NodeType.SubAgent) {
                form.unregister(`subAgents.${node.id}`);
              }
            }

            return state;
          }}
        >
          <Background color="#a8a29e" gap={20} />
          <Controls className="text-foreground" showInteractive={false} />
          {!showEmptyState && canEdit && (
            <Panel position="top-left">
              <NodeLibrary />
            </Panel>
          )}

          {showEmptyState && canEdit && (
            <Panel position="top-center" className="top-1/2! -translate-y-1/2">
              <EmptyState onAddInitialNode={onAddInitialNode} />
            </Panel>
          )}
          {!showEmptyState && (
            <Panel
              position="top-right"
              // width of NodeLibrary; pointer-events-none so handles below are reachable
              className="left-40 pointer-events-none"
            >
              <form onSubmit={onSubmit}>
                <Toolbar
                  toggleSidePane={isOpen ? backToAgent : openAgentPane}
                  setShowPlayground={() => {
                    closeSidePane();
                    setShowPlayground(true);
                  }}
                />
              </form>
            </Panel>
          )}
          <Panel position="bottom-left" className="max-w-sm left-8!">
            <AgentErrorSummary />
          </Panel>
        </ReactFlow>
      </ResizablePanel>

      <Activity mode={showSidePane ? 'visible' : 'hidden'}>
        <ResizableHandle withHandle />
        <ResizablePanel
          minSize={30}
          // Panel id and order props recommended when panels are dynamically rendered
          id="side-pane"
          order={2}
        >
          <SidePane
            selectedNodeId={selectedNode?.id ?? null}
            selectedEdgeId={selectedEdge?.id ?? null}
            onClose={closeSidePane}
            backToAgent={backToAgent}
            disabled={isCopilotStreaming || !canEdit}
          />
        </ResizablePanel>
      </Activity>
      <Activity mode={showPlayground ? 'visible' : 'hidden'}>
        {!showTraces && <ResizableHandle withHandle />}
        <ResizablePanel
          minSize={25}
          // Panel id and order props recommended when panels are dynamically rendered
          id="playground-pane"
          order={3}
          className={showTraces ? 'w-full flex-none!' : ''}
        >
          <Playground
            setShowPlayground={setShowPlayground}
            closeSidePane={closeSidePane}
            showTraces={showTraces}
            setShowTraces={setShowTraces}
          />
        </ResizablePanel>
      </Activity>
      <UnsavedChangesDialog onSubmit={onSubmit} />
    </ResizablePanelGroup>
  );
};
