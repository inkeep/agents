import type { Node } from '@xyflow/react';
import { NodeType } from '@/components/agent/configuration/node-types';

export type SubAgentFormData = Record<string, { id?: string | null }>;

export function getSubAgentIdForNode(node?: Node, subAgentFormData?: SubAgentFormData): string | undefined {
  if (!node) return;

  const subAgentId = subAgentFormData?.[node.id]?.id;
  if (subAgentId) {
    return subAgentId;
  }

  if (typeof node.data.id === 'string' && node.data.id) {
    return node.data.id;
  }

  return node.id;
}

export function findSubAgentNodeId(
  nodes: Node[],
  subAgentId?: string | null,
  subAgentFormData?: SubAgentFormData
): string | null {
  if (!subAgentId) {
    return null;
  }

  for (const node of nodes) {
    if (node.type !== NodeType.SubAgent) {
      continue;
    }

    if (node.id === subAgentId || getSubAgentIdForNode(node, subAgentFormData) === subAgentId) {
      return node.id;
    }
  }

  return null;
}
