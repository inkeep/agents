import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { create, type StateCreator } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type {
  AgentToolConfigLookup,
  SubAgentExternalAgentConfigLookup,
} from '@/components/agent/agent';
import type { AgentMetadata } from '@/components/agent/configuration/agent-types';
import { mcpNodeHandleId, NodeType } from '@/components/agent/configuration/node-types';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { DataComponent } from '@/lib/api/data-components';
import type { ExternalAgent } from '@/lib/types/external-agents';
import type { MCPTool } from '@/lib/types/tools';
import type { AgentErrorSummary } from '@/lib/utils/agent-error-parser';

type HistoryEntry = { nodes: Node[]; edges: Edge[] };

type AgentStateData = {
  nodes: Node[];
  edges: Edge[];
  metadata: AgentMetadata;
  dataComponentLookup: Record<string, DataComponent>;
  artifactComponentLookup: Record<string, ArtifactComponent>;
  toolLookup: Record<string, MCPTool>;
  externalAgentLookup: Record<string, ExternalAgent>;
  agentToolConfigLookup: AgentToolConfigLookup;
  subAgentExternalAgentConfigLookup: SubAgentExternalAgentConfigLookup;
  dirty: boolean;
  history: HistoryEntry[];
  future: HistoryEntry[];
  errors: AgentErrorSummary | null;
  showErrors: boolean;
  /**
   * Setting for using JSON Schema editor instead of Form builder.
   */
  jsonSchemaMode: boolean;
};

type AgentActions = {
  setInitial(
    nodes: Node[],
    edges: Edge[],
    metadata: AgentMetadata,
    dataComponentLookup?: Record<string, DataComponent>,
    artifactComponentLookup?: Record<string, ArtifactComponent>,
    toolLookup?: Record<string, MCPTool>,
    agentToolConfigLookup?: AgentToolConfigLookup,
    externalAgentLookup?: Record<string, ExternalAgent>,
    subAgentExternalAgentConfigLookup?: SubAgentExternalAgentConfigLookup
  ): void;
  reset(): void;
  setDataComponentLookup(dataComponentLookup: Record<string, DataComponent>): void;
  setArtifactComponentLookup(artifactComponentLookup: Record<string, ArtifactComponent>): void;
  setToolLookup(toolLookup: Record<string, MCPTool>): void;
  setAgentToolConfigLookup(agentToolConfigLookup: AgentToolConfigLookup): void;
  setExternalAgentLookup(externalAgentLookup: Record<string, ExternalAgent>): void;
  setSubAgentExternalAgentConfigLookup(
    subAgentExternalAgentConfigLookup: SubAgentExternalAgentConfigLookup
  ): void;
  setNodes(updater: (prev: Node[]) => Node[]): void;
  setEdges(updater: (prev: Edge[]) => Edge[]): void;
  onNodesChange(changes: NodeChange[]): void;
  onEdgesChange(changes: EdgeChange[]): void;
  onConnect(connection: Connection): void;
  setMetadata<K extends keyof AgentMetadata>(field: K, value: AgentMetadata[K]): void;
  push(nodes: Node[], edges: Edge[]): void;
  undo(): void;
  redo(): void;
  markSaved(): void;
  markUnsaved(): void;
  clearSelection(): void;
  deleteSelected(): void;
  setErrors(errors: AgentErrorSummary | null): void;
  clearErrors(): void;
  setShowErrors(show: boolean): void;
  hasErrors(): boolean;
  getNodeErrors(nodeId: string): AgentErrorSummary['allErrors'];
  getEdgeErrors(edgeId: string): AgentErrorSummary['allErrors'];
  /**
   * Setter for `jsonSchemaMode` field.
   */
  setJsonSchemaMode(jsonSchemaMode: boolean): void;

  animateGraph: EventListenerOrEventListenerObject;
};

type AgentState = AgentStateData & {
  actions: AgentActions;
};

const initialAgentState: AgentStateData = {
  nodes: [],
  edges: [],
  metadata: {
    id: undefined,
    name: '',
    description: '',
    contextConfig: {
      contextVariables: '',
      headersSchema: '',
    },
    models: undefined,
    stopWhen: undefined,
    prompt: undefined,
    statusUpdates: undefined,
  },
  dataComponentLookup: {},
  artifactComponentLookup: {},
  toolLookup: {},
  agentToolConfigLookup: {},
  externalAgentLookup: {},
  subAgentExternalAgentConfigLookup: {},
  dirty: false,
  history: [],
  future: [],
  errors: null,
  showErrors: false,
  jsonSchemaMode: false,
};

const agentState: StateCreator<AgentState> = (set, get) => ({
  ...initialAgentState,
  // Separate "namespace" for actions
  actions: {
    setInitial(
      nodes,
      edges,
      metadata,
      dataComponentLookup = {},
      artifactComponentLookup = {},
      toolLookup = {},
      agentToolConfigLookup = {},
      externalAgentLookup = {},
      subAgentExternalAgentConfigLookup = {}
    ) {
      set({
        nodes,
        edges,
        metadata,
        dataComponentLookup,
        artifactComponentLookup,
        toolLookup,
        agentToolConfigLookup,
        externalAgentLookup,
        subAgentExternalAgentConfigLookup,
        dirty: false,
        history: [],
        future: [],
        errors: null,
        showErrors: false,
      });
    },
    reset() {
      set(initialAgentState);
    },
    setDataComponentLookup(dataComponentLookup) {
      set({ dataComponentLookup });
    },
    setArtifactComponentLookup(artifactComponentLookup) {
      set({ artifactComponentLookup });
    },
    setToolLookup(toolLookup) {
      set({ toolLookup });
    },
    setAgentToolConfigLookup(agentToolConfigLookup) {
      set({ agentToolConfigLookup });
    },
    setExternalAgentLookup(externalAgentLookup) {
      set({ externalAgentLookup });
    },
    setSubAgentExternalAgentConfigLookup(subAgentExternalAgentConfigLookup) {
      set({ subAgentExternalAgentConfigLookup });
    },
    setNodes(updater) {
      set((state) => ({ nodes: updater(state.nodes) }));
    },
    setEdges(updater) {
      set((state) => ({ edges: updater(state.edges) }));
    },
    push(nodes, edges) {
      set((state) => ({
        history: [...state.history, { nodes, edges }],
        future: [],
      }));
    },
    onNodesChange(changes) {
      const hasModifyingChange = changes.some(
        // Don't trigger `position` as modified change, since when the nodes are repositioned,
        // they'll be re-laid out during the initial load anyway
        (change) => change.type === 'remove' || change.type === 'add' || change.type === 'replace'
      );

      set((state) => ({
        history: [...state.history, { nodes: state.nodes, edges: state.edges }],
        nodes: applyNodeChanges(changes, state.nodes),
        dirty: hasModifyingChange || state.dirty,
      }));
    },
    onEdgesChange(changes) {
      const hasModifyingChange = changes.some(
        (change) => change.type === 'remove' || change.type === 'add' || change.type === 'replace'
      );

      set((state) => {
        // Check for edge removals that disconnect agent from MCP node
        const removeChanges = changes.filter((change) => change.type === 'remove');
        let updatedNodes = state.nodes;

        for (const removeChange of removeChanges) {
          const edgeToRemove = state.edges.find((e) => e.id === removeChange.id);
          if (edgeToRemove && edgeToRemove.targetHandle === mcpNodeHandleId) {
            // Find the target MCP node and clear its subAgentId
            const mcpNode = state.nodes.find((n) => n.id === edgeToRemove.target);
            if (mcpNode && mcpNode.type === NodeType.MCP) {
              updatedNodes = updatedNodes.map((n) =>
                n.id === mcpNode.id
                  ? { ...n, data: { ...n.data, subAgentId: null, relationshipId: null } }
                  : n
              );
            }
          }
        }

        return {
          history: [...state.history, { nodes: state.nodes, edges: state.edges }],
          nodes: updatedNodes,
          edges: applyEdgeChanges(changes, state.edges),
          dirty: hasModifyingChange ? true : state.dirty,
        };
      });
    },
    onConnect(connection) {
      set((state) => ({ edges: addEdge(connection as any, state.edges) }));
    },
    setMetadata(field, value) {
      set((state) => ({ metadata: { ...state.metadata, [field]: value } }));
    },
    undo() {
      const { history } = get();
      if (history.length === 0) return;
      const prev = history[history.length - 1];
      set((state) => ({
        nodes: prev.nodes,
        edges: prev.edges,
        history: state.history.slice(0, -1),
        future: [{ nodes: state.nodes, edges: state.edges }, ...state.future],
        dirty: state.dirty,
      }));
    },
    redo() {
      const { future } = get();
      if (future.length === 0) return;
      const next = future[0];
      set((state) => ({
        nodes: next.nodes,
        edges: next.edges,
        future: state.future.slice(1),
        history: [...state.history, { nodes: state.nodes, edges: state.edges }],
        dirty: state.dirty,
      }));
    },
    markSaved() {
      set({ dirty: false });
    },
    markUnsaved() {
      set({ dirty: true });
    },
    clearSelection() {
      set((state) => ({
        nodes: state.nodes.map((n) => ({ ...n, selected: false })),
        edges: state.edges.map((e) => ({ ...e, selected: false })),
        dirty: state.dirty,
      }));
    },
    deleteSelected() {
      set((state) => {
        const nodesToDelete = new Set(
          state.nodes.filter((n) => n.selected && (n.deletable ?? true)).map((n) => n.id)
        );
        const edgesRemaining = state.edges.filter(
          (e) => !e.selected && !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target)
        );
        const nodesRemaining = state.nodes.filter((n) => !nodesToDelete.has(n.id));
        return {
          history: [...state.history, { nodes: state.nodes, edges: state.edges }],
          nodes: nodesRemaining,
          edges: edgesRemaining,
          dirty: true,
        };
      });
    },
    setErrors(errors) {
      set({ errors, showErrors: errors !== null });
    },
    clearErrors() {
      set({ errors: null, showErrors: false });
    },
    setShowErrors(show) {
      set({ showErrors: show });
    },
    hasErrors() {
      const { errors } = get();
      return errors !== null && errors.totalErrors > 0;
    },
    getNodeErrors(nodeId) {
      const { errors } = get();
      if (!errors || !errors.nodeErrors[nodeId]) return [];
      return errors.nodeErrors[nodeId];
    },
    getEdgeErrors(edgeId) {
      const { errors } = get();
      if (!errors || !errors.edgeErrors[edgeId]) return [];
      return errors.edgeErrors[edgeId];
    },
    setJsonSchemaMode(jsonSchemaMode) {
      set({ jsonSchemaMode });
    },
    animateGraph(event) {
      function hasRelationWithSubAgent({
        relationshipId,
        subAgentId,
      }: {
        relationshipId: unknown;
        subAgentId: string;
      }): boolean {
        if (typeof relationshipId !== 'string') {
          return false;
        }
        const config = get().agentToolConfigLookup[subAgentId];
        if (!config) {
          return false;
        }
        return Object.keys(config).includes(relationshipId);
      }
      // @ts-expect-error -- improve types
      const data = event.detail;
      set((state) => {
        const { edges: prevEdges, nodes: prevNodes } = state;
        switch (data.type) {
          case 'agent_initializing': {
            // TODO
            break;
          }
          case 'delegation_sent':
          case 'transfer': {
            const { fromSubAgent, targetSubAgent } = data.details.data;

            return {
              edges: prevEdges.map((edge) => ({
                ...edge,
                data: {
                  ...edge.data,
                  delegating: edge.source === fromSubAgent && edge.target === targetSubAgent,
                },
              })),
              nodes: prevNodes.map((node) => ({
                ...node,
                data: {
                  ...node.data,
                  status:
                    node.id === fromSubAgent || node.id === targetSubAgent ? 'delegating' : null,
                },
              })),
            };
          }
          case 'delegation_returned': {
            const { targetSubAgent, fromSubAgent } = data.details.data;
            return {
              edges: prevEdges.map((edge) => ({
                ...edge,
                data: {
                  ...edge.data,
                  delegating:
                    edge.source === targetSubAgent && edge.target === fromSubAgent
                      ? 'inverted'
                      : false,
                },
              })),
              nodes: prevNodes.map((node) => ({
                ...node,
                data: {
                  ...node.data,
                  status:
                    node.id === targetSubAgent || node.id === fromSubAgent ? 'delegating' : null,
                },
              })),
            };
          }
          case 'tool_call': {
            const { toolName } = data.details.data;
            const { subAgentId } = data.details;
            return {
              edges: prevEdges.map((edge) => {
                const node = prevNodes.find((node) => node.id === edge.target);
                const toolId = node?.data.toolId as string;
                const toolData = get().toolLookup[toolId];
                const hasTool = toolData?.availableTools?.some((tool) => tool.name === toolName);
                const hasDots = edge.source === subAgentId && hasTool;
                return {
                  ...edge,
                  data: { ...edge.data, delegating: hasDots },
                };
              }),
              nodes: prevNodes.map((node) => {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    status:
                      node.data.id === subAgentId ||
                      hasRelationWithSubAgent({
                        relationshipId: node.data.relationshipId,
                        subAgentId,
                      })
                        ? 'delegating'
                        : null,
                  },
                };
              }),
            };
          }
          case 'error': {
            const { subAgentId } = data.details;
            return {
              nodes: prevNodes.map((node) => {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    status: hasRelationWithSubAgent({
                      relationshipId: node.data.relationshipId,
                      subAgentId,
                    })
                      ? 'error'
                      : null,
                  },
                };
              }),
            };
          }
          case 'tool_result': {
            const { toolName, error } = data.details.data;
            const { subAgentId } = data.details;
            setNodes((prevNodes) => {
              setEdges((prevEdges) =>
                prevEdges.map((edge) => {
                  const node = prevNodes.find((node) => node.id === edge.target);
                  const toolId = node?.data.toolId as string;
                  const toolData = get().toolLookup[toolId];
                  const hasTool = toolData?.availableTools?.some((tool) => tool.name === toolName);

                  return {
                    ...edge,
                    data: {
                      ...edge.data,
                      delegating: subAgentId === edge.source && hasTool ? 'inverted' : false,
                    },
                  };
                })
              );
              return prevNodes.map((node) => {
                let status: AnimatedNode['status'] = null;
                if (
                  hasRelationWithSubAgent({
                    subAgentId,
                    relationshipId: node.data.relationshipId,
                  })
                ) {
                  status = error ? 'error' : 'executing';
                } else if (node.id === subAgentId) {
                  status = 'delegating';
                }

                return {
                  ...node,
                  data: {
                    ...node.data,
                    status,
                  },
                };
              });
            });
            break;
          }
          case 'completion': {
            return {
              edges: prevEdges.map((edge) => ({
                ...edge,
                data: { ...edge.data, delegating: false },
              })),
              nodes: prevNodes.map((node) => ({
                ...node,
                data: { ...node.data, status: null },
              })),
            };
          }
          case 'agent_generate': {
            const { subAgentId } = data.details;
            return {
              edges: prevEdges.map((node) => ({
                ...node,
                data: { ...node.data, delegating: false },
              })),
              nodes: prevNodes.map((node) => ({
                ...node,
                data: {
                  ...node.data,
                  status: node.id === subAgentId ? 'executing' : null,
                },
              })),
            };
          }
        }
        return state;
      });
    },
  },
});

export const agentStore = create<AgentState>()(
  devtools(
    persist(agentState, {
      name: 'inkeep:agent',
      partialize(state) {
        return {
          jsonSchemaMode: state.jsonSchemaMode,
        };
      },
    })
  )
);

/**
 * Actions are functions that update values in your store.
 * These are static and do not change between renders.
 *
 * @see https://tkdodo.eu/blog/working-with-zustand#separate-actions-from-state
 */
export const useAgentActions = () => agentStore((state) => state.actions);

/**
 * Select values from the agent store (excluding actions).
 *
 * We explicitly use `AgentStateData` instead of `AgentState`,
 * which includes actions, to encourage using `useAgentActions`
 * when accessing or calling actions.
 */
export function useAgentStore<T>(selector: (state: AgentStateData) => T): T {
  return agentStore(useShallow(selector));
}
