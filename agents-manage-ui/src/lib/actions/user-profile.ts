'use server';

import { makeManagementApiRequest } from '../api/api-config';

export interface UserProfile {
  userId: string;
  timezone: string | null;
  attributes: Record<string, unknown>;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    return await makeManagementApiRequest<UserProfile>(`api/users/${userId}/profile`);
  } catch {
    return null;
  }
}

export async function updateUserProfileTimezone(userId: string, timezone: string): Promise<void> {
  await makeManagementApiRequest(`api/users/${userId}/profile`, {
    method: 'PUT',
    body: JSON.stringify({ timezone }),
  });
}
