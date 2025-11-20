'use server';

import type { AddUserToOrganizationResponse, UserOrganizationsResponse } from '@inkeep/agents-core/auth/validation';
import { makeManagementApiRequest } from '../api/api-config';

export interface CreateUserOrganizationParams {
  userId: string;
  organizationId: string;
  role: string;
}

export async function addUserToOrganization(params: CreateUserOrganizationParams) {
  const { userId, organizationId, role } = params;

  return await makeManagementApiRequest<AddUserToOrganizationResponse>(
    `api/users/${userId}/organizations`,
    {
      method: 'POST',
      body: JSON.stringify({ organizationId, role }),
    }
  );
}

export async function getUserOrganizations(userId: string) {
  return await makeManagementApiRequest<UserOrganizationsResponse>(
    `api/users/${userId}/organizations`
  );
}
