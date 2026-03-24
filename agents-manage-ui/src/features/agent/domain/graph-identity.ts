import type { Edge, Node } from '@xyflow/react';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import {
  type ExternalAgentNodeData,
  type FunctionToolNodeData,
  type MCPNodeData,
  NodeType,
  type TeamAgentNodeData,
} from '@/components/agent/configuration/node-types';
import { getSubAgentIdForNode, type SubAgentFormData } from './sub-agent-identity';

export function getSubAgentGraphKey(subAgentId?: string | null): string | null {
  return subAgentId ? `sub-agent:${subAgentId}` : null;
}

export function getMcpGraphKey({
  relationshipId,
  subAgentId,
  toolId,
  fallbackId,
}: {
  relationshipId?: string | null;
  subAgentId?: string | null;
  toolId?: string | null;
  fallbackId?: string | null;
}): string | null {
  if (relationshipId) {
    return `mcp:${relationshipId}`;
  }

  if (subAgentId && toolId) {
    return `mcp:${subAgentId}:${toolId}`;
  }

  if (toolId && fallbackId) {
    return `mcp:${toolId}:${fallbackId}`;
  }

  if (toolId) {
    return `mcp:${toolId}`;
  }

  return fallbackId ? `mcp:${fallbackId}` : null;
}

export function getFunctionToolGraphKey({
  relationshipId,
  toolId,
  fallbackId,
}: {
  relationshipId?: string | null;
  toolId?: string | null;
  fallbackId?: string | null;
}): string | null {
  if (toolId) {
    return `function-tool:${toolId}`;
  }

  if (relationshipId) {
    return `function-tool:${relationshipId}`;
  }

  return fallbackId ? `function-tool:${fallbackId}` : null;
}

export function getExternalAgentGraphKey(externalAgentId?: string | null): string | null {
  return externalAgentId ? `external-agent:${externalAgentId}` : null;
}

export function getTeamAgentGraphKey(teamAgentId?: string | null): string | null {
  return teamAgentId ? `team-agent:${teamAgentId}` : null;
}

export function getNodeGraphKey(node?: Node, subAgentFormData?: SubAgentFormData): string | null {
  if (!node) {
    return null;
  }

  switch (node.type) {
    case NodeType.SubAgent:
      return getSubAgentGraphKey(getSubAgentIdForNode(node, subAgentFormData) ?? node.id);
    case NodeType.MCP: {
      const { relationshipId, subAgentId, toolId } = node.data as MCPNodeData;
      const resolvedSubAgentId =
        (subAgentId && subAgentFormData?.[subAgentId]?.id) || subAgentId || null;
      return getMcpGraphKey({
        relationshipId,
        subAgentId: resolvedSubAgentId,
        toolId,
        fallbackId: node.id,
      });
    }
    case NodeType.FunctionTool: {
      const { relationshipId, toolId } = node.data as FunctionToolNodeData;
      return getFunctionToolGraphKey({
        relationshipId,
        toolId,
        fallbackId: node.id,
      });
    }
    case NodeType.ExternalAgent:
      return getExternalAgentGraphKey(
        (node.data as ExternalAgentNodeData).externalAgentId ?? node.id
      );
    case NodeType.TeamAgent:
      return getTeamAgentGraphKey((node.data as TeamAgentNodeData).teamAgentId ?? node.id);
    default:
      return node.id;
  }
}

function matchesLegacyNodeReference(
  node: Node,
  reference: string,
  subAgentFormData?: SubAgentFormData
): boolean {
  if (reference === node.id) {
    return true;
  }

  switch (node.type) {
    case NodeType.SubAgent:
      return getSubAgentIdForNode(node, subAgentFormData) === reference;
    case NodeType.MCP: {
      const { relationshipId, subAgentId, toolId } = node.data as MCPNodeData;
      const resolvedSubAgentId =
        (subAgentId && subAgentFormData?.[subAgentId]?.id) || subAgentId || null;
      return (
        relationshipId === reference ||
        toolId === reference ||
        getMcpGraphKey({ subAgentId: resolvedSubAgentId, toolId }) === reference
      );
    }
    case NodeType.FunctionTool: {
      const { relationshipId, toolId } = node.data as FunctionToolNodeData;
      return relationshipId === reference || toolId === reference;
    }
    case NodeType.ExternalAgent:
      return (node.data as ExternalAgentNodeData).externalAgentId === reference;
    case NodeType.TeamAgent:
      return (node.data as TeamAgentNodeData).teamAgentId === reference;
    default:
      return false;
  }
}

export function findNodeByGraphKey(
  nodes: Node[],
  graphKey?: string | null,
  subAgentFormData?: SubAgentFormData
): Node | undefined {
  if (!graphKey) {
    return undefined;
  }

  return nodes.find(
    (node) =>
      getNodeGraphKey(node, subAgentFormData) === graphKey ||
      matchesLegacyNodeReference(node, graphKey, subAgentFormData)
  );
}

export function getEdgeGraphKey(
  edge: Edge | undefined,
  nodes: Node[],
  subAgentFormData?: SubAgentFormData
): string | null {
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
  const sourceGraphKey = getNodeGraphKey(sourceNode, subAgentFormData);
  const targetGraphKey = getNodeGraphKey(targetNode, subAgentFormData);

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
  graphKey?: string | null,
  subAgentFormData?: SubAgentFormData
): Edge | undefined {
  if (!graphKey) {
    return undefined;
  }

  return edges.find(
    (edge) => getEdgeGraphKey(edge, nodes, subAgentFormData) === graphKey || edge.id === graphKey
  );
}
