'use client';

import {
  Background,
  type Connection,
  ConnectionMode,
  Controls,
  type Edge,
  type IsValidConnection,
  type Node,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useOnSelectionChange,
  useReactFlow,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { commandManager } from '@/features/agent/commands/command-manager';
import { AddNodeCommand, AddPreparedEdgeCommand } from '@/features/agent/commands/commands';
import {
  applyDagreLayout,
  deserializeAgentData,
  type ExtendedFullAgentDefinition,
  extractAgentMetadata,
  serializeAgentData,
  validateSerializedData,
} from '@/features/agent/domain';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { useAgentShortcuts } from '@/features/agent/ui/use-agent-shortcuts';
import { useAgentErrors } from '@/hooks/use-agent-errors';
import { useSidePane } from '@/hooks/use-side-pane';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { Credential } from '@/lib/api/credentials';
import type { DataComponent } from '@/lib/api/data-components';
import { saveAgent } from '@/lib/services/save-agent';
import type { MCPTool } from '@/lib/types/tools';
import { getErrorSummaryMessage, parseAgentValidationErrors } from '@/lib/utils/agent-error-parser';
import { getToolTypeAndName } from '@/lib/utils/mcp-utils';
import { detectOrphanedToolsAndGetWarning } from '@/lib/utils/orphaned-tools-detector';

// Type for agent tool configuration lookup including both selection and headers
export type AgentToolConfig = {
  toolId: string;
  toolSelection?: string[];
  headers?: Record<string, string>;
};

// AgentToolConfigLookup: subAgentId -> relationshipId -> config
export type AgentToolConfigLookup = Record<string, Record<string, AgentToolConfig>>;

import { EdgeType, edgeTypes, initialEdges } from './configuration/edge-types';
import {
  agentNodeSourceHandleId,
  agentNodeTargetHandleId,
  externalAgentNodeTargetHandleId,
  type MCPNodeData,
  mcpNodeHandleId,
  NodeType,
  newNodeDefaults,
  nodeTypes,
} from './configuration/node-types';
import { AgentErrorSummary } from './error-display/agent-error-summary';
import { DefaultMarker } from './markers/default-marker';
import { SelectedMarker } from './markers/selected-marker';
import NodeLibrary from './node-library/node-library';
import { Playground } from './playground/playground';
import { SidePane } from './sidepane/sidepane';
import { Toolbar } from './toolbar/toolbar';

function getEdgeId(a: string, b: string) {
  const [low, high] = [a, b].sort();
  return `edge-${low}-${high}`;
}

interface AgentProps {
  agent?: ExtendedFullAgentDefinition;
  dataComponentLookup?: Record<string, DataComponent>;
  artifactComponentLookup?: Record<string, ArtifactComponent>;
  toolLookup?: Record<string, MCPTool>;
  credentialLookup?: Record<string, Credential>;
}

function Flow({
  agent,
  dataComponentLookup = {},
  artifactComponentLookup = {},
  toolLookup = {},
  credentialLookup = {},
}: AgentProps) {
  const [showPlayground, setShowPlayground] = useState(false);
  const router = useRouter();

  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  const { nodeId, edgeId, setQueryState, openAgentPane, isOpen } = useSidePane();

  const initialNodes = useMemo<Node[]>(
    () => [
      {
        id: nanoid(),
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: { name: '', isDefault: true },
        deletable: false,
      },
    ],
    []
  );

  // Helper to enrich MCP nodes with tool data
  const enrichNodes = useCallback(
    (nodes: Node[]): Node[] => {
      return nodes.map((node) => {
        if (node.type === NodeType.MCP && node.data && 'toolId' in node.data) {
          const tool = toolLookup[node.data.toolId as string];
          if (tool) {
            let provider = null;
            provider = getToolTypeAndName(tool).type;

            return {
              ...node,
              data: {
                ...node.data,
                name: tool.name,
                imageUrl: tool.imageUrl,
                provider,
              },
            };
          }
        }
        return node;
      });
    },
    [toolLookup]
  );

  const { nodes: agentNodes, edges: agentEdges } = useMemo(() => {
    const result = agent
      ? deserializeAgentData(agent)
      : { nodes: initialNodes, edges: initialEdges };
    return {
      ...result,
      nodes: nodeId
        ? enrichNodes(result.nodes).map((node) => ({
            ...node,
            selected: node.id === nodeId,
          }))
        : enrichNodes(result.nodes),
      edges: edgeId
        ? result.edges.map((edge) => ({
            ...edge,
            selected: edge.id === edgeId,
          }))
        : result.edges,
    };
  }, [agent, enrichNodes, initialNodes, nodeId, edgeId]);

  const agentToolConfigLookup = useMemo((): AgentToolConfigLookup => {
    if (!agent?.subAgents) return {} as AgentToolConfigLookup;

    const lookup: AgentToolConfigLookup = {};
    Object.entries(agent.subAgents).forEach(([subAgentId, agentData]) => {
      if ('canUse' in agentData && agentData.canUse) {
        const toolsMap: Record<string, AgentToolConfig> = {};
        agentData.canUse.forEach((tool) => {
          if (tool.agentToolRelationId) {
            const config: AgentToolConfig = {
              toolId: tool.toolId,
            };

            if (tool.toolSelection) {
              config.toolSelection = tool.toolSelection;
            }

            if (tool.headers) {
              config.headers = tool.headers;
            }

            toolsMap[tool.agentToolRelationId] = config;
          }
        });
        if (Object.keys(toolsMap).length > 0) {
          lookup[subAgentId] = toolsMap;
        }
      }
    });
    return lookup;
  }, [agent?.subAgents]);

  const {
    screenToFlowPosition,
    updateNodeData,
    fitView,
    getNodes,
    getEdges,
    getIntersectingNodes,
  } = useReactFlow();
  const { storeNodes, edges, metadata } = useAgentStore((state) => ({
    storeNodes: state.nodes,
    edges: state.edges,
    metadata: state.metadata,
  }));
  const {
    setNodes,
    setEdges,
    onNodesChange: storeOnNodesChange,
    onEdgesChange,
    setMetadata,
    setInitial,
    markSaved,
    clearSelection,
    markUnsaved,
    reset,
  } = useAgentActions();

  // Always use enriched nodes for ReactFlow
  const nodes = useMemo(() => enrichNodes(storeNodes), [storeNodes, enrichNodes]);
  const { errors, showErrors, setErrors, clearErrors, setShowErrors } = useAgentErrors();

  /**
   * Custom `onNodesChange` handler that relayouts the agent using Dagre
   * when a `replace` change causes node intersections.
   **/
  const onNodesChange: typeof storeOnNodesChange = useCallback(
    (changes) => {
      storeOnNodesChange(changes);

      const replaceChanges = changes.filter((change) => change.type === 'replace');
      if (!replaceChanges.length) {
        return;
      }
      // Using `setTimeout` instead of `requestAnimationFrame` ensures updated node positions are available,
      // as `requestAnimationFrame` may run too early, causing `hasIntersections` to incorrectly return false.
      setTimeout(() => {
        const currentNodes = getNodes();
        for (const change of replaceChanges) {
          const node = currentNodes.find((n) => n.id === change.id);
          if (!node) {
            continue;
          }
          // Use React Flow's intersection detection
          const intersectingNodes = getIntersectingNodes(node);
          if (intersectingNodes.length > 0) {
            // Apply Dagre layout to resolve intersections
            setNodes((prev) => applyDagreLayout(prev, getEdges()));
            return; // exit loop
          }
        }
      }, 0);
    },
    [getNodes, getEdges, getIntersectingNodes, setNodes, storeOnNodesChange]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: we only want to run this effect on first render
  useEffect(() => {
    setInitial(
      agentNodes,
      agentEdges,
      extractAgentMetadata(agent),
      dataComponentLookup,
      artifactComponentLookup,
      toolLookup,
      agentToolConfigLookup
    );

    return () => {
      // we need to reset the agent store when the component unmounts otherwise the agent store will persist the changes from the previous agent
      reset();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: we only want to run this effect on first render
  useEffect(() => {
    // If the nodeId or edgeId in URL doesn't exist in the agent, clear it
    if (nodeId && !agentNodes.some((node) => node.id === nodeId)) {
      setQueryState((prev) => ({
        ...prev,
        nodeId: null,
        pane: 'agent',
      }));
    }
    if (edgeId && !agentEdges.some((edge) => edge.id === edgeId)) {
      setQueryState((prev) => ({
        ...prev,
        edgeId: null,
        pane: 'agent',
      }));
    }
  }, []);

  // Auto-center agent when sidepane opens/closes
  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to trigger on isOpen changes
  useEffect(() => {
    // Delay to allow CSS transition to complete (300ms transition + 50ms buffer)
    const timer = setTimeout(() => {
      fitView({ maxZoom: 1, duration: 200 });
    }, 350);

    return () => clearTimeout(timer);
  }, [isOpen, fitView]);

  // Auto-center agent when playground opens/closes
  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to trigger on showPlayground changes
  useEffect(() => {
    // Delay to allow CSS transition to complete
    const timer = setTimeout(() => {
      fitView({ maxZoom: 1, duration: 200 });
    }, 350);

    return () => clearTimeout(timer);
  }, [showPlayground, fitView]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: we only want to add/connect edges once
  const onConnectWrapped = useCallback((params: Connection) => {
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
            transferSourceToTarget: true,
            delegateTargetToSource: false,
            delegateSourceToTarget: false,
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
    }

    // Update MCP node subAgentId when connecting agent to MCP tool
    if (
      targetHandle === mcpNodeHandleId &&
      (sourceHandle === agentNodeSourceHandleId || sourceHandle === agentNodeTargetHandleId)
    ) {
      const targetNode = nodes.find((n) => n.id === params.target);
      if (targetNode && targetNode.type === NodeType.MCP) {
        const subAgentId = params.source;
        updateNodeData(targetNode.id, {
          ...targetNode.data,
          subAgentId,
          relationshipId: null, // Will be set after saving to database
        });
      }
    }

    requestAnimationFrame(() => {
      commandManager.execute(
        new AddPreparedEdgeCommand(newEdge, { deselectOtherEdgesIfA2A: true })
      );
    });
  }, []);

  const isValidConnection: IsValidConnection = useCallback(({ sourceHandle, targetHandle }) => {
    // we don't want to allow connections between MCP nodes
    if (sourceHandle === mcpNodeHandleId && targetHandle === mcpNodeHandleId) {
      return false;
    }
    return true;
  }, []);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const node = event.dataTransfer.getData('application/reactflow');
      if (!node) {
        return;
      }
      const nodeData = JSON.parse(node);
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const nodeId = nanoid();
      const newNode = {
        id: nodeId,
        type: nodeData.type,
        position,
        selected: true,
        data: {
          ...newNodeDefaults[nodeData.type as keyof typeof newNodeDefaults],
        },
      };

      clearSelection();
      commandManager.execute(new AddNodeCommand(newNode as Node));
    },
    [screenToFlowPosition, clearSelection]
  );

  const onSelectionChange = useCallback(
    ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
      const node = nodes.length === 1 ? nodes[0] : null;
      const edge =
        edges.length === 1 &&
        (edges[0]?.type === EdgeType.A2A || edges[0]?.type === EdgeType.SelfLoop)
          ? edges[0]
          : null;
      const defaultPane = isOpen ? 'agent' : null;
      setQueryState(
        {
          pane: node ? 'node' : edge ? 'edge' : defaultPane,
          nodeId: node ? node.id : null,
          edgeId: edge ? edge.id : null,
        },
        { history: 'replace' }
      );
    },
    [setQueryState, isOpen]
  );

  useOnSelectionChange({
    onChange: onSelectionChange,
  });

  useAgentShortcuts();

  const closeSidePane = useCallback(() => {
    setEdges((edges) => edges.map((edge) => ({ ...edge, selected: false })));
    setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })));
    setQueryState({
      pane: null,
      nodeId: null,
      edgeId: null,
    });
  }, [setQueryState, setEdges, setNodes]);

  const backToAgent = useCallback(() => {
    setEdges((edges) => edges.map((edge) => ({ ...edge, selected: false })));
    setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })));
    setQueryState({
      pane: 'agent',
      nodeId: null,
      edgeId: null,
    });
  }, [setQueryState, setEdges, setNodes]);

  const handleNavigateToNode = useCallback(
    (nodeId: string) => {
      // The nodeId parameter is actually the agent ID from error parsing
      // We need to find the React Flow node that has this agent ID
      const targetNode = nodes.find(
        (node) =>
          node.id === nodeId || // Direct match (no custom ID set)
          (node.data as any)?.id === nodeId // Custom agent ID match
      );

      if (targetNode) {
        // Clear selection and select the target node
        setNodes((nodes) =>
          nodes.map((node) => ({
            ...node,
            selected: node.id === targetNode.id,
          }))
        );
        setEdges((edges) => edges.map((edge) => ({ ...edge, selected: false })));
        // Open the sidepane for the selected node
        setQueryState({
          pane: 'node',
          nodeId: targetNode.id,
          edgeId: null,
        });
      }
    },
    [setNodes, setEdges, nodes, setQueryState]
  );

  const handleNavigateToEdge = useCallback(
    (edgeId: string) => {
      // The edgeId parameter is from error parsing
      // We need to find the React Flow edge that has this ID
      const targetEdge = edges.find((edge) => edge.id === edgeId);

      if (targetEdge) {
        // Clear selection and select the target edge
        setEdges((edges) =>
          edges.map((edge) => ({
            ...edge,
            selected: edge.id === targetEdge.id,
          }))
        );
        setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })));

        // Open the sidepane for the selected edge
        setQueryState({
          pane: 'edge',
          nodeId: null,
          edgeId: targetEdge.id,
        });
      }
    },
    [setEdges, setNodes, edges, setQueryState]
  );

  const onSubmit = useCallback(async () => {
    // Check for orphaned tools before saving
    const warningMessage = detectOrphanedToolsAndGetWarning(
      nodes,
      agentToolConfigLookup,
      toolLookup
    );

    if (warningMessage) {
      toast.warning(warningMessage, {
        closeButton: true,
        duration: 6000,
      });
    }

    const serializedData = serializeAgentData(
      nodes,
      edges,
      metadata,
      dataComponentLookup,
      artifactComponentLookup,
      agentToolConfigLookup
    );

    const functionToolNodeMap = new Map<string, string>();
    nodes.forEach((node) => {
      if (node.type === NodeType.FunctionTool) {
        const nodeData = node.data as any;
        const toolId = nodeData.toolId || nodeData.functionToolId || node.id;
        functionToolNodeMap.set(toolId, node.id);
      }
    });

    const validationErrors = validateSerializedData(serializedData, functionToolNodeMap);
    if (validationErrors.length > 0) {
      const errorObjects = validationErrors.map((error) => ({
        message: error.message,
        field: error.field,
        code: error.code,
        path: error.path,
        functionToolId: error.functionToolId,
      }));

      const errorSummary = parseAgentValidationErrors(JSON.stringify(errorObjects));
      setErrors(errorSummary);
      toast.error(`Validation failed: ${validationErrors[0].message}`);
      return;
    }

    const res = await saveAgent(
      tenantId,
      projectId,
      serializedData,
      agent?.id // agentid is required and added to the serialized data if it does not exist so we need to pass is separately to know whether to create or update
    );

    if (res.success) {
      // Clear any existing errors on successful save
      clearErrors();
      toast.success('Agent saved', {
        closeButton: true,
      });
      markSaved();

      // Update MCP nodes with new relationshipIds from backend response
      if (res.data) {
        const processedRelationships = new Set<string>();

        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (node.type === NodeType.MCP) {
              const mcpNode = node as Node & { data: MCPNodeData };
              if (mcpNode.data.subAgentId && mcpNode.data.toolId) {
                // If node already has a relationshipId, keep it (it's an existing relationship)
                if (mcpNode.data.relationshipId) {
                  return node;
                }

                // For new nodes (relationshipId is null), find the first unprocessed relationship
                // that matches this agent and tool
                const subAgentId = mcpNode.data.subAgentId;
                const toolId = mcpNode.data.toolId;

                if (
                  'canUse' in res.data.subAgents[subAgentId] &&
                  res.data.subAgents[subAgentId].canUse
                ) {
                  const matchingRelationship = res.data.subAgents[subAgentId].canUse.find(
                    (tool: any) =>
                      tool.toolId === toolId &&
                      tool.agentToolRelationId &&
                      !processedRelationships.has(tool.agentToolRelationId)
                  );

                  if (matchingRelationship?.agentToolRelationId) {
                    processedRelationships.add(matchingRelationship.agentToolRelationId);
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        relationshipId: matchingRelationship.agentToolRelationId,
                      },
                    };
                  }
                }
              }
            }
            return node;
          })
        );
      }

      if (!agent?.id && res.data?.id) {
        setMetadata('id', res.data.id);
        router.push(`/${tenantId}/projects/${projectId}/agents/${res.data.id}`);
      }
    } else {
      try {
        const errorSummary = parseAgentValidationErrors(res.error);
        setErrors(errorSummary);

        const summaryMessage = getErrorSummaryMessage(errorSummary);
        toast.error(summaryMessage || 'Failed to save agent - validation errors found.');
      } catch (parseError) {
        // Fallback for unparseable errors
        console.error('Failed to parse validation errors:', parseError);
        toast.error('Failed to save agent', {
          closeButton: true,
        });
      }
    }
  }, [
    nodes,
    edges,
    metadata,
    dataComponentLookup,
    artifactComponentLookup,
    markSaved,
    setMetadata,
    setNodes,
    router,
    agent?.id,
    tenantId,
    projectId,
    clearErrors,
    setErrors,
    agentToolConfigLookup,
    toolLookup,
  ]);

  useEffect(() => {
    const onDataOperation: EventListenerOrEventListenerObject = (event) => {
      // @ts-expect-error -- improve types
      const { conversationId, timestamp, ...data } = event.detail;
      console.log('Data operation:', data);

      switch (data.type) {
        case 'delegation_sent': {
          const { fromSubAgent, targetSubAgent } = data.details.data;
          setEdges((prevEdges) =>
            prevEdges.map((edge) =>
              edge.source === fromSubAgent && edge.target === targetSubAgent
                ? {
                    ...edge,
                    data: { ...edge.data, isDelegating: true },
                  }
                : edge
            )
          );
          setNodes((prevNodes) =>
            prevNodes.map((node) =>
              node.id === fromSubAgent || node.id === targetSubAgent
                ? {
                    ...node,
                    data: { ...node.data, isDelegating: true },
                  }
                : node
            )
          );
          break;
        }
        case 'delegation_returned': {
          const { targetSubAgent } = data.details.data;
          setEdges((prevEdges) =>
            prevEdges.map((edge) => ({
              ...edge,
              data: { ...edge.data, isDelegating: false },
            }))
          );
          setNodes((prevNodes) =>
            prevNodes.map((node) => ({
              ...node,
              data: { ...node.data, isExecuting: false, isDelegating: node.id === targetSubAgent },
            }))
          );
          break;
        }
        case 'tool_call': {
          const { toolName } = data.details.data;
          const { subAgentId } = data.details;
          setNodes((prevNodes) => {
            setEdges((prevEdges) =>
              prevEdges.map((edge) => {
                const node = prevNodes.find((node) => node.id === edge.target);
                const toolId = node?.data.toolId as string;
                const toolData = toolLookup[toolId];
                const hasTool = toolData?.availableTools?.some((tool) => tool.name === toolName);
                const hasDots = edge.source === subAgentId && hasTool;
                return hasDots
                  ? {
                      ...edge,
                      data: { ...edge.data, isDelegating: true },
                    }
                  : edge;
              })
            );
            return prevNodes.map((node) => {
              const toolId = node.data.toolId as string;
              const toolData = toolLookup[toolId];

              return node.data.id === subAgentId ||
                toolData?.availableTools?.some((tool) => tool.name === toolName)
                ? {
                    ...node,
                    data: { ...node.data, isDelegating: true },
                  }
                : node;
            });
          });
          break;
        }
        case 'tool_result': {
          const { toolName } = data.details.data;
          setNodes((prevNodes) => {
            return prevNodes.map((node) => {
              const toolId = node.data.toolId as string;
              const toolData = toolLookup[toolId];
              return toolData?.availableTools?.some((tool) => tool.name === toolName)
                ? {
                    ...node,
                    data: { ...node.data, isExecuting: true },
                  }
                : node;
            });
          });
          break;
        }
        case 'completion': {
          onCompletion();
          break;
        }
        case 'agent_generate': {
          const { subAgentId } = data.details;
          setNodes((prevNodes) =>
            prevNodes.map((node) => ({
              ...node,
              data: { ...node.data, isExecuting: node.id === subAgentId },
            }))
          );
          break;
        }
      }
    };

    const onCompletion = () => {
      setEdges((prevEdges) =>
        prevEdges.map((edge) => ({
          ...edge,
          data: { ...edge.data, isDelegating: false },
        }))
      );
      setNodes((prevNodes) =>
        prevNodes.map((node) => ({
          ...node,
          data: { ...node.data, isExecuting: false, isDelegating: false },
        }))
      );
    };

    document.addEventListener('ikp-data-operation', onDataOperation);
    document.addEventListener('ikp-aborted', onCompletion);
    return () => {
      document.removeEventListener('ikp-data-operation', onDataOperation);
      document.removeEventListener('ikp-aborted', onCompletion);
    };
  }, [setEdges, toolLookup, setNodes]);

  return (
    <div className="w-full h-full relative bg-muted/20 dark:bg-background flex rounded-b-[14px] overflow-hidden">
      <div className={`flex-1 h-full relative transition-all duration-300 ease-in-out`}>
        <DefaultMarker />
        <SelectedMarker />
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
          onEdgesChange={onEdgesChange}
          onConnect={onConnectWrapped}
          onDrop={onDrop}
          onDragOver={onDragOver}
          fitView
          snapToGrid
          snapGrid={[20, 20]}
          fitViewOptions={{
            maxZoom: 1,
          }}
          connectionMode={ConnectionMode.Loose}
          isValidConnection={isValidConnection}
        >
          <Background color="#a8a29e" gap={20} />
          <Controls className="text-foreground" showInteractive={false} />
          <Panel position="top-left">
            <NodeLibrary />
          </Panel>
          <Panel position="top-right">
            <Toolbar
              onSubmit={onSubmit}
              inPreviewDisabled={!agent?.id}
              toggleSidePane={isOpen ? backToAgent : openAgentPane}
              setShowPlayground={() => {
                closeSidePane();
                setShowPlayground(true);
              }}
            />
          </Panel>
          {errors && showErrors && (
            <Panel position="bottom-left" className="max-w-sm !left-8 mb-4">
              <AgentErrorSummary
                errorSummary={errors}
                onClose={() => setShowErrors(false)}
                onNavigateToNode={handleNavigateToNode}
                onNavigateToEdge={handleNavigateToEdge}
              />
            </Panel>
          )}
        </ReactFlow>
      </div>
      <SidePane
        selectedNodeId={nodeId}
        selectedEdgeId={edgeId}
        isOpen={isOpen}
        onClose={closeSidePane}
        backToAgent={backToAgent}
        dataComponentLookup={dataComponentLookup}
        artifactComponentLookup={artifactComponentLookup}
        agentToolConfigLookup={agentToolConfigLookup}
        credentialLookup={credentialLookup}
      />
      {showPlayground && agent?.id && (
        <Playground
          agentId={agent?.id}
          projectId={projectId}
          tenantId={tenantId}
          setShowPlayground={setShowPlayground}
          closeSidePane={closeSidePane}
          dataComponentLookup={dataComponentLookup}
        />
      )}
    </div>
  );
}

export function Agent({
  agent,
  dataComponentLookup,
  artifactComponentLookup,
  toolLookup,
  credentialLookup,
}: AgentProps) {
  return (
    <ReactFlowProvider>
      <Flow
        agent={agent}
        dataComponentLookup={dataComponentLookup}
        artifactComponentLookup={artifactComponentLookup}
        toolLookup={toolLookup}
        credentialLookup={credentialLookup}
      />
    </ReactFlowProvider>
  );
}
