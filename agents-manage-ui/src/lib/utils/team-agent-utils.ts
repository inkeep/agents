import type { Edge } from '@xyflow/react';
import type { SubAgentTeamAgentConfigLookup } from '@/components/agent/agent';
import type { TeamAgentNodeData } from '@/components/agent/configuration/node-types';

/**
 * Enhanced lookup for headers - uses relationshipId for team agents
 * Similar to external agents but simpler since team agents are within the same project
 */
export function getCurrentHeadersForTeamAgentNode(
  node: { data: TeamAgentNodeData; id: string },
  subAgentTeamAgentConfigLookup: SubAgentTeamAgentConfigLookup,
  _edges: Edge[]
): Record<string, string> {
  // First check if we have temporary headers stored on the node (from recent edits)
  if ((node.data as any).tempHeaders !== undefined) {
    return (node.data as any).tempHeaders;
  }

  // If node has relationshipId, find config by relationshipId
  const relationshipId = (node.data as any).relationshipId;
  if (relationshipId) {
    for (const teamAgentMap of Object.values(subAgentTeamAgentConfigLookup)) {
      const config = teamAgentMap[relationshipId];
      if (config) {
        return config.headers ?? {};
      }
    }
  }

  // No relationshipId found, return empty headers
  return {};
}
