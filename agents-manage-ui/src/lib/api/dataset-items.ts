/**
 * API Client for Dataset Items Operations
 *
 * This module provides HTTP client functions to communicate with the
 * evaluations API endpoints for dataset items.
 */

'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeEvalApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface DatasetItem {
  id: string;
  datasetId: string;
  input?: {
    messages: Array<{ role: string; content: unknown }>;
    headers?: Record<string, string>;
  } | null;
  expectedOutput?: Array<{ role: string; content: unknown }> | null;
  simulationAgent?: {
    stopWhen?: unknown;
    prompt: string;
    model: unknown;
  } | null;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  projectId: string;
}

export interface DatasetItemInsert {
  id?: string;
  input?: {
    messages: Array<{ role: string; content: unknown }>;
    headers?: Record<string, string>;
  } | null;
  expectedOutput?: Array<{ role: string; content: unknown }> | null;
  simulationAgent?: {
    stopWhen?: unknown;
    prompt: string;
    model: unknown;
  } | null;
}

export interface DatasetItemUpdate {
  input?: {
    messages: Array<{ role: string; content: unknown }>;
    headers?: Record<string, string>;
  } | null;
  expectedOutput?: Array<{ role: string; content: unknown }> | null;
  simulationAgent?: {
    stopWhen?: unknown;
    prompt: string;
    model: unknown;
  } | null;
}

/**
 * Fetch all dataset items for a dataset
 */
export async function fetchDatasetItems(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<ListResponse<DatasetItem>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<ListResponse<DatasetItem>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets/${datasetId}/items`
  );
}

/**
 * Fetch a single dataset item by ID
 */
export async function fetchDatasetItem(
  tenantId: string,
  projectId: string,
  datasetId: string,
  itemId: string
): Promise<DatasetItem> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<DatasetItem>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets/${datasetId}/items/${itemId}`
  );

  return response.data;
}

/**
 * Create a new dataset item
 */
export async function createDatasetItem(
  tenantId: string,
  projectId: string,
  datasetId: string,
  item: DatasetItemInsert
): Promise<DatasetItem> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<DatasetItem>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets/${datasetId}/items`,
    {
      method: 'POST',
      body: JSON.stringify(item),
    }
  );

  return response.data;
}

/**
 * Update an existing dataset item
 */
export async function updateDatasetItem(
  tenantId: string,
  projectId: string,
  datasetId: string,
  itemId: string,
  item: DatasetItemUpdate
): Promise<DatasetItem> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<DatasetItem>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets/${datasetId}/items/${itemId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(item),
    }
  );

  return response.data;
}

/**
 * Delete a dataset item
 */
export async function deleteDatasetItem(
  tenantId: string,
  projectId: string,
  datasetId: string,
  itemId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeEvalApiRequest(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets/${datasetId}/items/${itemId}`,
    {
      method: 'DELETE',
    }
  );
}
