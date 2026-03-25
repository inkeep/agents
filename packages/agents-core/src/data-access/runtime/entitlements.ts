import { eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { orgEntitlement } from '../../db/runtime/runtime-schema';

export const listOrgEntitlements =
  (db: AgentsRunDatabaseClient) =>
  async (orgId: string): Promise<Array<{ resourceType: string; maxValue: number }>> => {
    const rows = await db
      .select({
        resourceType: orgEntitlement.resourceType,
        maxValue: orgEntitlement.maxValue,
      })
      .from(orgEntitlement)
      .where(eq(orgEntitlement.organizationId, orgId));

    return rows;
  };
