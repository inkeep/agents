import type { Edge, Node } from '@xyflow/react';
import { NodeType } from '@/components/agent/configuration/node-types';
import type { FullAgentResponse } from '@/lib/types/agent-full';

interface SyncSavedAgentGraphParams {
  nodes: Node[];
  edges: Edge[];
  savedAgent: FullAgentResponse;
  nodeId: string | null;
  edgeId: string | null;
}

interface SyncSavedAgentGraphResult {
  nodes: Node[];
  edges: Edge[];
  nodeId: string | null;
  edgeId: string | null;
}

function getSubmittedSubAgentId(node: Node): string {
  return typeof node.data.id === 'string' && node.data.id ? node.data.id : node.id;
}

function getCanUseKey(subAgentId: string, toolId: string): string {
  return `${subAgentId}:${toolId}`;
}

export function syncSavedAgentGraph({
  nodes,
  edges,
  savedAgent,
  nodeId,
  edgeId,
}: SyncSavedAgentGraphParams): SyncSavedAgentGraphResult {
  const renamedSubAgentIds = new Map<string, string>();

  for (const node of nodes) {
    if (node.type !== NodeType.SubAgent) continue;

    const submittedSubAgentId = getSubmittedSubAgentId(node);
    if (savedAgent.subAgents[submittedSubAgentId]) {
      renamedSubAgentIds.set(node.id, submittedSubAgentId);
    }
  }

  const renameSubAgentId = (id: string) => renamedSubAgentIds.get(id) ?? id;

  const relationIdsByKey = new Map<string, string[]>();
  for (const [subAgentId, subAgent] of Object.entries(savedAgent.subAgents)) {
    for (const canUse of subAgent.canUse ?? []) {
      if (!canUse.agentToolRelationId) continue;
      const key = getCanUseKey(subAgentId, canUse.toolId);
      const current = relationIdsByKey.get(key) ?? [];
      relationIdsByKey.set(key, [...current, canUse.agentToolRelationId]);
    }
  }

  const usedRelationIds = new Set<string>();
  const claimRelationId = (subAgentId: string, toolId: string, current?: string | null) => {
    if (current) {
      usedRelationIds.add(current);
      return current;
    }

    const key = getCanUseKey(subAgentId, toolId);
    const relationIds = relationIdsByKey.get(key) ?? [];
    while (relationIds.length > 0) {
      const relationId = relationIds.shift();
      if (!relationId || usedRelationIds.has(relationId)) continue;
      usedRelationIds.add(relationId);
      return relationId;
    }

    return current ?? null;
  };

  const syncedNodes = nodes
    .map((node) => {
      if (node.type === NodeType.SubAgent) {
        const nextId = renameSubAgentId(node.id);
        return {
          ...node,
          id: nextId,
          data: {
            ...node.data,
            id: nextId,
          },
        };
      }

      if (node.type === NodeType.ExternalAgent || node.type === NodeType.TeamAgent) {
        return node.data.relationshipId ? node : null;
      }

      if (node.type === NodeType.MCP || node.type === NodeType.FunctionTool) {
        const subAgentId =
          typeof node.data.subAgentId === 'string' ? renameSubAgentId(node.data.subAgentId) : null;

        if (!subAgentId) {
          return null;
        }

        const toolId = typeof node.data.toolId === 'string' ? node.data.toolId : null;
        const relationshipId =
          toolId === null
            ? node.data.relationshipId
            : claimRelationId(subAgentId, toolId, node.data.relationshipId as string | null);

        return {
          ...node,
          data: {
            ...node.data,
            subAgentId,
            relationshipId,
          },
        };
      }

      return node;
    })
    .filter((node): node is Node => node !== null);

  const keptNodeIds = new Set(syncedNodes.map((node) => node.id));

  const syncedEdges = edges
    .map((edge) => ({
      ...edge,
      source: renameSubAgentId(edge.source),
      target: renameSubAgentId(edge.target),
    }))
    .filter((edge) => keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target));

  const nextNodeId = nodeId
    ? (() => {
        const candidateNodeId = renameSubAgentId(nodeId);
        return keptNodeIds.has(candidateNodeId)
          ? candidateNodeId
          : keptNodeIds.has(nodeId)
            ? nodeId
            : null;
      })()
    : null;

  const nextEdgeId = edgeId && syncedEdges.some((edge) => edge.id === edgeId) ? edgeId : null;

  return {
    nodes: syncedNodes.map((node) => ({
      ...node,
      selected: nextNodeId ? node.id === nextNodeId : false,
    })),
    edges: syncedEdges.map((edge) => ({
      ...edge,
      selected: nextEdgeId ? edge.id === nextEdgeId : false,
    })),
    nodeId: nextNodeId,
    edgeId: nextEdgeId,
  };
}
