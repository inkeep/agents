/**
 * API Client for Skill Operations
 */
'use server';

import type { SkillApiInsert, SkillApiSelect, SkillApiUpdate } from '@inkeep/agents-core';
import { revalidatePath } from 'next/cache';
import { cache } from 'react';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export type Skill = SkillApiSelect;

export async function fetchSkills(
  tenantId: string,
  projectId: string
): Promise<ListResponse<Skill>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<ListResponse<Skill>>(
    `tenants/${tenantId}/projects/${projectId}/skills?limit=100`
  );
}

async function $fetchSkill(tenantId: string, projectId: string, skillId: string): Promise<Skill> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<Skill>>(
    `tenants/${tenantId}/projects/${projectId}/skills/${skillId}`
  );

  return response.data;
}
export const fetchSkill = cache($fetchSkill);

export async function createSkill(
  tenantId: string,
  projectId: string,
  skill: SkillApiInsert
): Promise<Skill> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<Skill>>(
    `tenants/${tenantId}/projects/${projectId}/skills`,
    {
      method: 'POST',
      body: JSON.stringify(skill),
    }
  );
  revalidatePath(`/${tenantId}/projects/${projectId}/skills`);

  return response.data;
}

export async function updateSkill(
  tenantId: string,
  projectId: string,
  skillId: string,
  skill: SkillApiUpdate
): Promise<Skill> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<Skill>>(
    `tenants/${tenantId}/projects/${projectId}/skills/${skillId}`,
    {
      method: 'PUT',
      body: JSON.stringify(skill),
    }
  );
  revalidatePath(`/${tenantId}/projects/${projectId}/skills`);

  return response.data;
}

export async function deleteSkill(tenantId: string, projectId: string, skillId: string) {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(`tenants/${tenantId}/projects/${projectId}/skills/${skillId}`, {
    method: 'DELETE',
  });
}
