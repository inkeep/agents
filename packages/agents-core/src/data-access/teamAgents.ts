import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { agents, teamAgents } from '../db/schema';
import type {
  AgentScopeConfig,
  PaginationConfig,
  TeamAgentInsert,
  TeamAgentSelect,
  TeamAgentUpdate,
} from '../types/index';

/**
 * Create a new team agent
 */
export const createTeamAgent =
  (db: DatabaseClient) =>
  async (params: TeamAgentInsert): Promise<TeamAgentSelect> => {
    const agent = await db.insert(teamAgents).values(params).returning();

    return agent[0];
  };

/**
 * Get team agent by ID
 */
export const getTeamAgentById =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    teamAgentId: string;
  }): Promise<TeamAgentSelect | null> => {
    const result = await db.query.teamAgents.findFirst({
      where: and(
        eq(teamAgents.tenantId, params.scopes.tenantId),
        eq(teamAgents.projectId, params.scopes.projectId),
        eq(teamAgents.agentId, params.scopes.agentId),
        eq(teamAgents.id, params.teamAgentId)
      ),
    });

    return result || null;
  };

/**
 * Get team agent by origin agent id
 */
export const getTeamAgentByOriginAgentId =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    originAgentId: string;
    originProjectId: string;
  }): Promise<TeamAgentSelect | null> => {
    const result = await db.query.teamAgents.findFirst({
      where: and(
        eq(teamAgents.tenantId, params.scopes.tenantId),
        eq(teamAgents.projectId, params.scopes.projectId),
        eq(teamAgents.agentId, params.scopes.agentId),
        eq(teamAgents.originAgentId, params.originAgentId),
        eq(teamAgents.originProjectId, params.originProjectId)
      ),
    });

    return result || null;
  };

/**
 * List team agents for an agent
 */
export const listTeamAgents =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig }): Promise<TeamAgentSelect[]> => {
    return await db.query.teamAgents.findMany({
      where: and(
        eq(teamAgents.tenantId, params.scopes.tenantId),
        eq(teamAgents.projectId, params.scopes.projectId),
        eq(teamAgents.agentId, params.scopes.agentId)
      ),
      orderBy: [asc(teamAgents.createdAt)],
    });
  };

/**
 * List team agents with pagination
 */
export const listTeamAgentsPaginated =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    pagination?: PaginationConfig;
  }): Promise<{
    data: TeamAgentSelect[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(teamAgents.tenantId, params.scopes.tenantId),
      eq(teamAgents.projectId, params.scopes.projectId),
      eq(teamAgents.agentId, params.scopes.agentId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(teamAgents)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(teamAgents.createdAt)),
      db.select({ count: count() }).from(teamAgents).where(whereClause),
    ]);

    const total =
      typeof totalResult[0]?.count === 'string'
        ? parseInt(totalResult[0].count, 10)
        : totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * Update an existing team agent
 */
export const updateTeamAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    teamAgentId: string;
    data: Partial<TeamAgentUpdate>;
  }): Promise<TeamAgentSelect | null> => {
    const updateData: Partial<TeamAgentUpdate> = {
      ...params.data,
      updatedAt: new Date().toISOString(),
    };

    if (Object.keys(updateData).length === 1) {
      // Only updatedAt
      throw new Error('No fields to update');
    }

    const result = await db
      .update(teamAgents)
      .set(updateData)
      .where(
        and(
          eq(teamAgents.tenantId, params.scopes.tenantId),
          eq(teamAgents.projectId, params.scopes.projectId),
          eq(teamAgents.agentId, params.scopes.agentId),
          eq(teamAgents.id, params.teamAgentId)
        )
      )
      .returning();

    return result[0] || null;
  };

/**
 * Upsert team agent (create if it doesn't exist, update if it does)
 */
export const upsertTeamAgent =
  (db: DatabaseClient) =>
  async (params: { data: TeamAgentInsert }): Promise<TeamAgentSelect> => {
    const scopes = {
      tenantId: params.data.tenantId,
      projectId: params.data.projectId,
      agentId: params.data.agentId,
    } satisfies AgentScopeConfig;

    const existing = await getTeamAgentById(db)({
      scopes,
      teamAgentId: params.data.id,
    });

    if (existing) {
      // Update existing team agent
      const updated = await updateTeamAgent(db)({
        scopes,
        teamAgentId: params.data.id,
        data: {
          originAgentId: params.data.originAgentId,
          originProjectId: params.data.originProjectId,
        },
      });
      if (!updated) {
        throw new Error('Failed to update team agent - no rows affected');
      }
      return updated;
    } else {
      // Create new team agent
      return await createTeamAgent(db)(params.data);
    }
  };

/**
 * Delete a team agent
 */
export const deleteTeamAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; teamAgentId: string }): Promise<boolean> => {
    try {
      const result = await db
        .delete(teamAgents)
        .where(
          and(
            eq(teamAgents.tenantId, params.scopes.tenantId),
            eq(teamAgents.projectId, params.scopes.projectId),
            eq(teamAgents.agentId, params.scopes.agentId),
            eq(teamAgents.id, params.teamAgentId)
          )
        )
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Error deleting team agent:', error);
      return false;
    }
  };

/**
 * Check if a team agent exists
 */
export const teamAgentExists =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; teamAgentId: string }): Promise<boolean> => {
    const agent = await getTeamAgentById(db)(params);
    return agent !== null;
  };

/**
 * Check if a team agent exists by origin
 */
export const teamAgentOriginExists =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    originAgentId: string;
    originProjectId: string;
  }): Promise<boolean> => {
    const agent = await getTeamAgentByOriginAgentId(db)(params);
    return agent !== null;
  };

/**
 * Count team agents for an agent
 */
export const countTeamAgents =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(teamAgents)
      .where(
        and(
          eq(teamAgents.tenantId, params.scopes.tenantId),
          eq(teamAgents.projectId, params.scopes.projectId),
          eq(teamAgents.agentId, params.scopes.agentId)
        )
      );

    const countValue = result[0]?.count;
    return typeof countValue === 'string' ? parseInt(countValue, 10) : countValue || 0;
  };

/**
 * Validate that origin and target agents share the same tenant (cross-tenant prevention)
 */
export const validateSameTenant =
  (db: DatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    originAgentId: string;
    originProjectId: string;
  }): Promise<boolean> => {
    // The scopes.tenantId is the target agent's tenant
    // We need to verify the origin agent also belongs to this tenant
    const originAgent = await db.query.agents.findFirst({
      where: and(
        eq(agents.tenantId, params.scopes.tenantId),
        eq(agents.projectId, params.originProjectId),
        eq(agents.id, params.originAgentId)
      ),
    });

    return originAgent !== null;
  };
