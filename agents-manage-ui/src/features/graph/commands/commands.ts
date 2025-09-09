import type { Connection, Edge, Node } from "@xyflow/react";
import { addEdge } from "@xyflow/react";
import { EdgeType } from "@/components/graph/configuration/edge-types";
import type { GraphMetadata } from "@/components/graph/configuration/graph-types";
import { useGraphStore } from "@/features/graph/state/use-graph-store";
import { eventBus } from "@/lib/events";
import type { Command } from "./command-manager";

export class AddNodeCommand implements Command {
	readonly name = "AddNode";
	private node: Node;
	constructor(node: Node) {
		this.node = node;
	}
	execute() {
		const { setNodes } = useGraphStore.getState();
		setNodes((prev) => prev.concat(this.node));
	}
	undo() {
		const { setNodes } = useGraphStore.getState();
		setNodes((prev) => prev.filter((n) => n.id !== this.node.id));
	}
}

export class DeleteSelectionCommand implements Command {
	readonly name = "DeleteSelection";
	execute() {
		const { deleteSelected } = useGraphStore.getState();
		deleteSelected();
	}
	undo() {
		// relies on store history; in a richer system we'd capture diffs
		const { undo } = useGraphStore.getState();
		undo();
	}
}

export class ConnectEdgeCommand implements Command {
	readonly name = "ConnectEdge";
	private connection: Connection;
	private createdEdgeId: string | null = null;
	constructor(connection: Connection) {
		this.connection = connection;
	}
	execute() {
		const { setEdges } = useGraphStore.getState();
		setEdges((eds) => {
			const newEdges = addEdge(this.connection as any, eds);
			const last = newEdges[newEdges.length - 1];
			this.createdEdgeId = last?.id ?? null;
			return newEdges;
		});
	}
	undo() {
		if (!this.createdEdgeId) return;
		const { setEdges } = useGraphStore.getState();
		const id = this.createdEdgeId;
		setEdges((eds) => eds.filter((e) => e.id !== id));
	}
}

export class UpdateMetadataCommand implements Command {
	readonly name = "UpdateMetadata";
	private field: keyof GraphMetadata;
	private value: GraphMetadata[keyof GraphMetadata];
	private prev: GraphMetadata[keyof GraphMetadata] | undefined;
	constructor(
		field: keyof GraphMetadata,
		value: GraphMetadata[keyof GraphMetadata],
	) {
		this.field = field;
		this.value = value;
	}
	execute() {
		const { metadata, setMetadata } = useGraphStore.getState();
		this.prev = metadata[this.field];
		setMetadata(this.field, this.value);
	}
	undo() {
		const { setMetadata } = useGraphStore.getState();
		setMetadata(this.field, this.prev as any);
	}
}

export class ClearSelectionCommand implements Command {
	readonly name = "ClearSelection";
	execute() {
		const { clearSelection } = useGraphStore.getState();
		clearSelection();
	}
	undo() {
		// no-op for now
	}
}

export class AddPreparedEdgeCommand implements Command {
	readonly name = "AddPreparedEdge";
	private edge: Edge;
	private deselectOtherEdgesIfA2A: boolean;
	constructor(edge: Edge, options?: { deselectOtherEdgesIfA2A?: boolean }) {
		this.edge = edge;
		this.deselectOtherEdgesIfA2A = Boolean(options?.deselectOtherEdgesIfA2A);
	}
	execute() {
		const { setEdges, setNodes } = useGraphStore.getState();
		if (this.edge.type === EdgeType.A2A) {
			// deselect nodes when creating an A2A edge
			setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
		}
		setEdges((eds) => {
			if (eds.some((e) => e.id === this.edge.id)) return eds;
			const base =
				this.deselectOtherEdgesIfA2A && this.edge.type === EdgeType.A2A
					? eds.map((e) => ({ ...e, selected: false }))
					: eds;
			const withNew = addEdge(this.edge as any, base);
			eventBus.emit("edgeConnected", { edgeId: this.edge.id });
			return withNew;
		});
	}
	undo() {
		const { setEdges } = useGraphStore.getState();
		const id = this.edge.id;
		setEdges((eds) => eds.filter((e) => e.id !== id));
	}
}
