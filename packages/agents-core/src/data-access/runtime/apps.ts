import { and, count, desc, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { apps } from '../../db/runtime/runtime-schema';
import type { AppInsert, AppSelect, AppUpdate } from '../../types/entities';
import type { AppType, PaginationConfig, ProjectScopeConfig } from '../../types/utility';

export const getAppById =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopeConfig; id: string }) => {
    return await db.query.apps.findFirst({
      where: and(
        eq(apps.tenantId, params.scopes.tenantId),
        eq(apps.projectId, params.scopes.projectId),
        eq(apps.id, params.id)
      ),
    });
  };

export const getAppByPublicId = (db: AgentsRunDatabaseClient) => async (publicId: string) => {
  return await db.query.apps.findFirst({
    where: eq(apps.publicId, publicId),
  });
};

export const listAppsPaginated =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    pagination?: PaginationConfig;
    type?: AppType;
  }): Promise<{
    data: AppSelect[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const conditions = [
      eq(apps.tenantId, params.scopes.tenantId),
      eq(apps.projectId, params.scopes.projectId),
    ];
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

export const updateApp =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string; data: AppUpdate }) => {
    const now = new Date().toISOString();

    const [updatedApp] = await db
      .update(apps)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(apps.tenantId, params.scopes.tenantId),
          eq(apps.projectId, params.scopes.projectId),
          eq(apps.id, params.id)
        )
      )
      .returning();

    return updatedApp;
  };

export const deleteApp =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string }): Promise<boolean> => {
    const existingApp = await getAppById(db)({
      scopes: params.scopes,
      id: params.id,
    });

    if (!existingApp) {
      return false;
    }

    await db
      .delete(apps)
      .where(
        and(
          eq(apps.tenantId, params.scopes.tenantId),
          eq(apps.projectId, params.scopes.projectId),
          eq(apps.id, params.id)
        )
      );

    return true;
  };

export const updateAppLastUsed =
  (db: AgentsRunDatabaseClient) =>
  async (id: string): Promise<void> => {
    await db.update(apps).set({ lastUsedAt: new Date().toISOString() }).where(eq(apps.id, id));
  };
