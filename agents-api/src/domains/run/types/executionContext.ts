import type { BaseExecutionContext, FullExecutionContext } from '@inkeep/agents-core';
import { env } from '../../../env.js';

/**
 * Extract userId from execution context metadata (when available)
 * Only available when request originates from an authenticated user session (e.g., playground)
 */
export function getUserIdFromContext(ctx: FullExecutionContext): string | undefined {
  const metadata = ctx.metadata as
    | { initiatedBy?: { type: 'user' | 'api_key'; id: string } }
    | undefined;
  return metadata?.initiatedBy?.type === 'user' ? metadata.initiatedBy.id : undefined;
}

/**
 * Create execution context from middleware values
 */
export function createBaseExecutionContext(params: {
  apiKey: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  apiKeyId: string;
  baseUrl?: string;
  subAgentId?: string;
  ref?: string;
  metadata?: BaseExecutionContext['metadata'];
}): BaseExecutionContext {
  return {
    apiKey: params.apiKey,
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
    baseUrl: params.baseUrl || env.INKEEP_AGENTS_API_URL,
    apiKeyId: params.apiKeyId,
    subAgentId: params.subAgentId,
    ref: params.ref,
    metadata: params.metadata || {},
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
