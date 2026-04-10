import type { Edge, Node } from '@xyflow/react';
import { findEdgeByGraphKey, findNodeByGraphKey } from '@/features/agent/domain/graph-identity';

export function applySelectionFromQueryState({
  nodes,
  edges,
  edgeId,
  nodeId,
}: {
  nodes: Node[];
  edges: Edge[];
  nodeId: string | null;
  edgeId: string | null;
}) {
  const selectedNode = findNodeByGraphKey(nodes, nodeId);
  const selectedEdge = findEdgeByGraphKey(edges, nodes, edgeId);

  return {
    nodes: nodes.map((node) => ({
      ...node,
      selected: selectedNode ? node.id === selectedNode.id : false,
    })),
    edges: edges.map((edge) => ({
      ...edge,
      selected: selectedEdge ? edge.id === selectedEdge.id : false,
    })),
    selectedNode,
    selectedEdge,
  };
}
