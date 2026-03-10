import type { TeamAgentNodeData } from '@/components/agent/configuration/node-types';

/**
 * Reads the current headers from team agent node data.
 */
export function getCurrentHeadersForTeamAgentNode(node: {
  data: TeamAgentNodeData;
  id: string;
}): Record<string, string> {
  // First check if we have temporary headers stored on the node (from recent edits)
  if ((node.data as any).tempHeaders && typeof (node.data as any).tempHeaders === 'object') {
    return (node.data as any).tempHeaders;
  }
  return {};
}
