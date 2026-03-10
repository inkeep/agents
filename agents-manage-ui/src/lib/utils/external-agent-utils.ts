import type { ExternalAgentNodeData } from '@/components/agent/configuration/node-types';

/**
 * Reads the current headers from external agent node data.
 */
export function getCurrentHeadersForExternalAgentNode(node: {
  data: ExternalAgentNodeData;
  id: string;
}): Record<string, string> {
  if ((node.data as any).tempHeaders && typeof (node.data as any).tempHeaders === 'object') {
    return (node.data as any).tempHeaders;
  }
  return {};
}
