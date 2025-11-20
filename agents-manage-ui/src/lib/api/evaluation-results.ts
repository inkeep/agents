/**
 * API Client for Evaluation Results Operations
 *
 * This module provides HTTP client functions to communicate with the
 * evaluations API endpoints for evaluation results.
 */

'use server';

import type { ListResponse } from '../types/response';
import { makeEvalApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface EvaluationResult {
  id: string;
  conversationId: string;
  evaluatorId: string;
  evaluationRunId?: string | null;
  input?: string | null;
  output?: {
    text?: string;
    [key: string]: unknown;
  } | null;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  projectId: string;
}

/**
 * Fetch evaluation results for a job config
 */
export async function fetchEvaluationResultsByJobConfig(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<ListResponse<EvaluationResult>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<ListResponse<EvaluationResult>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-job-configs/${configId}/results`
  );
}

/**
 * Fetch evaluation results for a run config
 */
export async function fetchEvaluationResultsByRunConfig(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<ListResponse<EvaluationResult>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<ListResponse<EvaluationResult>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/evaluation-run-configs/${configId}/results`
  );
}
