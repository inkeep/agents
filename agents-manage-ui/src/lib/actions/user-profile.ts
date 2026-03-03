'use server';

import { makeManagementApiRequest } from '../api/api-config';

export async function updateUserProfileTimezone(userId: string, timezone: string): Promise<void> {
  await makeManagementApiRequest(`api/users/${userId}/profile`, {
    method: 'PUT',
    body: JSON.stringify({ timezone }),
  });
}
