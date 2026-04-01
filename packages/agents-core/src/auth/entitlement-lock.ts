import { and, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { orgEntitlement } from '../db/runtime/runtime-schema';

export async function withEntitlementLock<T>(
  db: AgentsRunDatabaseClient,
  orgId: string,
  resourceType: string,
  fn: (limit: number | null, tx: AgentsRunDatabaseClient) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ maxValue: orgEntitlement.maxValue })
      .from(orgEntitlement)
      .where(
        and(eq(orgEntitlement.organizationId, orgId), eq(orgEntitlement.resourceType, resourceType))
      )
      .for('update');

    const limit = rows.length === 0 ? null : rows[0].maxValue;
    return fn(limit, tx as unknown as AgentsRunDatabaseClient);
  });
}
