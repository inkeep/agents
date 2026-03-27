'use server';

import { cache } from 'react';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

export interface OrgEntitlement {
  resourceType: string;
  maxValue: number;
}

interface EntitlementsResponse {
  entitlements: OrgEntitlement[];
}

async function $fetchEntitlements(tenantId: string): Promise<OrgEntitlement[]> {
  validateTenantId(tenantId);

  const response = await makeManagementApiRequest<EntitlementsResponse>(
    `tenants/${tenantId}/entitlements`
  );

  return response.entitlements ?? [];
}
export const fetchEntitlements = cache($fetchEntitlements);
