import { and, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { anonymousUsers } from '../../db/runtime/runtime-schema';

export interface AnonymousUserInsert {
  id: string;
  tenantId: string;
  projectId: string;
  metadata?: Record<string, unknown>;
}

export interface AnonymousUserSelect {
  id: string;
  tenantId: string;
  projectId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export const createAnonymousUser =
  (db: AgentsRunDatabaseClient) =>
  async (params: AnonymousUserInsert): Promise<AnonymousUserSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(anonymousUsers)
      .values({
        id: params.id,
        tenantId: params.tenantId,
        projectId: params.projectId,
        metadata: params.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const getAnonymousUser =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    id: string;
    tenantId: string;
    projectId: string;
  }): Promise<AnonymousUserSelect | undefined> => {
    const result = await db
      .select()
      .from(anonymousUsers)
      .where(
        and(
          eq(anonymousUsers.id, params.id),
          eq(anonymousUsers.tenantId, params.tenantId),
          eq(anonymousUsers.projectId, params.projectId)
        )
      )
      .limit(1);

    return result[0];
  };
