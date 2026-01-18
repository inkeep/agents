import type { Edge } from '@xyflow/react';
import type { ExternalAgentNodeData } from '@/components/agent/configuration/node-types';

/**
 * Enhanced lookup for headers - uses relationshipId
 */
export function getCurrentHeadersForExternalAgentNode(
  node: { data: ExternalAgentNodeData; id: string },
  subAgentExternalAgentConfigLookup: Record<
    string,
    Record<string, { externalAgentId: string; headers?: Record<string, string> }>
  >,
  _edges: Edge[]
): Record<string, string> {
  // First check if we have temporary headers stored on the node (from recent edits)
  if ((node.data as any).tempHeaders !== undefined) {
    return (node.data as any).tempHeaders;
  }

  // If node has relationshipId, find config by relationshipId
  const relationshipId = (node.data as any).relationshipId;
  if (relationshipId) {
    for (const externalAgentMap of Object.values(subAgentExternalAgentConfigLookup)) {
      const config = externalAgentMap[relationshipId];
      if (config) {
        return config.headers ?? {};
      }
    }
  }

  // No relationshipId found, return empty headers
  return {};
}
