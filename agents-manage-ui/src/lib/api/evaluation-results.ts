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

export interface ServerFilterParams {
  page?: number;
  limit?: number;
  evaluatorId?: string;
  agentId?: string;
  conversationId?: string;
}

export interface PaginatedEvalResultsResponse {
  data: EvaluationResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    completedCount?: number;
  };
  distinctAgentIds?: string[];
  distinctOutputKeys?: string[];
}

const RESULTS_PAGE_SIZE = 100;
const RESULTS_MAX_PAGES = 200;

function buildQueryString(params: ServerFilterParams): string {
  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set('page', String(params.page));
  if (params.limit != null) searchParams.set('limit', String(params.limit));
  if (params.evaluatorId) searchParams.set('evaluatorId', params.evaluatorId);
  if (params.agentId) searchParams.set('agentId', params.agentId);
  if (params.conversationId) searchParams.set('conversationId', params.conversationId);
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

function buildBasePath(
  tenantId: string,
  projectId: string,
  kind: 'job-config' | 'run-config',
  configId: string
): string {
  const segment = kind === 'job-config' ? 'evaluation-job-configs' : 'evaluation-run-configs';
  return `tenants/${tenantId}/projects/${projectId}/evals/${segment}/${configId}/results`;
}

export async function fetchEvaluationResultsPaginated(
  tenantId: string,
  projectId: string,
  kind: 'job-config' | 'run-config',
  configId: string,
  params: ServerFilterParams = {}
): Promise<PaginatedEvalResultsResponse> {
  const basePath = buildBasePath(tenantId, projectId, kind, configId);
  const qs = buildQueryString(params);
  return makeManagementApiRequest<PaginatedEvalResultsResponse>(`${basePath}${qs}`);
}

export async function fetchAllEvaluationResults(
  tenantId: string,
  projectId: string,
  kind: 'job-config' | 'run-config',
  configId: string,
  params: Pick<ServerFilterParams, 'evaluatorId' | 'agentId' | 'conversationId'> = {}
): Promise<EvaluationResult[]> {
  const basePath = buildBasePath(tenantId, projectId, kind, configId);
  const aggregated: EvaluationResult[] = [];
  let page = 1;

  while (true) {
    const qs = buildQueryString({ ...params, page, limit: RESULTS_PAGE_SIZE });
    const response = await makeManagementApiRequest<PaginatedEvalResultsResponse>(
      `${basePath}${qs}`
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
