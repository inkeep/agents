import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { coPilotRuns } from '../../db/runtime/runtime-schema';
import type { ResolvedRef } from '../../validation/dolt-schemas';

export type CoPilotRunInsert = typeof coPilotRuns.$inferInsert;
export type CoPilotRunSelect = typeof coPilotRuns.$inferSelect;
export type CoPilotRunStatus = 'running' | 'suspended' | 'completed' | 'failed';

export const createCoPilotRun =
  (db: AgentsRunDatabaseClient) =>
  async (params: CoPilotRunInsert): Promise<CoPilotRunSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(coPilotRuns)
      .values({
        ...params,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created as CoPilotRunSelect;
  };

export const getCoPilotRunByRef =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: { tenantId: string; projectId: string };
    ref: ResolvedRef;
  }): Promise<CoPilotRunSelect | null> => {
    const [match] = await db
      .select()
      .from(coPilotRuns)
      .where(
        and(
          eq(coPilotRuns.tenantId, params.scopes.tenantId),
          eq(coPilotRuns.projectId, params.scopes.projectId),
          sql`${coPilotRuns.ref}->>'type' = ${params.ref.type}`,
          sql`${coPilotRuns.ref}->>'name' = ${params.ref.name}`
        )
      )
      .orderBy(desc(coPilotRuns.createdAt))
      .limit(1);

    return (match as CoPilotRunSelect) ?? null;
  };

export const getCoPilotRunByBranchName =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: { tenantId: string; projectId: string };
    branchName: string;
  }): Promise<CoPilotRunSelect | null> => {
    const [match] = await db
      .select()
      .from(coPilotRuns)
      .where(
        and(
          eq(coPilotRuns.tenantId, params.scopes.tenantId),
          eq(coPilotRuns.projectId, params.scopes.projectId),
          sql`${coPilotRuns.ref}->>'type' = 'branch'`,
          sql`${coPilotRuns.ref}->>'name' = ${params.branchName}`
        )
      )
      .orderBy(desc(coPilotRuns.createdAt))
      .limit(1);

    return (match as CoPilotRunSelect) ?? null;
  };

export const listCoPilotRunsByBranchName =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: { tenantId: string; projectId: string };
    branchName: string;
  }): Promise<CoPilotRunSelect[]> => {
    const rows = await db
      .select()
      .from(coPilotRuns)
      .where(
        and(
          eq(coPilotRuns.tenantId, params.scopes.tenantId),
          eq(coPilotRuns.projectId, params.scopes.projectId),
          sql`${coPilotRuns.ref}->>'type' = 'branch'`,
          sql`${coPilotRuns.ref}->>'name' = ${params.branchName}`
        )
      )
      .orderBy(asc(coPilotRuns.createdAt));

    return rows as CoPilotRunSelect[];
  };

export const listCoPilotRuns =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: { tenantId: string; projectId: string };
  }): Promise<CoPilotRunSelect[]> => {
    const result = await db
      .select()
      .from(coPilotRuns)
      .where(
        and(
          eq(coPilotRuns.tenantId, params.scopes.tenantId),
          eq(coPilotRuns.projectId, params.scopes.projectId)
        )
      )
      .orderBy(desc(coPilotRuns.createdAt));

    return result as CoPilotRunSelect[];
  };

export const updateCoPilotRunStatusByConversationId =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    conversationId: string;
    status: CoPilotRunStatus;
  }): Promise<CoPilotRunSelect | null> => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(coPilotRuns)
      .set({
        status: params.status,
        updatedAt: now,
      })
      .where(eq(coPilotRuns.conversationId, params.conversationId))
      .returning();

    return (updated as CoPilotRunSelect) ?? null;
  };

export const deleteCoPilotRunsByBranchName =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: { tenantId: string; projectId: string };
    branchName: string;
  }): Promise<number> => {
    const deleted = await db
      .delete(coPilotRuns)
      .where(
        and(
          eq(coPilotRuns.tenantId, params.scopes.tenantId),
          eq(coPilotRuns.projectId, params.scopes.projectId),
          sql`${coPilotRuns.ref}->>'type' = 'branch'`,
          sql`${coPilotRuns.ref}->>'name' = ${params.branchName}`
        )
      )
      .returning();

    return deleted.length;
  };
