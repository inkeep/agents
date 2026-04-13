import { getAgentIdsForEvaluators, type AgentsManageDatabaseClient } from '@inkeep/agents-core';

export function filterEvaluatorsByAgentScope(params: {
  agentIdsMap: Map<string, string[]>;
  agentId: string;
  evaluatorIds: string[];
}): string[] {
  const { agentIdsMap, agentId, evaluatorIds } = params;

  return evaluatorIds.filter((evalId) => {
    const scopedAgents = agentIdsMap.get(evalId);
    if (!scopedAgents || scopedAgents.length === 0) return true;
    return scopedAgents.includes(agentId);
  });
}

export async function getEvaluatorAgentScopeMap(
  db: AgentsManageDatabaseClient,
  params: {
    tenantId: string;
    projectId: string;
    evaluatorIds: string[];
  }
): Promise<Map<string, string[]>> {
  return getAgentIdsForEvaluators(db)({
    scopes: { tenantId: params.tenantId, projectId: params.projectId },
    evaluatorIds: params.evaluatorIds,
  });
}
