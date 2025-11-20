/**
 * API Client for Evaluators Operations
 *
 * This module provides HTTP client functions to communicate with the
 * evaluations API endpoints for evaluators.
 */

'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeEvalApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface ModelSettings {
  model?: string;
  providerOptions?: Record<string, unknown>;
}

export interface PassCriteriaCondition {
  field: string;
  operator: '>' | '<' | '>=' | '<=' | '=' | '!=';
  value: number;
}

export interface PassCriteria {
  operator: 'and' | 'or';
  conditions: PassCriteriaCondition[];
}

export interface Evaluator {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schema: Record<string, unknown>;
  model: ModelSettings;
  passCriteria?: PassCriteria;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  projectId: string;
}

export interface EvaluatorInsert {
  id?: string;
  name: string;
  description: string;
  prompt: string;
  schema: Record<string, unknown>;
  model: ModelSettings;
  passCriteria?: PassCriteria;
}

export interface EvaluatorUpdate {
  name?: string;
  description?: string;
  prompt?: string;
  schema?: Record<string, unknown>;
  model?: ModelSettings;
  passCriteria?: PassCriteria;
}

/**
 * Fetch all evaluators for a project
 */
export async function fetchEvaluators(
  tenantId: string,
  projectId: string
): Promise<ListResponse<Evaluator>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<ListResponse<Evaluator>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluators`
  );
}

/**
 * Fetch a single evaluator by ID
 */
export async function fetchEvaluator(
  tenantId: string,
  projectId: string,
  evaluatorId: string
): Promise<Evaluator> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<Evaluator>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluators/${evaluatorId}`
  );

  return response.data;
}

/**
 * Create a new evaluator
 */
export async function createEvaluator(
  tenantId: string,
  projectId: string,
  evaluator: EvaluatorInsert
): Promise<Evaluator> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<Evaluator>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluators`,
    {
      method: 'POST',
      body: JSON.stringify(evaluator),
    }
  );

  return response.data;
}

/**
 * Update an existing evaluator
 */
export async function updateEvaluator(
  tenantId: string,
  projectId: string,
  evaluatorId: string,
  evaluator: EvaluatorUpdate
): Promise<Evaluator> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<Evaluator>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluators/${evaluatorId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(evaluator),
    }
  );

  return response.data;
}

/**
 * Delete an evaluator
 */
export async function deleteEvaluator(
  tenantId: string,
  projectId: string,
  evaluatorId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeEvalApiRequest(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluators/${evaluatorId}`,
    {
      method: 'DELETE',
    }
  );
}
