import type { TeamAgentNodeData } from '@/components/agent/configuration/node-types';

/**
 * Reads the current headers from team agent node data.
 */
export function getCurrentHeadersForTeamAgentNode(node: {
  data: TeamAgentNodeData;
  id: string;
}): Record<string, string> {
  if ((node.data as any).tempHeaders && typeof (node.data as any).tempHeaders === 'object') {
    return (node.data as any).tempHeaders;
  }
  return {};
}
