'use server';

import { cache } from 'react';
import { makeManagementApiRequest } from './api-config';

export interface OrgEntitlement {
  resourceType: string;
  maxValue: number;
}

interface EntitlementsResponse {
  entitlements: OrgEntitlement[];
}

async function $fetchEntitlements(tenantId: string): Promise<OrgEntitlement[]> {
  const response = await makeManagementApiRequest<EntitlementsResponse>(
    `tenants/${tenantId}/entitlements`
  );

  return response.entitlements ?? [];
}
export const fetchEntitlements = cache($fetchEntitlements);
