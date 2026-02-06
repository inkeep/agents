'use server';

import { cookies } from 'next/headers';
import { getAgentsApiUrl } from '../api/api-config';

export interface UserProvider {
  userId: string;
  providers: string[];
}

/**
 * Get the authentication providers for a list of users.
 * Returns which providers each user has linked (e.g., 'credential', 'google', 'auth0').
 * Requires the caller to be an admin/owner of the specified organization.
 */
export async function getUserProviders(
  userIds: string[],
  organizationId: string
): Promise<UserProvider[]> {
  if (userIds.length === 0) {
    return [];
  }

  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const baseUrl = getAgentsApiUrl();

    const response = await fetch(`${baseUrl}/manage/api/users/providers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ userIds, organizationId }),
    });

    if (!response.ok) {
      console.error('API error fetching user providers:', response.status, response.statusText);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user providers:', error);
    return [];
  }
}
