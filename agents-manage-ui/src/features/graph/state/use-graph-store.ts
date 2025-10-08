import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { GraphMetadata } from '@/components/graph/configuration/graph-types';
import { mcpNodeHandleId, NodeType } from '@/components/graph/configuration/node-types';
import type { AgentToolConfigLookup } from '@/components/graph/graph';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { DataComponent } from '@/lib/api/data-components';
import type { MCPTool } from '@/lib/types/tools';
import type { GraphErrorSummary } from '@/lib/utils/graph-error-parser';
import { useShallow } from 'zustand/react/shallow';

type HistoryEntry = { nodes: Node[]; edges: Edge[] };

type GraphStateData = {
  nodes: Node[];
  edges: Edge[];
  metadata: GraphMetadata;
  dataComponentLookup: Record<string, DataComponent>;
  artifactComponentLookup: Record<string, ArtifactComponent>;
  toolLookup: Record<string, MCPTool>;
  agentToolConfigLookup: AgentToolConfigLookup;
  dirty: boolean;
  history: HistoryEntry[];
  future: HistoryEntry[];
  errors: GraphErrorSummary | null;
  showErrors: boolean;
};

type GraphActions = {
  setInitial(
    nodes: Node[],
    edges: Edge[],
    metadata: GraphMetadata,
    dataComponentLookup?: Record<string, DataComponent>,
    artifactComponentLookup?: Record<string, ArtifactComponent>,
    toolLookup?: Record<string, MCPTool>,
    agentToolConfigLookup?: AgentToolConfigLookup
  ): void;
  setDataComponentLookup(dataComponentLookup: Record<string, DataComponent>): void;
  setArtifactComponentLookup(artifactComponentLookup: Record<string, ArtifactComponent>): void;
  setToolLookup(toolLookup: Record<string, MCPTool>): void;
  setAgentToolConfigLookup(agentToolConfigLookup: AgentToolConfigLookup): void;
  setNodes(updater: (prev: Node[]) => Node[]): void;
  setEdges(updater: (prev: Edge[]) => Edge[]): void;
  onNodesChange(changes: NodeChange[]): void;
  onEdgesChange(changes: EdgeChange[]): void;
  onConnect(connection: Connection): void;
  setMetadata<K extends keyof GraphMetadata>(field: K, value: GraphMetadata[K]): void;
  push(nodes: Node[], edges: Edge[]): void;
  undo(): void;
  redo(): void;
  markSaved(): void;
  markUnsaved(): void;
  clearSelection(): void;
  deleteSelected(): void;
  setErrors(errors: GraphErrorSummary | null): void;
  clearErrors(): void;
  setShowErrors(show: boolean): void;
  hasErrors(): boolean;
  getNodeErrors(nodeId: string): GraphErrorSummary['allErrors'];
  getEdgeErrors(edgeId: string): GraphErrorSummary['allErrors'];
};

type GraphState = GraphStateData & {
  actions: GraphActions;
};

export const graphStore = create<GraphState>()(
  devtools((set, get) => ({
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
      graphPrompt: undefined,
      statusUpdates: undefined,
    },
    dataComponentLookup: {},
    artifactComponentLookup: {},
    toolLookup: {},
    agentToolConfigLookup: {},
    dirty: false,
    history: [],
    future: [],
    errors: null,
    showErrors: false,
    // Separate "namespace" for actions
    actions: {
      setInitial(
        nodes,
        edges,
        metadata,
        dataComponentLookup = {},
        artifactComponentLookup = {},
        toolLookup = {},
        agentToolConfigLookup = {}
      ) {
        set({
          nodes,
          edges,
          metadata,
          dataComponentLookup,
          artifactComponentLookup,
          toolLookup,
          agentToolConfigLookup,
          dirty: false,
          history: [],
          future: [],
          errors: null,
          showErrors: false,
        });
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
        // Check if any change type would modify the graph (not just selection changes)
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
        // Check if any change type would modify the graph (not just selection changes)
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
              // Find the target MCP node and clear its agentId
              const mcpNode = state.nodes.find((n) => n.id === edgeToRemove.target);
              if (mcpNode && mcpNode.type === NodeType.MCP) {
                updatedNodes = updatedNodes.map((n) =>
                  n.id === mcpNode.id
                    ? { ...n, data: { ...n.data, agentId: null, relationshipId: null } }
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
    },
  }))
);

/**
 * Actions are functions that update values in your store.
 * These are static and do not change between renders.
 *
 * @see https://tkdodo.eu/blog/working-with-zustand#separate-actions-from-state
 */
export const useGraphActions = () => graphStore((state) => state.actions);

/**
 * Select values from the graph store (excluding actions).
 *
 * We explicitly use `GraphStateData` instead of `GraphState`,
 * which includes actions, to encourage using `useGraphActions`
 * when accessing or calling actions.
 */
export function useGraphStore<T>(selector: (state: GraphStateData) => T): T {
  return graphStore(useShallow(selector));
}
