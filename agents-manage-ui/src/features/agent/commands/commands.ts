import type { Connection, Edge, Node } from '@xyflow/react';
import { addEdge } from '@xyflow/react';
import type { AgentMetadata } from '@/components/agent/configuration/agent-types';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import { agentStore } from '@/features/agent/state/use-agent-store';
import { eventBus } from '@/lib/events';
import type { Command } from './command-manager';

export class AddNodeCommand implements Command {
  readonly name = 'AddNode';
  private node: Node;
  constructor(node: Node) {
    this.node = node;
  }
  execute() {
    const { actions } = agentStore.getState();
    actions.setNodes((prev) => prev.concat(this.node));
  }
  undo() {
    const { actions } = agentStore.getState();
    actions.setNodes((prev) => prev.filter((n) => n.id !== this.node.id));
  }
}

export class DeleteSelectionCommand implements Command {
  readonly name = 'DeleteSelection';
  execute() {
    const { actions } = agentStore.getState();
    actions.deleteSelected();
  }
  undo() {
    // relies on store history; in a richer system we'd capture diffs
    const { actions } = agentStore.getState();
    actions.undo();
  }
}

export class ConnectEdgeCommand implements Command {
  readonly name = 'ConnectEdge';
  private connection: Connection;
  private createdEdgeId: string | null = null;
  constructor(connection: Connection) {
    this.connection = connection;
  }
  execute() {
    const { actions } = agentStore.getState();
    actions.setEdges((eds) => {
      const newEdges = addEdge(this.connection as any, eds);
      const last = newEdges[newEdges.length - 1];
      this.createdEdgeId = last?.id ?? null;
      return newEdges;
    });
  }
  undo() {
    if (!this.createdEdgeId) return;
    const { actions } = agentStore.getState();
    const id = this.createdEdgeId;
    actions.setEdges((eds) => eds.filter((e) => e.id !== id));
  }
}

export class UpdateMetadataCommand implements Command {
  readonly name = 'UpdateMetadata';
  private field: keyof AgentMetadata;
  private value: AgentMetadata[keyof AgentMetadata];
  private prev: AgentMetadata[keyof AgentMetadata] | undefined;
  constructor(field: keyof AgentMetadata, value: AgentMetadata[keyof AgentMetadata]) {
    this.field = field;
    this.value = value;
  }
  execute() {
    const { metadata, actions } = agentStore.getState();
    this.prev = metadata[this.field];
    actions.setMetadata(this.field, this.value);
  }
  undo() {
    const { actions } = agentStore.getState();
    actions.setMetadata(this.field, this.prev as any);
  }
}

export class ClearSelectionCommand implements Command {
  readonly name = 'ClearSelection';
  execute() {
    const { actions } = agentStore.getState();
    actions.clearSelection();
  }
  undo() {
    // no-op for now
  }
}

export class AddPreparedEdgeCommand implements Command {
  readonly name = 'AddPreparedEdge';
  private edge: Edge;
  private deselectOtherEdgesIfA2A: boolean;
  constructor(edge: Edge, options?: { deselectOtherEdgesIfA2A?: boolean }) {
    this.edge = edge;
    this.deselectOtherEdgesIfA2A = Boolean(options?.deselectOtherEdgesIfA2A);
  }
  execute() {
    const { actions } = agentStore.getState();
    if (this.edge.type === EdgeType.A2A) {
      // deselect nodes when creating an A2A edge
      actions.setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    }
    actions.setEdges((eds) => {
      if (eds.some((e) => e.id === this.edge.id)) return eds;
      const base =
        this.deselectOtherEdgesIfA2A && this.edge.type === EdgeType.A2A
          ? eds.map((e) => ({ ...e, selected: false }))
          : eds;
      const withNew = addEdge(this.edge as any, base);
      eventBus.emit('edgeConnected', { edgeId: this.edge.id });
      return withNew;
    });
  }
  undo() {
    const { actions } = agentStore.getState();
    const id = this.edge.id;
    actions.setEdges((eds) => eds.filter((e) => e.id !== id));
  }
}
