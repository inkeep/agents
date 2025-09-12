import { createFullGraphAction, updateFullGraphAction } from '@/lib/actions/graph-full';
import type { FullGraphDefinition } from '@/lib/types/graph-full';

export async function saveGraph(
  tenantId: string,
  projectId: string,
  graph: FullGraphDefinition,
  graphId?: string
) {
  if (graphId) {
    return updateFullGraphAction(tenantId, projectId, graphId, graph);
  }
  return createFullGraphAction(tenantId, projectId, graph);
}
