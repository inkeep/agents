/**
 * API Client for Evaluators Operations
 *
 * This module provides HTTP client functions to communicate with the
 * evaluations API endpoints for evaluators.
 */

'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';

interface ModelSettings {
  model?: string;
  providerOptions?: Record<string, unknown>;
}

interface PassCriteriaCondition {
  field: string;
  operator: '>' | '<' | '>=' | '<=' | '=' | '!=';
  value: number;
}

interface PassCriteria {
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
  passCriteria?: PassCriteria | null;
}

export interface EvaluatorUpdate {
  name?: string;
  description?: string;
  prompt?: string;
  schema?: Record<string, unknown>;
  model?: ModelSettings;
  passCriteria?: PassCriteria | null;
}

/**
 * Fetch all evaluators for a project
 */
export async function fetchEvaluators(
  tenantId: string,
  projectId: string,
  { agentId }: { agentId?: string } = {}
): Promise<ListResponse<Evaluator>> {
  const params = new URLSearchParams();
  if (agentId) params.set('agentId', agentId);
  const qs = params.toString();
  return makeManagementApiRequest<ListResponse<Evaluator>>(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluators${qs ? `?${qs}` : ''}`
  );
}

/**
 * Create a new evaluator
 */
export async function createEvaluator(
  tenantId: string,
  projectId: string,
  evaluator: EvaluatorInsert
): Promise<Evaluator> {
  const response = await makeManagementApiRequest<SingleResponse<Evaluator>>(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluators`,
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
  const response = await makeManagementApiRequest<SingleResponse<Evaluator>>(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluators/${evaluatorId}`,
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
  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluators/${evaluatorId}`,
    {
      method: 'DELETE',
    }
  );
}
