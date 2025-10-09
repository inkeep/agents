import type { ExecutionContext } from '@inkeep/agents-core';

/**
 * Create execution context from middleware values
 */
export function createExecutionContext(params: {
  apiKey: string;
  tenantId: string;
  projectId: string;
  graphId: string;
  apiKeyId: string;
  subAgentId?: string;
  baseUrl?: string;
}): ExecutionContext {
  return {
    apiKey: params.apiKey,
    tenantId: params.tenantId,
    projectId: params.projectId,
    graphId: params.graphId,
    baseUrl: params.baseUrl || process.env.API_URL || 'http://localhost:3003',
    apiKeyId: params.apiKeyId,
    subAgentId: params.subAgentId,
  };
}
