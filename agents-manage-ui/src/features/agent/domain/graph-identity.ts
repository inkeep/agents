import type { Edge, Node } from '@xyflow/react';
import { EdgeType } from '@/components/agent/configuration/edge-types';

export function getNodeGraphKey(node?: Node): string | null {
  if (!node) {
    return null;
  }
  const { nodeKey } = node.data;
  if (nodeKey && typeof nodeKey === 'string') {
    return nodeKey;
  }
  return node.id;
}

export function findNodeByGraphKey(nodes: Node[], graphKey?: string | null): Node | undefined {
  if (!graphKey) {
    return undefined;
  }

  return nodes.find((node) => getNodeGraphKey(node) === graphKey);
}

export function getEdgeGraphKey(edge: Edge | undefined, nodes: Node[]): string | null {
  if (!edge) {
    return null;
  }

  if (
    edge.type !== EdgeType.A2A &&
    edge.type !== EdgeType.A2AExternal &&
    edge.type !== EdgeType.A2ATeam &&
    edge.type !== EdgeType.SelfLoop
  ) {
    return edge.id;
  }

  const sourceNode = nodes.find((node) => node.id === edge.source);
  const targetNode = nodes.find((node) => node.id === edge.target);
  const sourceGraphKey = getNodeGraphKey(sourceNode);
  const targetGraphKey = getNodeGraphKey(targetNode);

  if (!sourceGraphKey || !targetGraphKey) {
    return edge.id;
  }

  if (edge.type === EdgeType.SelfLoop) {
    return `self-loop:${sourceGraphKey}`;
  }

  const [low, high] = [sourceGraphKey, targetGraphKey].sort();
  return `${edge.type}:${low}:${high}`;
}

export function findEdgeByGraphKey(
  edges: Edge[],
  nodes: Node[],
  graphKey?: string | null
): Edge | undefined {
  if (!graphKey) {
    return undefined;
  }

  return edges.find((edge) => getEdgeGraphKey(edge, nodes) === graphKey);
}
