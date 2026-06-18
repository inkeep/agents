import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  webhookDestinationAgents,
  webhookDestinationEvaluators,
  webhookDestinations,
} from '../../db/manage/manage-schema';
import type {
  WebhookDestinationInsert,
  WebhookDestinationSelect,
  WebhookDestinationUpdate,
} from '../../types/entities';
import type { PaginationConfig, ProjectScopeConfig } from '../../types/utility';
import { generateId } from '../../utils/conversations';
import { projectScopedWhere } from './scope-helpers';

export const getWebhookDestinationById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    webhookDestinationId: string;
  }): Promise<WebhookDestinationSelect | undefined> => {
    const { scopes, webhookDestinationId } = params;

    const result = await db.query.webhookDestinations.findFirst({
      where: and(
        projectScopedWhere(webhookDestinations, scopes),
        eq(webhookDestinations.id, webhookDestinationId)
      ),
    });

    return result as WebhookDestinationSelect | undefined;
  };

export const listWebhookDestinationsPaginated =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    pagination?: PaginationConfig;
    agentId?: string;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const baseWhere = projectScopedWhere(webhookDestinations, params.scopes);

    if (!params.agentId) {
      const [data, totalResult] = await Promise.all([
        db
          .select()
          .from(webhookDestinations)
          .where(baseWhere)
          .limit(limit)
          .offset(offset)
          .orderBy(desc(webhookDestinations.createdAt)),
        db.select({ count: count() }).from(webhookDestinations).where(baseWhere),
      ]);

      const total = totalResult[0]?.count || 0;
      const pages = Math.ceil(total / limit);

      return { data, pagination: { page, limit, total, pages } };
    }

    const agentId = params.agentId;

    const allDests = await db
      .select()
      .from(webhookDestinations)
      .where(baseWhere)
      .orderBy(desc(webhookDestinations.createdAt));

    const destIds = allDests.map((d) => d.id);
    if (destIds.length === 0) {
      return { data: [], pagination: { page, limit, total: 0, pages: 0 } };
    }

    const agentRows = await db
      .select()
      .from(webhookDestinationAgents)
      .where(
        and(
          eq(webhookDestinationAgents.tenantId, params.scopes.tenantId),
          eq(webhookDestinationAgents.projectId, params.scopes.projectId),
          inArray(webhookDestinationAgents.webhookDestinationId, destIds)
        )
      );

    const agentsByDest = new Map<string, string[]>();
    for (const row of agentRows) {
      const list = agentsByDest.get(row.webhookDestinationId) ?? [];
      list.push(row.agentId);
      agentsByDest.set(row.webhookDestinationId, list);
    }

    const filtered = allDests.filter((dest) => {
      const agents = agentsByDest.get(dest.id);
      return !agents || agents.length === 0 || agents.includes(agentId);
    });

    const total = filtered.length;
    const pages = Math.ceil(total / limit);
    const data = filtered.slice(offset, offset + limit);

    return { data, pagination: { page, limit, total, pages } };
  };

export type WebhookDestinationWithScoping = WebhookDestinationSelect & {
  agentIds: string[];
  evaluatorIds: string[];
};

/** @deprecated Use {@link WebhookDestinationWithScoping} instead. */
export type WebhookDestinationWithAgents = WebhookDestinationWithScoping;

export const listEnabledWebhookDestinations =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    agentId: string;
  }): Promise<WebhookDestinationWithScoping[]> => {
    const { scopes, agentId } = params;

    const rows = await db
      .select({
        dest: webhookDestinations,
        scopedAgentId: webhookDestinationAgents.agentId,
        scopedEvaluatorId: webhookDestinationEvaluators.evaluatorId,
      })
      .from(webhookDestinations)
      .leftJoin(
        webhookDestinationAgents,
        and(
          eq(webhookDestinationAgents.tenantId, webhookDestinations.tenantId),
          eq(webhookDestinationAgents.projectId, webhookDestinations.projectId),
          eq(webhookDestinationAgents.webhookDestinationId, webhookDestinations.id)
        )
      )
      .leftJoin(
        webhookDestinationEvaluators,
        and(
          eq(webhookDestinationEvaluators.tenantId, webhookDestinations.tenantId),
          eq(webhookDestinationEvaluators.projectId, webhookDestinations.projectId),
          eq(webhookDestinationEvaluators.webhookDestinationId, webhookDestinations.id)
        )
      )
      .where(
        and(projectScopedWhere(webhookDestinations, scopes), eq(webhookDestinations.enabled, true))
      );

    if (rows.length === 0) return [];

    const destMap = new Map<
      string,
      { dest: WebhookDestinationSelect; agentIds: Set<string>; evaluatorIds: Set<string> }
    >();
    for (const row of rows) {
      const existing = destMap.get(row.dest.id);
      if (existing) {
        if (row.scopedAgentId) existing.agentIds.add(row.scopedAgentId);
        if (row.scopedEvaluatorId) existing.evaluatorIds.add(row.scopedEvaluatorId);
      } else {
        destMap.set(row.dest.id, {
          dest: row.dest as WebhookDestinationSelect,
          agentIds: new Set(row.scopedAgentId ? [row.scopedAgentId] : []),
          evaluatorIds: new Set(row.scopedEvaluatorId ? [row.scopedEvaluatorId] : []),
        });
      }
    }

    return Array.from(destMap.values())
      .filter(({ agentIds }) => agentIds.size === 0 || agentIds.has(agentId))
      .map(({ dest, agentIds, evaluatorIds }) => ({
        ...dest,
        agentIds: Array.from(agentIds),
        evaluatorIds: Array.from(evaluatorIds),
      }));
  };

export const createWebhookDestination =
  (db: AgentsManageDatabaseClient) =>
  async (params: WebhookDestinationInsert): Promise<WebhookDestinationSelect> => {
    const result = await db
      .insert(webhookDestinations)
      .values(params as any)
      .returning();
    return result[0] as WebhookDestinationSelect;
  };

export const updateWebhookDestination =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    webhookDestinationId: string;
    data: WebhookDestinationUpdate;
  }): Promise<WebhookDestinationSelect | undefined> => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    } as WebhookDestinationUpdate;

    const result = await db
      .update(webhookDestinations)
      .set(updateData as any)
      .where(
        and(
          projectScopedWhere(webhookDestinations, params.scopes),
          eq(webhookDestinations.id, params.webhookDestinationId)
        )
      )
      .returning();

    return result[0] as WebhookDestinationSelect | undefined;
  };

export const deleteWebhookDestination =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    webhookDestinationId: string;
  }): Promise<boolean> => {
    const result = await db
      .delete(webhookDestinations)
      .where(
        and(
          projectScopedWhere(webhookDestinations, params.scopes),
          eq(webhookDestinations.id, params.webhookDestinationId)
        )
      )
      .returning();
    return result.length > 0;
  };

export const getWebhookDestinationAgentIds =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    webhookDestinationId: string;
  }): Promise<string[]> => {
    const rows = await db
      .select({ agentId: webhookDestinationAgents.agentId })
      .from(webhookDestinationAgents)
      .where(
        and(
          eq(webhookDestinationAgents.tenantId, params.scopes.tenantId),
          eq(webhookDestinationAgents.projectId, params.scopes.projectId),
          eq(webhookDestinationAgents.webhookDestinationId, params.webhookDestinationId)
        )
      );
    return rows.map((r) => r.agentId);
  };

export const setWebhookDestinationAgentIds =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    webhookDestinationId: string;
    agentIds: string[];
  }): Promise<void> => {
    const { scopes, webhookDestinationId, agentIds } = params;

    await db
      .delete(webhookDestinationAgents)
      .where(
        and(
          eq(webhookDestinationAgents.tenantId, scopes.tenantId),
          eq(webhookDestinationAgents.projectId, scopes.projectId),
          eq(webhookDestinationAgents.webhookDestinationId, webhookDestinationId)
        )
      );

    if (agentIds.length > 0) {
      await db.insert(webhookDestinationAgents).values(
        agentIds.map((agentId) => ({
          id: generateId(),
          tenantId: scopes.tenantId,
          projectId: scopes.projectId,
          webhookDestinationId,
          agentId,
        }))
      );
    }
  };

export const getWebhookDestinationEvaluatorIds =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    webhookDestinationId: string;
  }): Promise<string[]> => {
    const rows = await db
      .select({ evaluatorId: webhookDestinationEvaluators.evaluatorId })
      .from(webhookDestinationEvaluators)
      .where(
        and(
          eq(webhookDestinationEvaluators.tenantId, params.scopes.tenantId),
          eq(webhookDestinationEvaluators.projectId, params.scopes.projectId),
          eq(webhookDestinationEvaluators.webhookDestinationId, params.webhookDestinationId)
        )
      );
    return rows.map((r) => r.evaluatorId);
  };

export const setWebhookDestinationEvaluatorIds =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    webhookDestinationId: string;
    evaluatorIds: string[];
  }): Promise<void> => {
    const { scopes, webhookDestinationId, evaluatorIds } = params;

    await db
      .delete(webhookDestinationEvaluators)
      .where(
        and(
          eq(webhookDestinationEvaluators.tenantId, scopes.tenantId),
          eq(webhookDestinationEvaluators.projectId, scopes.projectId),
          eq(webhookDestinationEvaluators.webhookDestinationId, webhookDestinationId)
        )
      );

    if (evaluatorIds.length > 0) {
      await db.insert(webhookDestinationEvaluators).values(
        evaluatorIds.map((evaluatorId) => ({
          id: generateId(),
          tenantId: scopes.tenantId,
          projectId: scopes.projectId,
          webhookDestinationId,
          evaluatorId,
        }))
      );
    }
  };
