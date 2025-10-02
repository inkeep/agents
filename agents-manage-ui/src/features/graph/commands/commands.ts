import type { Connection, Edge, Node } from '@xyflow/react';
import { addEdge } from '@xyflow/react';
import { EdgeType } from '@/components/graph/configuration/edge-types';
import type { GraphMetadata } from '@/components/graph/configuration/graph-types';
import { graphStore } from '@/features/graph/state/use-graph-store';
import { eventBus } from '@/lib/events';
import type { Command } from './command-manager';

export class AddNodeCommand implements Command {
  readonly name = 'AddNode';
  private node: Node;
  constructor(node: Node) {
    this.node = node;
  }
  execute() {
    const { actions } = graphStore.getState();
    actions.setNodes((prev) => prev.concat(this.node));
  }
  undo() {
    const { actions } = graphStore.getState();
    actions.setNodes((prev) => prev.filter((n) => n.id !== this.node.id));
  }
}

export class DeleteSelectionCommand implements Command {
  readonly name = 'DeleteSelection';
  execute() {
    const { actions } = graphStore.getState();
    actions.deleteSelected();
  }
  undo() {
    // relies on store history; in a richer system we'd capture diffs
    const { actions } = graphStore.getState();
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
    const { actions } = graphStore.getState();
    actions.setEdges((eds) => {
      const newEdges = addEdge(this.connection as any, eds);
      const last = newEdges[newEdges.length - 1];
      this.createdEdgeId = last?.id ?? null;
      return newEdges;
    });
  }
  undo() {
    if (!this.createdEdgeId) return;
    const { actions } = graphStore.getState();
    const id = this.createdEdgeId;
    actions.setEdges((eds) => eds.filter((e) => e.id !== id));
  }
}

export class UpdateMetadataCommand implements Command {
  readonly name = 'UpdateMetadata';
  private field: keyof GraphMetadata;
  private value: GraphMetadata[keyof GraphMetadata];
  private prev: GraphMetadata[keyof GraphMetadata] | undefined;
  constructor(field: keyof GraphMetadata, value: GraphMetadata[keyof GraphMetadata]) {
    this.field = field;
    this.value = value;
  }
  execute() {
    const { metadata, actions } = graphStore.getState();
    this.prev = metadata[this.field];
    actions.setMetadata(this.field, this.value);
  }
  undo() {
    const { actions } = graphStore.getState();
    actions.setMetadata(this.field, this.prev as any);
  }
}

export class ClearSelectionCommand implements Command {
  readonly name = 'ClearSelection';
  execute() {
    const { actions } = graphStore.getState();
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
    const { actions } = graphStore.getState();
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
    const { actions } = graphStore.getState();
    const id = this.edge.id;
    actions.setEdges((eds) => eds.filter((e) => e.id !== id));
  }
}
