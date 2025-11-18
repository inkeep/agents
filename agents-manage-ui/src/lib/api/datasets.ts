/**
 * API Client for Datasets Operations
 *
 * This module provides HTTP client functions to communicate with the
 * evaluations API endpoints for datasets.
 */

'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeEvalApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface Dataset {
  id: string;
  name?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  projectId: string;
}

export interface DatasetInsert {
  id?: string;
  name?: string | null;
  description?: string | null;
}

export interface DatasetUpdate {
  name?: string | null;
  description?: string | null;
}

/**
 * Fetch all datasets for a project
 */
export async function fetchDatasets(
  tenantId: string,
  projectId: string
): Promise<ListResponse<Dataset>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<ListResponse<Dataset>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets`
  );
}

/**
 * Fetch a single dataset by ID
 */
export async function fetchDataset(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<Dataset> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<Dataset>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets/${datasetId}`
  );

  return response.data;
}

/**
 * Create a new dataset
 */
export async function createDataset(
  tenantId: string,
  projectId: string,
  dataset: DatasetInsert
): Promise<Dataset> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<Dataset>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets`,
    {
      method: 'POST',
      body: JSON.stringify(dataset),
    }
  );

  return response.data;
}

/**
 * Update an existing dataset
 */
export async function updateDataset(
  tenantId: string,
  projectId: string,
  datasetId: string,
  dataset: DatasetUpdate
): Promise<Dataset> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeEvalApiRequest<SingleResponse<Dataset>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets/${datasetId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(dataset),
    }
  );

  return response.data;
}

/**
 * Delete a dataset
 */
export async function deleteDataset(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeEvalApiRequest(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets/${datasetId}`,
    {
      method: 'DELETE',
    }
  );
}
