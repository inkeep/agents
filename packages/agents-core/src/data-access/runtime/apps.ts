import { and, count, desc, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { apps } from '../../db/runtime/runtime-schema';
import type { AppInsert, AppSelect, AppUpdate } from '../../types/entities';
import type {
  AppType,
  PaginationConfig,
  ProjectScopeConfig,
  TenantScopeConfig,
} from '../../types/utility';
import { projectScopedWhere, tenantScopedWhere } from '../manage/scope-helpers';

// ── Unscoped (for runtime auth lookups — no tenant/project gating) ───────────

export const getAppById = (db: AgentsRunDatabaseClient) => async (id: string) => {
  return await db.query.apps.findFirst({
    where: eq(apps.id, id),
  });
};

export const updateAppLastUsed =
  (db: AgentsRunDatabaseClient) =>
  async (id: string): Promise<void> => {
    await db.update(apps).set({ lastUsedAt: new Date().toISOString() }).where(eq(apps.id, id));
  };

// ── Scoped lookups (tenant- and project-level) ──────────────────────────────

export const getAppByIdForTenant =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: TenantScopeConfig; id: string }): Promise<AppSelect | undefined> => {
    return db.query.apps.findFirst({
      where: and(eq(apps.id, params.id), tenantScopedWhere(apps, params.scopes)),
    });
  };

export const getAppByIdForProject =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string }): Promise<AppSelect | undefined> => {
    return db.query.apps.findFirst({
      where: and(eq(apps.id, params.id), projectScopedWhere(apps, params.scopes)),
    });
  };

export const listAppsPaginated =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: TenantScopeConfig & { projectId?: string };
    pagination?: PaginationConfig;
    type?: AppType;
  }): Promise<{
    data: AppSelect[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const conditions = [tenantScopedWhere(apps, params.scopes)];
    if (params.scopes.projectId) {
      conditions.push(eq(apps.projectId, params.scopes.projectId));
    }
    if (params.type) {
      conditions.push(eq(apps.type, params.type));
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(apps)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(apps.createdAt)),
      db.select({ count: count() }).from(apps).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const totalNumber = typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
    const pages = Math.ceil(totalNumber / limit);

    return {
      data,
      pagination: { page, limit, total: totalNumber, pages },
    };
  };

export const createApp = (db: AgentsRunDatabaseClient) => async (params: AppInsert) => {
  const now = new Date().toISOString();

  const [app] = await db
    .insert(apps)
    .values({
      ...params,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return app;
};

const _updateApp =
  (db: AgentsRunDatabaseClient, scopeWhere: ReturnType<typeof tenantScopedWhere>) =>
  async (id: string, data: AppUpdate): Promise<AppSelect | undefined> => {
    const now = new Date().toISOString();

    const [updatedApp] = await db
      .update(apps)
      .set({ ...data, updatedAt: now })
      .where(and(eq(apps.id, id), scopeWhere))
      .returning();

    return updatedApp;
  };

const _deleteApp =
  (db: AgentsRunDatabaseClient, scopeWhere: ReturnType<typeof tenantScopedWhere>) =>
  async (id: string): Promise<boolean> => {
    const result = await db
      .delete(apps)
      .where(and(eq(apps.id, id), scopeWhere))
      .returning();

    return result.length > 0;
  };

export const updateAppForTenant =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: TenantScopeConfig;
    id: string;
    data: AppUpdate;
  }): Promise<AppSelect | undefined> =>
    _updateApp(db, tenantScopedWhere(apps, params.scopes))(params.id, params.data);

export const updateAppForProject =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    id: string;
    data: AppUpdate;
  }): Promise<AppSelect | undefined> =>
    _updateApp(db, projectScopedWhere(apps, params.scopes))(params.id, params.data);

export const deleteAppForTenant =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: TenantScopeConfig; id: string }): Promise<boolean> =>
    _deleteApp(db, tenantScopedWhere(apps, params.scopes))(params.id);

export const deleteAppForProject =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string }): Promise<boolean> =>
    _deleteApp(db, projectScopedWhere(apps, params.scopes))(params.id);

// ── Cascade delete helpers (called from cascade-delete.ts) ──────────────────

export const deleteAppsByProject =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, projectId: string): Promise<number> => {
    const result = await db
      .delete(apps)
      .where(and(tenantScopedWhere(apps, { tenantId }), eq(apps.projectId, projectId)))
      .returning();
    return result.length;
  };

export const clearAppDefaultsByProject =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, projectId: string): Promise<number> => {
    const result = await db
      .update(apps)
      .set({
        defaultProjectId: null,
        defaultAgentId: null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(tenantScopedWhere(apps, { tenantId }), eq(apps.defaultProjectId, projectId)))
      .returning();
    return result.length;
  };

export const clearAppDefaultsByAgent =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, agentId: string): Promise<number> => {
    const result = await db
      .update(apps)
      .set({
        defaultAgentId: null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(tenantScopedWhere(apps, { tenantId }), eq(apps.defaultAgentId, agentId)))
      .returning();
    return result.length;
  };

// ── Auth key access helpers ──────────────────────────────────────────────────

export const getAppAuthKeysForProject =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    id: string;
  }): Promise<{ config: AppSelect['config']; type: AppSelect['type'] } | undefined> => {
    const result = await db
      .select({ config: apps.config, type: apps.type })
      .from(apps)
      .where(and(eq(apps.id, params.id), projectScopedWhere(apps, params.scopes)))
      .limit(1);
    return result[0];
  };

export const updateAppAuthKeysForProject =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    id: string;
    config: AppSelect['config'];
  }): Promise<AppSelect | undefined> => {
    const now = new Date().toISOString();
    const [updated] = await db
      .update(apps)
      .set({ config: params.config, updatedAt: now })
      .where(and(eq(apps.id, params.id), projectScopedWhere(apps, params.scopes)))
      .returning();
    return updated;
  };

// ── Deprecated unscoped variants (kept for backward compat, prefer scoped) ──

export const updateApp =
  (db: AgentsRunDatabaseClient) => async (params: { id: string; data: AppUpdate }) => {
    const now = new Date().toISOString();

    const [updatedApp] = await db
      .update(apps)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(eq(apps.id, params.id))
      .returning();

    return updatedApp;
  };

export const deleteApp =
  (db: AgentsRunDatabaseClient) =>
  async (id: string): Promise<boolean> => {
    const existingApp = await getAppById(db)(id);

    if (!existingApp) {
      return false;
    }

    await db.delete(apps).where(eq(apps.id, id));

    return true;
  };
