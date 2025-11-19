import type { ExecutionContext, ResolvedRef } from '@inkeep/agents-core';

/**
 * Create execution context from middleware values
 */
export function createExecutionContext(params: {
  apiKey: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  apiKeyId: string;
  subAgentId?: string;
  baseUrl?: string;
  ref: ResolvedRef;
  metadata?: {
    teamDelegation?: boolean;
    originAgentId?: string;
  };
}): ExecutionContext {
  return {
    apiKey: params.apiKey,
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
    baseUrl: params.baseUrl || process.env.API_URL || 'http://localhost:3003',
    apiKeyId: params.apiKeyId,
    subAgentId: params.subAgentId,
    metadata: params.metadata || {},
    ref: params.ref,
  };
}

interface CommonSandboxConfig {
  runtime: 'node22' | 'typescript';
  timeout?: number;
  vcpus?: number;
}

export interface NativeSandboxConfig extends CommonSandboxConfig {
  provider: 'native';
}

export interface VercelSandboxConfig extends CommonSandboxConfig {
  provider: 'vercel';
  teamId: string;
  projectId: string;
  token: string;
}

export type SandboxConfig = NativeSandboxConfig | VercelSandboxConfig;
