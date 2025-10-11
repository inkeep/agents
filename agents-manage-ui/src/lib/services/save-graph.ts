import { createFullGraphAction, updateFullGraphAction } from '@/lib/actions/agent-full';
import type { FullGraphDefinition } from '@/lib/types/agent-full';

export async function saveGraph(
  tenantId: string,
  projectId: string,
  agent: FullGraphDefinition,
  agentId?: string
) {
  if (agentId) {
    return updateFullGraphAction(tenantId, projectId, agentId, agent);
  }
  return createFullGraphAction(tenantId, projectId, agent);
}
