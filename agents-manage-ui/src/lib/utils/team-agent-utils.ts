import type { TeamAgentNodeData } from '@/components/agent/configuration/node-types';

/**
 * Reads the current headers from team agent node data.
 */
export function getCurrentHeadersForTeamAgentNode(node: {
  data: TeamAgentNodeData;
  id: string;
}): Record<string, string> {
  if (node.data.tempHeaders && typeof node.data.tempHeaders === 'object') {
    return node.data.tempHeaders;
  }
  return {};
}
