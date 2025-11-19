/**
 * API Client for Evaluation Run Configs Operations
 *
 * This module provides HTTP client functions to communicate with the
 * evaluations API endpoints for evaluation run configs.
 */

'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeEvalApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface EvaluationRunConfig {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  suiteConfigIds?: string[];
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  projectId: string;
}

export interface EvaluationRunConfigInsert {
  id?: string;
  name: string;
  description: string;
  isActive?: boolean;
  suiteConfigIds?: string[];
}

export interface EvaluationRunConfigUpdate {
  name?: string;
  description?: string;
  isActive?: boolean;
  suiteConfigIds?: string[];
}

/**
 * Fetch all evaluation run configs for a project
 */
export async function fetchEvaluationRunConfigs(
  tenantId: string,
  projectId: string
): Promise<ListResponse<EvaluationRunConfig>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<ListResponse<EvaluationRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-run-configs`
  );
}

/**
 * Fetch a single evaluation run config by ID
 */
export async function fetchEvaluationRunConfig(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<EvaluationRunConfig> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<EvaluationRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-run-configs/${configId}`
  );

  return response.data;
}

/**
 * Create a new evaluation run config
 */
export async function createEvaluationRunConfig(
  tenantId: string,
  projectId: string,
  config: EvaluationRunConfigInsert
): Promise<EvaluationRunConfig> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<EvaluationRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-run-configs`,
    {
      method: 'POST',
      body: JSON.stringify(config),
    }
  );

  return response.data;
}

/**
 * Update an existing evaluation run config
 */
export async function updateEvaluationRunConfig(
  tenantId: string,
  projectId: string,
  configId: string,
  config: EvaluationRunConfigUpdate
): Promise<EvaluationRunConfig> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<EvaluationRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-run-configs/${configId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(config),
    }
  );

  return response.data;
}

/**
 * Delete an evaluation run config
 */
export async function deleteEvaluationRunConfig(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeEvalApiRequest(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-run-configs/${configId}`,
    {
      method: 'DELETE',
    }
  );
}
