/**
 * API Client for Dataset Items Operations
 *
 * This module provides HTTP client functions to communicate with the
 * evaluations API endpoints for dataset items.
 */

'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';

type DatasetMessageRole = 'user' | 'assistant' | 'system';

export interface DatasetItem {
  id: string;
  datasetId: string;
  input?: {
    messages: Array<{ role: DatasetMessageRole; content: unknown }>;
  } | null;
  expectedOutput?: Array<{ role: DatasetMessageRole; content: unknown }> | null;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  projectId: string;
}

export interface DatasetItemInsert {
  id?: string;
  input?: {
    messages: Array<{ role: DatasetMessageRole; content: unknown }>;
  } | null;
  expectedOutput?: Array<{ role: DatasetMessageRole; content: unknown }> | null;
}

export interface DatasetItemUpdate {
  input?: {
    messages: Array<{ role: DatasetMessageRole; content: unknown }>;
  } | null;
  expectedOutput?: Array<{ role: DatasetMessageRole; content: unknown }> | null;
}

/**
 * Fetch all dataset items for a dataset
 */
export async function fetchDatasetItems(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<ListResponse<DatasetItem>> {
  return makeManagementApiRequest<ListResponse<DatasetItem>>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}`
  );
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
  const response = await makeManagementApiRequest<SingleResponse<DatasetItem>>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items`,
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
  const response = await makeManagementApiRequest<SingleResponse<DatasetItem>>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/${itemId}`,
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
  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/${itemId}`,
    {
      method: 'DELETE',
    }
  );
}
