import { dalSelectEntitlementForUpdate } from '../data-access/runtime/entitlements';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';

export async function withEntitlementLock<T>(
  db: AgentsRunDatabaseClient,
  orgId: string,
  resourceType: string,
  fn: (limit: number | null, tx: AgentsRunDatabaseClient) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    const limit = await dalSelectEntitlementForUpdate(
      tx as unknown as AgentsRunDatabaseClient,
      orgId,
      resourceType
    );
    return fn(limit, tx as unknown as AgentsRunDatabaseClient);
  });
}
