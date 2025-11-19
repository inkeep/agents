'use server';

import type { ProjectFormData } from '@/components/projects/form/validation';
import type { Project } from '../types/project';
import type { ListResponse, SingleResponse } from '../types/response';
import type { ApiRequestOptions } from './api-config';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

export async function fetchProjects(
  tenantId: string,
  options?: ApiRequestOptions
): Promise<ListResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<ListResponse<any>>(
    `tenants/${tenantId}/projects`,
    options
  );

  if (response.data) {
    response.data = response.data.map((project: any) => ({
      ...project,
      projectId: project.id,
    }));
  }

  return response as ListResponse<Project>;
}

export async function fetchProject(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions
): Promise<SingleResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SingleResponse<any>>(
    `tenants/${tenantId}/projects/${projectId}`,
    options
  );

  if (response.data) {
    response.data = {
      ...response.data,
      projectId: response.data.id,
    };
  }

  return response as SingleResponse<Project>;
}

export async function createProject(
  tenantId: string,
  project: ProjectFormData,
  options?: ApiRequestOptions
): Promise<SingleResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SingleResponse<any>>(
    `tenants/${tenantId}/projects`,
    {
      ...options,
      method: 'POST',
      body: JSON.stringify(project),
    }
  );

  if (response.data) {
    response.data = {
      ...response.data,
      projectId: response.data.id,
    };
  }

  return response as SingleResponse<Project>;
}

export async function updateProject(
  tenantId: string,
  projectId: string,
  project: ProjectFormData,
  options?: ApiRequestOptions
): Promise<SingleResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SingleResponse<any>>(
    `tenants/${tenantId}/projects/${projectId}`,
    {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(project),
    }
  );
  if (response.data) {
    response.data = {
      ...response.data,
      projectId: response.data.id,
    };
  }

  return response as SingleResponse<Project>;
}

export async function deleteProject(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions
): Promise<void> {
  validateTenantId(tenantId);

  await makeManagementApiRequest<void>(`tenants/${tenantId}/projects/${projectId}`, {
    ...options,
    method: 'DELETE',
  });
}
