/**
 * API Client for Evaluation Suite Configs Operations
 */

'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeEvalApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface EvaluationSuiteConfig {
  id: string;
  name: string;
  description: string;
  filters: Record<string, unknown> | null;
  sampleRate: number | null;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  projectId: string;
}

export interface EvaluationSuiteConfigInsert {
  id?: string;
  name: string;
  description: string;
  filters?: Record<string, unknown> | null;
  sampleRate?: number | null;
  evaluatorIds?: string[];
}

/**
 * Fetch all evaluation suite configs for a project
 */
export async function fetchEvaluationSuiteConfigs(
  tenantId: string,
  projectId: string
): Promise<ListResponse<EvaluationSuiteConfig>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<ListResponse<EvaluationSuiteConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-suite-configs`
  );
}

/**
 * Fetch a single evaluation suite config by ID
 */
export async function fetchEvaluationSuiteConfig(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<SingleResponse<EvaluationSuiteConfig>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<SingleResponse<EvaluationSuiteConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-suite-configs/${configId}`
  );
}

/**
 * Fetch evaluators for an evaluation suite config
 */
export async function fetchEvaluationSuiteConfigEvaluators(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<ListResponse<{ evaluatorId: string }>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<ListResponse<{ evaluatorId: string }>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-suite-configs/${configId}/evaluators`
  );
}

/**
 * Create a new evaluation suite config
 */
export async function createEvaluationSuiteConfig(
  tenantId: string,
  projectId: string,
  config: EvaluationSuiteConfigInsert
): Promise<EvaluationSuiteConfig> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<EvaluationSuiteConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-suite-configs`,
    {
      method: 'POST',
      body: JSON.stringify(config),
    }
  );

  return response.data;
}
