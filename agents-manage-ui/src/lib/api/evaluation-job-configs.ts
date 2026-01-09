/**
 * API Client for Evaluation Job Configs Operations
 *
 * This module provides HTTP client functions to communicate with the
 * evaluations API endpoints for evaluation job configs.
 */

'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface EvaluationJobFilterCriteria {
  datasetRunIds?: string[];
  conversationIds?: string[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  [key: string]: unknown;
}

export interface Filter<_T> {
  [key: string]: unknown;
}

export interface EvaluationJobConfig {
  id: string;
  jobFilters?: Filter<EvaluationJobFilterCriteria> | null;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  projectId: string;
}

export interface EvaluationJobConfigInsert {
  id?: string;
  jobFilters?: Filter<EvaluationJobFilterCriteria> | null;
  evaluatorIds?: string[];
}

/**
 * Fetch all evaluation job configs for a project
 */
export async function fetchEvaluationJobConfigs(
  tenantId: string,
  projectId: string
): Promise<ListResponse<EvaluationJobConfig>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<ListResponse<EvaluationJobConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs`
  );
}

/**
 * Fetch a single evaluation job config by ID
 */
export async function fetchEvaluationJobConfig(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<EvaluationJobConfig> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<EvaluationJobConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}`
  );

  return response.data;
}

/**
 * Create a new evaluation job config
 */
export async function createEvaluationJobConfig(
  tenantId: string,
  projectId: string,
  config: EvaluationJobConfigInsert
): Promise<EvaluationJobConfig> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<EvaluationJobConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs`,
    {
      method: 'POST',
      body: JSON.stringify(config),
    }
  );

  return response.data;
}

/**
 * Delete an evaluation job config
 */
export async function deleteEvaluationJobConfig(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}`,
    {
      method: 'DELETE',
    }
  );
}

export interface EvaluationJobConfigEvaluatorRelation {
  id: string;
  tenantId: string;
  projectId: string;
  evaluationJobConfigId: string;
  evaluatorId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch evaluators linked to an evaluation job config
 */
export async function fetchEvaluationJobConfigEvaluators(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<ListResponse<EvaluationJobConfigEvaluatorRelation>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<ListResponse<EvaluationJobConfigEvaluatorRelation>>(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/evaluators`
  );
}
