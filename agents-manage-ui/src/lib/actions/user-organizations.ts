'use server';

import type { UserOrganizationsResponse } from '@inkeep/agents-core/auth/validation';
import { makeManagementApiRequest } from '../api/api-config';

export async function getUserOrganizations(userId: string) {
  return await makeManagementApiRequest<UserOrganizationsResponse>(
    `api/users/${userId}/organizations`
  );
}
