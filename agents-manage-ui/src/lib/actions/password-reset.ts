'use server';

import { makeManagementApiRequest } from '../api/api-config';

type PasswordResetLinkResponse = {
  url: string;
};

export async function createPasswordResetLink(params: {
  tenantId: string;
  email: string;
}): Promise<PasswordResetLinkResponse> {
  return makeManagementApiRequest<PasswordResetLinkResponse>(
    `tenants/${params.tenantId}/password-reset-links`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: params.email }),
    }
  );
}
