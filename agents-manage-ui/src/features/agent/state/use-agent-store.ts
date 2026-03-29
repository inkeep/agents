'use client';

import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { create, type StateCreator } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { resolveCollisions } from '@/components/agent/configuration/resolve-collisions';
import { generateId } from '@/lib/utils/id-utils';

type HistoryEntry = { nodes: Node[]; edges: Edge[] };

interface AgentStateData {
  nodes: Node[];
  edges: Edge[];
  dirty: boolean;
  history: HistoryEntry[];
  future: HistoryEntry[];
  /**
   * Temporary state used to control whether the sidebar is open on the agents page.
   */
  isSidebarSessionOpen: boolean;
  variableSuggestions: string[];
  /**
   * Tracks if any model configuration modal is currently open (azure, openrouter, gateway, nim).
   * Used to disable save button while configuration is in progress.
   */
  hasOpenModelConfig: boolean;
  playgroundConversationId: string;
}

interface AgentPersistedStateData {
  /**
   * Setting for using JSON Schema editor instead of Form builder.
   */
  jsonSchemaMode: boolean;
  isSidebarPinnedOpen: boolean;
  hasTextWrap: boolean;
}

interface AgentActions {
  setInitial(nodes: Node[], edges: Edge[]): void;
  reset(): void;
  setNodes(updater: (prev: Node[]) => Node[]): void;
  setEdges(updater: (prev: Edge[]) => Edge[]): void;
  onNodesChange(changes: NodeChange[]): void;
  onEdgesChange(changes: EdgeChange[]): void;
  onConnect(connection: Connection): void;
  push(nodes: Node[], edges: Edge[]): void;
  undo(): void;
  redo(): void;
  markSaved(): void;
  markUnsaved(): void;
  clearSelection(): void;
  /**
   * Setter for `jsonSchemaMode` field.
   */
  setJsonSchemaMode(jsonSchemaMode: boolean): void;
  /**
   * Setter for `isSidebarSessionOpen` and `isSidebarPinnedOpen` fields.
   */
  setSidebarOpen(state: { isSidebarSessionOpen: boolean; isSidebarPinnedOpen?: boolean }): void;
  /**
   * Toggle of `hasTextWrap` field.
   */
  toggleTextWrap(): void;

  setVariableSuggestions: (variableSuggestions: string[]) => void;
  /**
   * Setter for `hasOpenModelConfig` field.
   */
  setHasOpenModelConfig: (hasOpenModelConfig: boolean) => void;
  resetPlaygroundConversationId: () => void;
}

type AllAgentStateData = AgentStateData & AgentPersistedStateData;

interface AgentState extends AllAgentStateData {
  actions: AgentActions;
}

const initialAgentState: AgentStateData = {
  nodes: [],
  edges: [],
  dirty: false,
  history: [],
  future: [],
  isSidebarSessionOpen: true,
  variableSuggestions: [],
  hasOpenModelConfig: false,
  playgroundConversationId: generateId(),
};

const NODE_MODIFIED_CHANGE = new Set<NodeChange['type']>(['remove', 'add', 'replace']);

function deepShallow(a: any, b: any) {
  if (Object.is(a, b)) return true;

  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

  // first level shallow check
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    const valA = a[key];
    const valB = b[key];

    if (typeof valA === 'object' && typeof valB === 'object') {
      // 👇 recursive shallow
      if (!deepShallow(valA, valB)) return false;
    } else {
      if (!Object.is(valA, valB)) return false;
    }
  }

  return true;
}

const agentState: StateCreator<AgentState> = (set, get) => ({
  ...initialAgentState,
  jsonSchemaMode: false,
  isSidebarPinnedOpen: true,
  hasTextWrap: true,
  variableSuggestions: [],
  // Separate "namespace" for actions
  actions: {
    setInitial(nodes, edges) {
      set({ nodes, edges, dirty: false, history: [], future: [] });
    },
    reset() {
      // Exclude `isSidebarSessionOpen` from the initial state.
      // If we kept it, the sidebar on the agents page would collapse (from the temp state)
      // and then immediately re-expand due to the user’s persisted preference.
      const { isSidebarSessionOpen: _, ...state } = initialAgentState;
      set({ ...state, playgroundConversationId: generateId() });
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
      const hasModifyingChange = changes.some((change) => NODE_MODIFIED_CHANGE.has(change.type));
      const hasDimensionsChange = changes.some((change) => change.type === 'dimensions');
      set((state) => {
        const newNodes = applyNodeChanges(changes, state.nodes);
        return {
          history: [...state.history, { nodes: state.nodes, edges: state.edges }],
          nodes: hasDimensionsChange ? resolveCollisions(newNodes) : newNodes,
          dirty: hasModifyingChange || state.dirty,
        };
      });
    },
    onEdgesChange(changes) {
      const hasModifyingChange = changes.some((change) => NODE_MODIFIED_CHANGE.has(change.type));

      set((state) => {
        return {
          history: [...state.history, { nodes: state.nodes, edges: state.edges }],
          nodes: state.nodes,
          edges: applyEdgeChanges(changes, state.edges),
          dirty: hasModifyingChange ? true : state.dirty,
        };
      });
    },
    onConnect(connection) {
      set((state) => ({ edges: addEdge(connection, state.edges) }));
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
    setJsonSchemaMode(jsonSchemaMode) {
      set({ jsonSchemaMode });
    },
    setSidebarOpen({ isSidebarSessionOpen, isSidebarPinnedOpen }) {
      set({
        isSidebarSessionOpen,
        ...(typeof isSidebarPinnedOpen === 'boolean' && { isSidebarPinnedOpen }),
      });
    },
    toggleTextWrap() {
      set((prevState) => ({
        hasTextWrap: !prevState.hasTextWrap,
      }));
    },
    setVariableSuggestions(variableSuggestions) {
      set({ variableSuggestions });
    },
    setHasOpenModelConfig(hasOpenModelConfig) {
      set({ hasOpenModelConfig });
    },
    resetPlaygroundConversationId() {
      set({ playgroundConversationId: generateId() });
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
          isSidebarPinnedOpen: state.isSidebarPinnedOpen,
          hasTextWrap: state.hasTextWrap,
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
 * We explicitly use `AllAgentStateData` instead of `AgentState`,
 * which includes actions, to encourage using `useAgentActions`
 * when accessing or calling actions.
 */
export function useAgentStore<T>(selector: (state: AllAgentStateData) => T): T {
  return agentStore(useShallow(selector));
}
