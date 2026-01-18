import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { triggers } from '../../db/manage/manage-schema';
import type { TriggerInsert, TriggerSelect, TriggerUpdate } from '../../types/entities';
import type { AgentScopeConfig, PaginationConfig } from '../../types/utility';

/**
 * Get the branch name for a tenant/project combination
 */
const getProjectBranchName = (tenantId: string, projectId: string): string =>
  `${tenantId}_${projectId}_main`;

/**
 * Get a trigger by ID (agent-scoped)
 * If no branch context is established on the connection, this will use the project's main branch
 * via Dolt's AS OF syntax for branch-scoped reads.
 */
export const getTriggerById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    triggerId: string;
    /** If true, uses AS OF syntax to read from the project branch. Default: true for non-branch-scoped clients */
    useBranchScope?: boolean;
  }): Promise<TriggerSelect | undefined> => {
    const { scopes, triggerId, useBranchScope = true } = params;

    // If useBranchScope is enabled, use AS OF syntax to query the correct branch
    if (useBranchScope) {
      const branchName = getProjectBranchName(scopes.tenantId, scopes.projectId);
      try {
        const result = await db.execute(
          sql`SELECT * FROM triggers AS OF ${sql.raw(`'${branchName}'`)} 
              WHERE tenant_id = ${scopes.tenantId} 
              AND project_id = ${scopes.projectId} 
              AND agent_id = ${scopes.agentId} 
              AND id = ${triggerId}
              LIMIT 1`
        );
        if (result.rows.length > 0) {
          return result.rows[0] as unknown as TriggerSelect;
        }
        return undefined;
      } catch {
        // If AS OF fails (branch doesn't exist), fall back to regular query
        // This handles the case where we're already on the correct branch
      }
    }

    // Fallback: regular query (for when connection is already branch-scoped)
    const result = await db.query.triggers.findFirst({
      where: and(
        eq(triggers.tenantId, scopes.tenantId),
        eq(triggers.projectId, scopes.projectId),
        eq(triggers.agentId, scopes.agentId),
        eq(triggers.id, triggerId)
      ),
    });
    return result as TriggerSelect | undefined;
  };

/**
 * List all triggers for an agent
 */
export const listTriggers =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig }): Promise<TriggerSelect[]> => {
    const result = await db.query.triggers.findMany({
      where: and(
        eq(triggers.tenantId, params.scopes.tenantId),
        eq(triggers.projectId, params.scopes.projectId),
        eq(triggers.agentId, params.scopes.agentId)
      ),
    });
    return result as TriggerSelect[];
  };

/**
 * List triggers for an agent with pagination
 */
export const listTriggersPaginated =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(triggers.tenantId, params.scopes.tenantId),
      eq(triggers.projectId, params.scopes.projectId),
      eq(triggers.agentId, params.scopes.agentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(triggers)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(triggers.createdAt)),
      db.select({ count: count() }).from(triggers).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * Create a new trigger (agent-scoped)
 */
export const createTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: TriggerInsert): Promise<TriggerSelect> => {
    const result = await db.insert(triggers).values(params).returning();
    return result[0] as TriggerSelect;
  };

/**
 * Update a trigger (agent-scoped)
 */
export const updateTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    triggerId: string;
    data: TriggerUpdate;
  }): Promise<TriggerSelect> => {
    const updateData = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    } as TriggerUpdate;

    const result = await db
      .update(triggers)
      .set(updateData)
      .where(
        and(
          eq(triggers.tenantId, params.scopes.tenantId),
          eq(triggers.projectId, params.scopes.projectId),
          eq(triggers.agentId, params.scopes.agentId),
          eq(triggers.id, params.triggerId)
        )
      )
      .returning();

    return result[0] as TriggerSelect;
  };

/**
 * Delete a trigger (agent-scoped)
 */
export const deleteTrigger =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; triggerId: string }): Promise<void> => {
    await db
      .delete(triggers)
      .where(
        and(
          eq(triggers.tenantId, params.scopes.tenantId),
          eq(triggers.projectId, params.scopes.projectId),
          eq(triggers.agentId, params.scopes.agentId),
          eq(triggers.id, params.triggerId)
        )
      );
  };
