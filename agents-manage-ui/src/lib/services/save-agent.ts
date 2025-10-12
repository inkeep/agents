import { createFullAgentAction, updateFullAgentAction } from '@/lib/actions/agent-full';
import type { FullAgentDefinition } from '@/lib/types/agent-full';

export async function saveAgent(
  tenantId: string,
  projectId: string,
  agent: FullAgentDefinition,
  agentId?: string
) {
  if (agentId) {
    return updateFullAgentAction(tenantId, projectId, agentId, agent);
  }
  return createFullAgentAction(tenantId, projectId, agent);
}
