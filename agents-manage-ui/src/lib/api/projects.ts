'use server';

import type { ProjectPermissions } from '@inkeep/agents-core';
import { cache } from 'react';
import type { ProjectOutput } from '@/components/projects/form/validation';
import type { Project } from '../types/project';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

async function $fetchProjects(tenantId: string): Promise<ListResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<ListResponse<any>>(
    `tenants/${tenantId}/projects?limit=100`
  );

  if (response.data) {
    response.data = response.data.map((project: any) => ({
      ...project,
      projectId: project.id,
    }));
  }

  return response as ListResponse<Project>;
}
export const fetchProjects = cache($fetchProjects);

async function $fetchProject(
  tenantId: string,
  projectId: string
): Promise<SingleResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SingleResponse<any>>(
    `tenants/${tenantId}/projects/${projectId}`
  );

  if (response.data) {
    response.data = {
      ...response.data,
      projectId: response.data.id,
    };
  }

  return response as SingleResponse<Project>;
}
export const fetchProject = cache($fetchProject);

export async function createProject(
  tenantId: string,
  project: ProjectOutput
): Promise<SingleResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SingleResponse<any>>(
    `tenants/${tenantId}/projects`,
    {
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
  project: ProjectOutput
): Promise<SingleResponse<Project>> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<SingleResponse<any>>(
    `tenants/${tenantId}/projects/${projectId}`,
    {
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

export async function deleteProject(tenantId: string, projectId: string): Promise<void> {
  validateTenantId(tenantId);

  await makeManagementApiRequest<void>(`tenants/${tenantId}/projects/${projectId}`, {
    method: 'DELETE',
  });
}

/**
 * Fetch project permissions for the current user.
 * Wrapped with React's cache() to deduplicate calls within a single request.
 */
export const fetchProjectPermissions = cache(
  async (tenantId: string, projectId: string): Promise<ProjectPermissions> => {
    validateTenantId(tenantId);

    const response = await makeManagementApiRequest<{ data: ProjectPermissions }>(
      `tenants/${tenantId}/projects/${projectId}/permissions`
    );

    return response.data;
  }
);
