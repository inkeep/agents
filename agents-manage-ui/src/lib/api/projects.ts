'use server';

import type { ProjectFormData } from '@/components/projects/form/validation';
import type { Project } from '../types/project';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

export async function fetchProjects(tenantId: string): Promise<ListResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<ListResponse<any>>(
    `tenants/${tenantId}/crud/projects`
  );

  // Map backend 'id' field to 'projectId' for frontend consistency
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
  projectId: string
): Promise<SingleResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SingleResponse<any>>(
    `tenants/${tenantId}/crud/projects/${projectId}`
  );

  // Map backend 'id' field to 'projectId' for frontend consistency
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
  project: ProjectFormData
): Promise<SingleResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SingleResponse<any>>(
    `tenants/${tenantId}/crud/projects`,
    {
      method: 'POST',
      body: JSON.stringify(project),
    }
  );

  // Map backend 'id' field to 'projectId' for frontend consistency
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
  project: ProjectFormData
): Promise<SingleResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SingleResponse<any>>(
    `tenants/${tenantId}/crud/projects/${projectId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(project),
    }
  );
  // Map backend 'id' field to 'projectId' for frontend consistency
  if (response.data) {
    response.data = {
      ...response.data,
      projectId: response.data.id,
    };
  }

  return response as SingleResponse<Project>;
}

export async function deleteProject(tenantId: string, projectId: string): Promise<void> {
  validateTenantId(tenantId);

  await makeManagementApiRequest<void>(`tenants/${tenantId}/crud/projects/${projectId}`, {
    method: 'DELETE',
  });
}
