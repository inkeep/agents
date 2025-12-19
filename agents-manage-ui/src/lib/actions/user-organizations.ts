'use server';

import type { UserOrganizationsResponse } from '@inkeep/agents-core/auth/validation';
import { makeManagementApiRequest } from '../api/api-config';

interface CreateUserOrganizationParams {
  userId: string;
  organizationId: string;
  role: string;
}
export async function getUserOrganizations(userId: string) {
  return await makeManagementApiRequest<UserOrganizationsResponse>(
    `api/users/${userId}/organizations`
  );
}
