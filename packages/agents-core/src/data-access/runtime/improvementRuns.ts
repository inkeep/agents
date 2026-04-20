import { and, desc, eq, sql } from 'drizzle-orm';
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

    const match = result.find(
      (r) => r.ref?.type === params.ref.type && r.ref?.name === params.ref.name,
    );

    return (match as CoPilotRunSelect) ?? null;
  };

export const getCoPilotRunByBranchName =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: { tenantId: string; projectId: string };
    branchName: string;
  }): Promise<CoPilotRunSelect | null> => {
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

    const match = result.find(
      (r) => r.ref?.type === 'branch' && r.ref?.name === params.branchName,
    );

    return (match as CoPilotRunSelect) ?? null;
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

export const updateCoPilotRunStatus =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: { tenantId: string; projectId: string };
    branchName: string;
    status: CoPilotRunStatus;
  }): Promise<CoPilotRunSelect | null> => {
    const now = new Date().toISOString();

    const run = await getCoPilotRunByBranchName(db)({
      scopes: params.scopes,
      branchName: params.branchName,
    });

    if (!run) return null;

    const [updated] = await db
      .update(coPilotRuns)
      .set({
        status: params.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(coPilotRuns.tenantId, params.scopes.tenantId),
          eq(coPilotRuns.projectId, params.scopes.projectId),
          eq(coPilotRuns.id, run.id)
        )
      )
      .returning();

    return (updated as CoPilotRunSelect) ?? null;
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
      .where(
        sql`${coPilotRuns.conversationIds} @> ${JSON.stringify([params.conversationId])}::jsonb`
      )
      .returning();

    return (updated as CoPilotRunSelect) ?? null;
  };

export const deleteCoPilotRunByBranchName =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: { tenantId: string; projectId: string };
    branchName: string;
  }): Promise<boolean> => {
    const run = await getCoPilotRunByBranchName(db)({
      scopes: params.scopes,
      branchName: params.branchName,
    });

    if (!run) return false;

    await db
      .delete(coPilotRuns)
      .where(
        and(
          eq(coPilotRuns.tenantId, params.scopes.tenantId),
          eq(coPilotRuns.projectId, params.scopes.projectId),
          eq(coPilotRuns.id, run.id)
        )
      );

    return true;
  };

export const appendConversationId =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: { tenantId: string; projectId: string };
    id: string;
    conversationId: string;
    status?: CoPilotRunStatus;
  }): Promise<CoPilotRunSelect | null> => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(coPilotRuns)
      .set({
        conversationIds: sql`${coPilotRuns.conversationIds} || ${JSON.stringify([params.conversationId])}::jsonb`,
        ...(params.status ? { status: params.status } : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(coPilotRuns.tenantId, params.scopes.tenantId),
          eq(coPilotRuns.projectId, params.scopes.projectId),
          eq(coPilotRuns.id, params.id)
        )
      )
      .returning();

    return (updated as CoPilotRunSelect) ?? null;
  };
