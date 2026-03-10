import type { ExternalAgentNodeData } from '@/components/agent/configuration/node-types';

/**
 * Reads the current headers from external agent node data.
 */
export function getCurrentHeadersForExternalAgentNode(node: {
  data: ExternalAgentNodeData;
  id: string;
}): Record<string, string> {
  // First check if we have temporary headers stored on the node (from recent edits)
  if (
    (node.data as any).tempHeaders !== undefined &&
    (node.data as any).tempHeaders !== null &&
    typeof (node.data as any).tempHeaders === 'object'
  ) {
    return (node.data as any).tempHeaders;
  }
  return {};
}
