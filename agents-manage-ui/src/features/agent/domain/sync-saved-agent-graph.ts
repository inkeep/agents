import type { Edge, Node } from '@xyflow/react';
import { isNodeType, NodeType } from '@/components/agent/configuration/node-types';
import type { FullAgentFormValues, FullAgentResponse } from '@/lib/types/agent-full';
import {
  findEdgeByGraphKey,
  findNodeByGraphKey,
  getEdgeGraphKey,
  getNodeGraphKey,
} from './graph-identity';
import {
  getExternalAgentGraphKey,
  getFunctionToolGraphKey,
  getMcpGraphKey,
  getSubAgentGraphKey,
  getTeamAgentGraphKey,
} from './graph-keys';
import { getSubAgentIdForNode } from './sub-agent-identity';

interface SyncSavedAgentGraphParams {
  nodes: Node[];
  edges: Edge[];
  savedAgent: FullAgentResponse;
  nodeId: string | null;
  edgeId: string | null;
  subAgentFormData?: FullAgentFormValues['subAgents'];
}

interface SyncSavedAgentGraphResult {
  nodes: Node[];
  edges: Edge[];
  nodeId: string | null;
  edgeId: string | null;
}

function getCanUseKey(subAgentId: string, toolId: string): string {
  return `${subAgentId}:${toolId}`;
}

function getExternalDelegateKey(subAgentId: string, externalAgentId: string): string {
  return `external:${subAgentId}:${externalAgentId}`;
}

function getTeamDelegateKey(subAgentId: string, teamAgentId: string): string {
  return `team:${subAgentId}:${teamAgentId}`;
}

export function syncSavedAgentGraph({
  nodes,
  edges,
  savedAgent,
  nodeId,
  edgeId,
  subAgentFormData,
}: SyncSavedAgentGraphParams): SyncSavedAgentGraphResult {
  const selectedNode = findNodeByGraphKey(nodes, nodeId);
  const selectedEdge = findEdgeByGraphKey(edges, nodes, edgeId);
  const renamedSubAgentIds = new Map<string, string>();

  for (const node of nodes) {
    if (node.type !== NodeType.SubAgent) continue;

    const submittedSubAgentId = getSubAgentIdForNode(node, subAgentFormData) as string;
    if (savedAgent.subAgents[submittedSubAgentId]) {
      renamedSubAgentIds.set(node.id, submittedSubAgentId);
    }
  }

  const renameSubAgentId = (id: string) => renamedSubAgentIds.get(id) ?? id;

  const relationIdsByKey = new Map<string, string[]>();
  const delegateRelationIdsByKey = new Map<string, string[]>();
  for (const [subAgentId, subAgent] of Object.entries(savedAgent.subAgents)) {
    for (const canUse of subAgent.canUse ?? []) {
      if (!canUse.agentToolRelationId) continue;
      const key = getCanUseKey(subAgentId, canUse.toolId);
      const current = relationIdsByKey.get(key) ?? [];
      relationIdsByKey.set(key, [...current, canUse.agentToolRelationId]);
    }

    for (const delegate of subAgent.canDelegateTo ?? []) {
      if (typeof delegate !== 'object') continue;

      if ('externalAgentId' in delegate && delegate.subAgentExternalAgentRelationId) {
        const key = getExternalDelegateKey(subAgentId, delegate.externalAgentId);
        const current = delegateRelationIdsByKey.get(key) ?? [];
        delegateRelationIdsByKey.set(key, [...current, delegate.subAgentExternalAgentRelationId]);
      }

      if ('agentId' in delegate && delegate.subAgentTeamAgentRelationId) {
        const key = getTeamDelegateKey(subAgentId, delegate.agentId);
        const current = delegateRelationIdsByKey.get(key) ?? [];
        delegateRelationIdsByKey.set(key, [...current, delegate.subAgentTeamAgentRelationId]);
      }
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

  const claimDelegateRelationId = (key: string, current?: string | null) => {
    if (current) {
      usedRelationIds.add(current);
      return current;
    }

    const relationIds = delegateRelationIdsByKey.get(key) ?? [];
    while (relationIds.length > 0) {
      const relationId = relationIds.shift();
      if (!relationId || usedRelationIds.has(relationId)) continue;
      usedRelationIds.add(relationId);
      return relationId;
    }

    return current ?? null;
  };

  const renamedSourceEdges = edges.map((edge) => ({
    ...edge,
    source: renameSubAgentId(edge.source),
    target: renameSubAgentId(edge.target),
  }));

  const claimedMcpRelationIds = new Map<string, string>();
  const renamedMcpNodeIds = new Map<string, string>();
  for (const node of nodes) {
    if (!isNodeType(node, NodeType.MCP)) {
      continue;
    }

    const incomingEdge = renamedSourceEdges.find((edge) => edge.target === node.id);
    if (!incomingEdge) {
      continue;
    }

    const relationshipId = claimRelationId(incomingEdge.source, node.data.toolId);
    if (!relationshipId) {
      continue;
    }
    claimedMcpRelationIds.set(node.id, relationshipId);

    const nextId = getMcpGraphKey({
      relationshipId,
      subAgentId: incomingEdge.source,
      toolId: node.data.toolId,
      fallbackId: node.id,
    });
    if (nextId && nextId !== node.id) {
      renamedMcpNodeIds.set(node.id, nextId);
    }
  }

  const renameMcpNodeId = (id: string) => renamedMcpNodeIds.get(id) ?? id;

  const preliminarilySyncedNodes = nodes
    .map((node) => {
      if (node.type === NodeType.SubAgent) {
        const nextId = renameSubAgentId(node.id);
        return {
          ...node,
          id: nextId,
          data: {
            ...node.data,
            nodeKey: getSubAgentGraphKey(nextId),
          },
        };
      }

      if (node.type === NodeType.MCP) {
        if (!isNodeType(node, NodeType.MCP)) {
          return node;
        }

        const incomingEdge = renamedSourceEdges.find((edge) => edge.target === node.id);
        if (!incomingEdge) {
          return null;
        }

        const relationshipId = claimedMcpRelationIds.get(node.id) ?? null;
        if (!relationshipId) {
          return null;
        }

        return {
          ...node,
          id: renameMcpNodeId(node.id),
          data: {
            ...node.data,
            nodeKey: renameMcpNodeId(node.id),
          },
        };
      }

      if (node.type === NodeType.FunctionTool) {
        if (!isNodeType(node, NodeType.FunctionTool)) {
          return node;
        }
        const subAgentId = node.data.subAgentId ? renameSubAgentId(node.data.subAgentId) : null;

        if (!subAgentId) {
          return null;
        }

        const relationshipId = claimRelationId(
          subAgentId,
          node.data.toolId,
          node.data.relationshipId
        );

        return {
          ...node,
          data: {
            ...node.data,
            nodeKey: getFunctionToolGraphKey({
              relationshipId,
              toolId: node.data.toolId,
              fallbackId: node.id,
            }),
            subAgentId,
            relationshipId,
          },
        };
      }

      return node;
    })
    .filter((node): node is Node => node !== null);

  const syncedEdges = renamedSourceEdges.map((edge) => ({
    ...edge,
    target: renameMcpNodeId(edge.target),
  }));

  const syncedNodes = preliminarilySyncedNodes
    .map((node) => {
      if (node.type === NodeType.ExternalAgent) {
        if (!isNodeType(node, NodeType.ExternalAgent)) {
          return node;
        }
        const { externalAgentId, relationshipId: currentRelationshipId } = node.data;
        const incomingEdge = syncedEdges.find((edge) => edge.target === node.id);

        if (!incomingEdge || !externalAgentId) {
          return null;
        }

        return {
          ...node,
          data: {
            ...node.data,
            nodeKey: getExternalAgentGraphKey(externalAgentId),
            relationshipId: claimDelegateRelationId(
              getExternalDelegateKey(incomingEdge.source, externalAgentId),
              currentRelationshipId
            ),
          },
        };
      }

      if (node.type === NodeType.TeamAgent) {
        if (!isNodeType(node, NodeType.TeamAgent)) {
          return node;
        }
        const { teamAgentId, relationshipId: currentRelationshipId } = node.data;
        const incomingEdge = syncedEdges.find((edge) => edge.target === node.id);

        if (!incomingEdge || !teamAgentId) {
          return null;
        }

        return {
          ...node,
          data: {
            ...node.data,
            nodeKey: getTeamAgentGraphKey(teamAgentId),
            relationshipId: claimDelegateRelationId(
              getTeamDelegateKey(incomingEdge.source, teamAgentId),
              currentRelationshipId
            ),
          },
        };
      }

      return node;
    })
    .filter((node): node is Node => node !== null);

  const keptNodeIds = new Set(syncedNodes.map((node) => node.id));
  const keptEdges = syncedEdges.filter(
    (edge) => keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)
  );

  const selectedSyncedNode = selectedNode
    ? syncedNodes.find(
        (node) =>
          node.id ===
          (selectedNode.type === NodeType.SubAgent
            ? renameSubAgentId(selectedNode.id)
            : selectedNode.type === NodeType.MCP
              ? renameMcpNodeId(selectedNode.id)
              : selectedNode.id)
      )
    : undefined;
  const nextNodeId = selectedSyncedNode ? getNodeGraphKey(selectedSyncedNode) : null;

  const selectedSyncedEdge = selectedEdge
    ? keptEdges.find((edge) => edge.id === selectedEdge.id)
    : undefined;
  const nextEdgeId = selectedSyncedEdge ? getEdgeGraphKey(selectedSyncedEdge, syncedNodes) : null;

  return {
    nodes: syncedNodes.map((node) => ({
      ...node,
      selected: nextNodeId ? getNodeGraphKey(node) === nextNodeId : false,
    })),
    edges: keptEdges.map((edge) => ({
      ...edge,
      selected: nextEdgeId ? getEdgeGraphKey(edge, syncedNodes) === nextEdgeId : false,
    })),
    nodeId: nextNodeId,
    edgeId: nextEdgeId,
  };
}
