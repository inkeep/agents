import type { Context } from 'hono';
import type { ResolvedRef } from '../dolt/ref';
import type { ExecutionContext } from '../types/utility';

/**
 * Create execution context from middleware values
 */
export function createExecutionContext(params: {
  apiKey: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  apiKeyId: string;
  ref: ResolvedRef;
  baseUrl?: string;
}): ExecutionContext {
  return {
    apiKey: params.apiKey,
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
    baseUrl: params.baseUrl || process.env.API_URL || 'http://localhost:3003',
    apiKeyId: params.apiKeyId,
    ref: params.ref,
  };
}

/**
 * Get execution context from API key authentication
 */
export function getRequestExecutionContext(c: Context): ExecutionContext {
  const executionContext = c.get('executionContext');

  if (!executionContext) {
    throw new Error('No execution context available. API key authentication is required.');
  }

  return executionContext;
}
