'use client';

import {
  Background,
  ConnectionMode,
  Controls,
  type Edge,
  type Node,
  Panel,
  ReactFlow,
  useOnSelectionChange,
  useReactFlow,
} from '@xyflow/react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { type ComponentProps, type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EditorLoadingSkeleton } from '@/components/agent/sidepane/editor-loading-skeleton';
import { UnsavedChangesDialog } from '@/components/agent/unsaved-changes-dialog';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { commandManager } from '@/features/agent/commands/command-manager';
import { AddNodeCommand, AddPreparedEdgeCommand } from '@/features/agent/commands/commands';
import {
  applyDagreLayout,
  deserializeAgentData,
  type ExtendedFullAgentDefinition,
  extractAgentMetadata,
  isContextConfigParseError,
  serializeAgentData,
  validateSerializedData,
} from '@/features/agent/domain';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { useAgentShortcuts } from '@/features/agent/ui/use-agent-shortcuts';
import { useAgentErrors } from '@/hooks/use-agent-errors';
import { useCurrentRef } from '@/hooks/use-current-ref';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { useSidePane } from '@/hooks/use-side-pane';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { Credential } from '@/lib/api/credentials';
import type { DataComponent } from '@/lib/api/data-components';
import type { ExternalAgent } from '@/lib/api/external-agents';
import { saveAgent } from '@/lib/services/save-agent';
import type { MCPTool } from '@/lib/types/tools';
import { getErrorSummaryMessage, parseAgentValidationErrors } from '@/lib/utils/agent-error-parser';
import { generateId } from '@/lib/utils/id-utils';
import { detectOrphanedToolsAndGetWarning } from '@/lib/utils/orphaned-tools-detector';
import { AgentComparison } from './comparison/agent-comparison';
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
  teamAgentNodeTargetHandleId,
} from './configuration/node-types';
import { AgentErrorSummary } from './error-display/agent-error-summary';
import { DefaultMarker } from './markers/default-marker';
import { SelectedMarker } from './markers/selected-marker';
import NodeLibrary from './node-library/node-library';
import { SidePane } from './sidepane/sidepane';
import { Toolbar } from './toolbar/toolbar';

// The Widget component is heavy, so we load it on the client only after the user clicks the "Try it" button.
const Playground = dynamic(() => import('./playground/playground').then((mod) => mod.Playground), {
  ssr: false,
  loading: () => <EditorLoadingSkeleton className="p-6" />,
});

// Type for agent tool configuration lookup including both selection and headers
export type AgentToolConfig = {
  toolId: string;
  toolSelection?: string[];
  headers?: Record<string, string>;
};

export type SubAgentExternalAgentConfig = {
  externalAgentId: string;
  headers?: Record<string, string>;
};

export type SubAgentTeamAgentConfig = {
  agentId: string;
  headers?: Record<string, string>;
};

// AgentToolConfigLookup: subAgentId -> relationshipId -> config
export type AgentToolConfigLookup = Record<string, Record<string, AgentToolConfig>>;

// SubAgentExternalAgentConfigLookup: subAgentId -> relationshipId -> config
export type SubAgentExternalAgentConfigLookup = Record<
  string,
  Record<string, SubAgentExternalAgentConfig>
>;

// SubAgentTeamAgentConfigLookup: subAgentId -> relationshipId -> config
export type SubAgentTeamAgentConfigLookup = Record<string, Record<string, SubAgentTeamAgentConfig>>;

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
  externalAgentLookup?: Record<string, ExternalAgent>;
  availableBranches?: Array<{ baseName: string; fullName: string; hash: string }>;
  currentBranch?: string;
}

type ReactFlowProps = Required<ComponentProps<typeof ReactFlow>>;

export const Agent: FC<AgentProps> = ({
  agent,
  dataComponentLookup = {},
  artifactComponentLookup = {},
  toolLookup = {},
  credentialLookup = {},
  externalAgentLookup = {},
  availableBranches = [],
  currentBranch = 'main',
}) => {
  const [showPlayground, setShowPlayground] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const router = useRouter();

  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  const ref = useCurrentRef();

  const { nodeId, edgeId, setQueryState, openAgentPane, isOpen } = useSidePane();

  const initialNodes = useMemo<Node[]>(
    () => [
      {
        id: generateId(),
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
            return {
              ...node,
              data: {
                ...node.data,
                name: tool.name,
                imageUrl: tool.imageUrl,
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

  const subAgentExternalAgentConfigLookup = useMemo((): SubAgentExternalAgentConfigLookup => {
    if (!agent?.subAgents) return {} as SubAgentExternalAgentConfigLookup;
    const lookup: SubAgentExternalAgentConfigLookup = {};
    Object.entries(agent.subAgents).forEach(([subAgentId, agentData]) => {
      if ('canDelegateTo' in agentData && agentData.canDelegateTo) {
        const externalAgentConfigs: Record<string, SubAgentExternalAgentConfig> = {};
        agentData.canDelegateTo
          .filter((delegate) => typeof delegate === 'object' && 'externalAgentId' in delegate)
          .forEach((delegate) => {
            externalAgentConfigs[delegate.externalAgentId] = {
              externalAgentId: delegate.externalAgentId,
              headers: delegate.headers ?? undefined,
            };
          });
        if (Object.keys(externalAgentConfigs).length > 0) {
          lookup[subAgentId] = externalAgentConfigs;
        }
      }
    });
    return lookup;
  }, [agent?.subAgents]);

  const subAgentTeamAgentConfigLookup = useMemo((): SubAgentTeamAgentConfigLookup => {
    if (!agent?.subAgents) return {} as SubAgentTeamAgentConfigLookup;
    const lookup: SubAgentTeamAgentConfigLookup = {};
    Object.entries(agent.subAgents).forEach(([subAgentId, agentData]) => {
      if ('canDelegateTo' in agentData && agentData.canDelegateTo) {
        const teamAgentConfigs: Record<string, SubAgentTeamAgentConfig> = {};
        agentData.canDelegateTo
          .filter((delegate) => typeof delegate === 'object' && 'agentId' in delegate)
          .forEach((delegate) => {
            // For team agents, the delegate is just the target agent ID string
            teamAgentConfigs[delegate.agentId] = {
              agentId: delegate.agentId,
              headers: delegate.headers ?? undefined,
            };
          });
        if (Object.keys(teamAgentConfigs).length > 0) {
          lookup[subAgentId] = teamAgentConfigs;
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
    animateGraph,
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
  useEffect(() => {
    // Delay to allow CSS transition to complete (300ms transition + 50ms buffer)
    if (isOpen) {
      return;
    }
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
  const onConnectWrapped: ReactFlowProps['onConnect'] = useCallback((params) => {
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

  const isValidConnection: ReactFlowProps['isValidConnection'] = useCallback(
    ({ sourceHandle, targetHandle }) => {
      // we don't want to allow connections between MCP nodes
      if (sourceHandle === mcpNodeHandleId && targetHandle === mcpNodeHandleId) {
        return false;
      }
      return true;
    },
    []
  );

  const onDragOver: ReactFlowProps['onDragOver'] = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop: ReactFlowProps['onDrop'] = useCallback(
    (event) => {
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
      const nodeId = generateId();
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

  const onSubmit = useCallback(async (): Promise<boolean> => {
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

    let serializedData: ReturnType<typeof serializeAgentData>;
    try {
      serializedData = serializeAgentData(
        nodes,
        edges,
        metadata,
        dataComponentLookup,
        artifactComponentLookup,
        agentToolConfigLookup,
        subAgentExternalAgentConfigLookup,
        subAgentTeamAgentConfigLookup
      );
    } catch (error) {
      if (isContextConfigParseError(error)) {
        const errorObjects = [
          {
            message: error.message,
            field: error.field,
            code: 'invalid_json',
            path: [error.field],
          },
        ];
        const errorSummary = parseAgentValidationErrors(JSON.stringify(errorObjects));
        setErrors(errorSummary);
        const summaryMessage = getErrorSummaryMessage(errorSummary);
        toast.error(summaryMessage);
        return false;
      }
      throw error;
    }

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
      return false;
    }

    const res = await saveAgent(
      tenantId,
      projectId,
      serializedData,
      agent?.id, // agentid is required and added to the serialized data if it does not exist so we need to pass is separately to know whether to create or update
      ref
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
      return true;
    }
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
    return false;
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
    subAgentExternalAgentConfigLookup,
    subAgentTeamAgentConfigLookup,
    externalAgentLookup,
    ref,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    const onCompletion = () => {
      // @ts-expect-error
      animateGraph({
        detail: {
          type: 'completion',
        },
      });
    };

    document.addEventListener('ikp-data-operation', animateGraph);
    document.addEventListener('ikp-aborted', onCompletion);
    return () => {
      document.removeEventListener('ikp-data-operation', animateGraph);
      document.removeEventListener('ikp-aborted', onCompletion);
    };
  }, []);

  const onNodeClick: ReactFlowProps['onNodeClick'] = useCallback(
    (_, node) => {
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
    },
    [fitView, isOpen]
  );

  const [showTraces, setShowTraces] = useState(false);
  const isMounted = useIsMounted();
  return (
    <ResizablePanelGroup
      // Note: Without a specified `id`, Cypress tests may become flaky and fail with the error: `No group found for id '...'`
      id="agent-panel-group"
      direction="horizontal"
      autoSaveId="agent-resizable-layout-state"
      className="w-full h-full relative bg-muted/20 dark:bg-background flex rounded-b-[14px] overflow-hidden"
    >
      <ResizablePanel
        // Panel id and order props recommended when panels are dynamically rendered
        id="react-flow-pane"
        order={1}
        minSize={30}
        // fixes WARNING: Panel defaultSize prop recommended to avoid layout shift after server rendering
        defaultSize={100}
        className="relative"
      >
        {showComparison && agent?.id ? (
          <AgentComparison
            agentId={agent.id}
            currentBranch={currentBranch}
            availableBranches={availableBranches}
            tenantId={tenantId}
            projectId={projectId}
            dataComponentLookup={dataComponentLookup}
            onClose={() => setShowComparison(false)}
          />
        ) : (
          <>
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
              minZoom={0.3}
              connectionMode={ConnectionMode.Loose}
              isValidConnection={isValidConnection}
              onNodeClick={onNodeClick}
            >
              <Background color="#a8a29e" gap={20} />
              <Controls className="text-foreground" showInteractive={false} />
              <Panel position="top-left">
                <NodeLibrary />
              </Panel>
              <Panel
                position="top-right"
                // width of NodeLibrary
                className="left-52"
              >
                <Toolbar
                  onSubmit={onSubmit}
                  inPreviewDisabled={!agent?.id}
                  toggleSidePane={isOpen ? backToAgent : openAgentPane}
                  setShowPlayground={() => {
                    closeSidePane();
                    setShowPlayground(true);
                  }}
                  setShowComparison={setShowComparison}
                  hasMultipleBranches={availableBranches.length > 1}
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
          </>
        )}
      </ResizablePanel>

      {isOpen &&
        /**
         * Prevents layout shift of pane when it's opened by default (when nodeId/edgeId are in query params).
         *
         * The panel width depends on values stored in `localStorage`, which are only
         * accessible after the component has mounted. This component delays rendering
         * until then to avoid visual layout jumps.
         */
        isMounted && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              minSize={30}
              // Panel id and order props recommended when panels are dynamically rendered
              id="side-pane"
              order={2}
            >
              <SidePane
                selectedNodeId={nodeId}
                selectedEdgeId={edgeId}
                onClose={closeSidePane}
                backToAgent={backToAgent}
                dataComponentLookup={dataComponentLookup}
                artifactComponentLookup={artifactComponentLookup}
                agentToolConfigLookup={agentToolConfigLookup}
                subAgentExternalAgentConfigLookup={subAgentExternalAgentConfigLookup}
                subAgentTeamAgentConfigLookup={subAgentTeamAgentConfigLookup}
                credentialLookup={credentialLookup}
              />
            </ResizablePanel>
          </>
        )}

      {showPlayground && agent?.id && (
        <>
          {!showTraces && <ResizableHandle withHandle />}
          <ResizablePanel
            minSize={25}
            // Panel id and order props recommended when panels are dynamically rendered
            id="playground-pane"
            order={3}
            className={showTraces ? 'w-full flex-none!' : ''}
          >
            <Playground
              agentId={agent.id}
              projectId={projectId}
              tenantId={tenantId}
              currentBranch={currentBranch}
              setShowPlayground={setShowPlayground}
              closeSidePane={closeSidePane}
              dataComponentLookup={dataComponentLookup}
              showTraces={showTraces}
              setShowTraces={setShowTraces}
            />
          </ResizablePanel>
        </>
      )}
      <UnsavedChangesDialog onSubmit={onSubmit} />
    </ResizablePanelGroup>
  );
};
