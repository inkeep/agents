import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { workAppConfigs } from '../../db/manage/manage-schema';
import type { WorkAppConfigInsert, WorkAppConfigUpdate } from '../../types/index';
import { toISODateString } from '../../utils';
import { generateId } from '../../utils/conversations';

export type TenantScopeConfig = {
  tenantId: string;
};

export type WorkAppConfigScopeConfig = TenantScopeConfig & {
  appType: 'slack' | 'teams';
  workspaceId: string;
  channelId?: string | null;
};

export const getWorkAppConfigById =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: TenantScopeConfig; id: string }) => {
    const result = await db.query.workAppConfigs.findFirst({
      where: and(
        eq(workAppConfigs.tenantId, params.scopes.tenantId),
        eq(workAppConfigs.id, params.id)
      ),
    });
    return result ?? null;
  };

export const getWorkAppConfig =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: WorkAppConfigScopeConfig }) => {
    const whereClause = and(
      eq(workAppConfigs.tenantId, params.scopes.tenantId),
      eq(workAppConfigs.appType, params.scopes.appType),
      eq(workAppConfigs.workspaceId, params.scopes.workspaceId),
      params.scopes.channelId
        ? eq(workAppConfigs.channelId, params.scopes.channelId)
        : isNull(workAppConfigs.channelId)
    );

    const result = await db.query.workAppConfigs.findFirst({
      where: whereClause,
    });

    return result ?? null;
  };

export const getWorkspaceDefaultConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: Omit<WorkAppConfigScopeConfig, 'channelId'> }) => {
    return getWorkAppConfig(db)({
      scopes: { ...params.scopes, channelId: null },
    });
  };

export const getChannelConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: WorkAppConfigScopeConfig & { channelId: string } }) => {
    return getWorkAppConfig(db)({ scopes: params.scopes });
  };

export const getEffectiveAgentConfig =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: WorkAppConfigScopeConfig }) => {
    if (params.scopes.channelId) {
      const channelConfig = await getChannelConfig(db)({
        scopes: params.scopes as WorkAppConfigScopeConfig & { channelId: string },
      });
      if (channelConfig) {
        return { config: channelConfig, source: 'channel' as const };
      }
    }

    const workspaceConfig = await getWorkspaceDefaultConfig(db)({
      scopes: {
        tenantId: params.scopes.tenantId,
        appType: params.scopes.appType,
        workspaceId: params.scopes.workspaceId,
      },
    });

    if (workspaceConfig) {
      return { config: workspaceConfig, source: 'workspace' as const };
    }

    return null;
  };

export const listWorkAppConfigs =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: TenantScopeConfig & { appType: 'slack' | 'teams'; workspaceId: string };
  }) => {
    const whereClause = and(
      eq(workAppConfigs.tenantId, params.scopes.tenantId),
      eq(workAppConfigs.appType, params.scopes.appType),
      eq(workAppConfigs.workspaceId, params.scopes.workspaceId)
    );

    const configs = await db
      .select()
      .from(workAppConfigs)
      .where(whereClause)
      .orderBy(desc(workAppConfigs.createdAt));

    return configs;
  };

export const listWorkAppConfigsPaginated =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: TenantScopeConfig & { appType: 'slack' | 'teams'; workspaceId: string };
    pagination?: { page?: number; limit?: number };
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(workAppConfigs.tenantId, params.scopes.tenantId),
      eq(workAppConfigs.appType, params.scopes.appType),
      eq(workAppConfigs.workspaceId, params.scopes.workspaceId)
    );

    const [configs, totalResult] = await Promise.all([
      db
        .select()
        .from(workAppConfigs)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(workAppConfigs.createdAt)),
      db.select({ count: count() }).from(workAppConfigs).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data: configs,
      pagination: { page, limit, total, pages },
    };
  };

export const createWorkAppConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: { data: Omit<WorkAppConfigInsert, 'id' | 'createdAt' | 'updatedAt'> }) => {
    const now = new Date().toISOString();
    const id = generateId();

    const [created] = await db
      .insert(workAppConfigs)
      .values({
        ...params.data,
        id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const updateWorkAppConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: TenantScopeConfig; id: string; data: WorkAppConfigUpdate }) => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(workAppConfigs)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(eq(workAppConfigs.tenantId, params.scopes.tenantId), eq(workAppConfigs.id, params.id))
      )
      .returning();

    return updated ?? null;
  };

export const upsertWorkAppConfig =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: WorkAppConfigScopeConfig;
    data: Omit<
      WorkAppConfigInsert,
      'id' | 'createdAt' | 'updatedAt' | 'tenantId' | 'appType' | 'workspaceId' | 'channelId'
    >;
  }) => {
    const existing = await getWorkAppConfig(db)({ scopes: params.scopes });

    if (existing) {
      return await updateWorkAppConfig(db)({
        scopes: { tenantId: params.scopes.tenantId },
        id: existing.id,
        data: params.data,
      });
    }

    return await createWorkAppConfig(db)({
      data: {
        tenantId: params.scopes.tenantId,
        appType: params.scopes.appType,
        workspaceId: params.scopes.workspaceId,
        channelId: params.scopes.channelId ?? null,
        ...params.data,
      },
    });
  };

export const deleteWorkAppConfig =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: TenantScopeConfig; id: string }) => {
    const [deleted] = await db
      .delete(workAppConfigs)
      .where(
        and(eq(workAppConfigs.tenantId, params.scopes.tenantId), eq(workAppConfigs.id, params.id))
      )
      .returning();

    return !!deleted;
  };

export const deleteWorkAppConfigByScope =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: WorkAppConfigScopeConfig }) => {
    const config = await getWorkAppConfig(db)({ scopes: params.scopes });
    if (!config) {
      return false;
    }

    return await deleteWorkAppConfig(db)({
      scopes: { tenantId: params.scopes.tenantId },
      id: config.id,
    });
  };

export const dbResultToWorkAppConfigApi = (
  dbResult: NonNullable<Awaited<ReturnType<ReturnType<typeof getWorkAppConfigById>>>>
) => {
  const { tenantId, createdAt, updatedAt, ...rest } = dbResult;
  return {
    ...rest,
    createdAt: toISODateString(createdAt),
    updatedAt: toISODateString(updatedAt),
  };
};
