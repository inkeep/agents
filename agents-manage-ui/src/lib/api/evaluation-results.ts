/**
 * API Client for Evaluation Results Operations
 *
 * This module provides HTTP client functions to communicate with the
 * evaluations API endpoints for evaluation results.
 */

'use server';

import { makeManagementApiRequest } from './api-config';

export interface EvaluationResult {
  id: string;
  conversationId: string;
  evaluatorId: string;
  evaluationRunId?: string | null;
  agentId?: string | null;
  input?: string | null;
  conversationCreatedAt?: string | null;
  output?: {
    text?: string;
    [key: string]: unknown;
  } | null;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  projectId: string;
}

// The results endpoints are paginated server-side so each request enriches a bounded number
// of conversations. The UI operates on the full result set (filtering, progress, CSV export),
// so we page through and aggregate here. 200 is the API's max page size.
const RESULTS_PAGE_SIZE = 200;
// Safety cap so a non-converging pagination response (e.g. concurrent writes inflating `total`,
// or a malformed `pages`) can't spin the server action indefinitely. 200 pages = 40k results.
const RESULTS_MAX_PAGES = 200;

interface ApiPaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

async function fetchAllEvaluationResults(basePath: string): Promise<EvaluationResult[]> {
  const aggregated: EvaluationResult[] = [];
  let page = 1;

  while (true) {
    const response = await makeManagementApiRequest<ApiPaginatedResponse<EvaluationResult>>(
      `${basePath}?page=${page}&limit=${RESULTS_PAGE_SIZE}`
    );
    aggregated.push(...response.data);
    const pages = response.pagination?.pages ?? 1;
    if (response.data.length === 0 || page >= pages) {
      break;
    }
    if (page >= RESULTS_MAX_PAGES) {
      console.warn(
        `fetchAllEvaluationResults: hit ${RESULTS_MAX_PAGES}-page cap for ${basePath} (pages=${pages})`
      );
      break;
    }
    page += 1;
  }

  return aggregated;
}

/**
 * Fetch all evaluation results for a job config (pages through the API and aggregates).
 */
export async function fetchEvaluationResultsByJobConfig(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<EvaluationResult[]> {
  return fetchAllEvaluationResults(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/results`
  );
}

/**
 * Fetch all evaluation results for a run config (pages through the API and aggregates).
 */
export async function fetchEvaluationResultsByRunConfig(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<EvaluationResult[]> {
  return fetchAllEvaluationResults(
    `tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}/results`
  );
}
