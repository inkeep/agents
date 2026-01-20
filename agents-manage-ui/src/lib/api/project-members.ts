'use server';

import type { ProjectRole } from '@inkeep/agents-core';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

export interface ProjectMember {
  userId: string;
  role: ProjectRole;
  projectId?: string;
}

export interface ListProjectMembersParams {
  tenantId: string;
  projectId: string;
}

export interface AddProjectMemberParams {
  tenantId: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
}

export interface UpdateProjectMemberParams {
  tenantId: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  previousRole: ProjectRole;
}

export interface RemoveProjectMemberParams {
  tenantId: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
}

/**
 * List all members of a project.
 */
export async function listProjectMembers(
  params: ListProjectMembersParams
): Promise<{ data: ProjectMember[] }> {
  validateTenantId(params.tenantId);

  const response = await makeManagementApiRequest<{ data: ProjectMember[] }>(
    `tenants/${params.tenantId}/projects/${params.projectId}/members`
  );

  return response;
}

/**
 * Add a user to a project with a specified role.
 */
export async function addProjectMember(
  params: AddProjectMemberParams
): Promise<{ data: ProjectMember }> {
  validateTenantId(params.tenantId);

  const response = await makeManagementApiRequest<{ data: ProjectMember }>(
    `tenants/${params.tenantId}/projects/${params.projectId}/members`,
    {
      method: 'POST',
      body: JSON.stringify({
        userId: params.userId,
        role: params.role,
      }),
    }
  );

  return response;
}

/**
 * Update a project member's role.
 */
export async function updateProjectMember(
  params: UpdateProjectMemberParams
): Promise<{ data: ProjectMember }> {
  validateTenantId(params.tenantId);

  const response = await makeManagementApiRequest<{ data: ProjectMember }>(
    `tenants/${params.tenantId}/projects/${params.projectId}/members/${params.userId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        role: params.role,
        previousRole: params.previousRole,
      }),
    }
  );

  return response;
}

/**
 * Remove a user from a project.
 */
export async function removeProjectMember(params: RemoveProjectMemberParams): Promise<void> {
  validateTenantId(params.tenantId);

  await makeManagementApiRequest<void>(
    `tenants/${params.tenantId}/projects/${params.projectId}/members/${params.userId}?role=${params.role}`,
    {
      method: 'DELETE',
    }
  );
}
