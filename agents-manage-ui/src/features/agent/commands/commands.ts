import type { Edge, Node } from '@xyflow/react';
import { addEdge } from '@xyflow/react';
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
