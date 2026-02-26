import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  workAppSlackChannelAgentConfigs,
  workAppSlackUserMappings,
  workAppSlackWorkspaces,
} from '../../db/runtime/runtime-schema';

export type WorkAppSlackWorkspaceInsert = typeof workAppSlackWorkspaces.$inferInsert;
export type WorkAppSlackWorkspaceSelect = typeof workAppSlackWorkspaces.$inferSelect;
export type WorkAppSlackUserMappingInsert = typeof workAppSlackUserMappings.$inferInsert;
export type WorkAppSlackUserMappingSelect = typeof workAppSlackUserMappings.$inferSelect;
export type WorkAppSlackChannelAgentConfigInsert =
  typeof workAppSlackChannelAgentConfigs.$inferInsert;
export type WorkAppSlackChannelAgentConfigSelect =
  typeof workAppSlackChannelAgentConfigs.$inferSelect;

const DEFAULT_CLIENT_ID = 'work-apps-slack';

export const createWorkAppSlackWorkspace =
  (db: AgentsRunDatabaseClient) =>
  async (
    data: Omit<WorkAppSlackWorkspaceInsert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WorkAppSlackWorkspaceSelect> => {
    const id = `wsw_${nanoid(21)}`;
    const now = new Date().toISOString();

    const [result] = await db
      .insert(workAppSlackWorkspaces)
      .values({
        id,
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result;
  };

export const findWorkAppSlackWorkspaceByTeamId =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, slackTeamId: string): Promise<WorkAppSlackWorkspaceSelect | null> => {
    const results = await db
      .select()
      .from(workAppSlackWorkspaces)
      .where(
        and(
          eq(workAppSlackWorkspaces.tenantId, tenantId),
          eq(workAppSlackWorkspaces.slackTeamId, slackTeamId)
        )
      )
      .limit(1);

    return results[0] || null;
  };

/**
 * Find a workspace by Slack team ID only (without tenant filter).
 * Slack team IDs are globally unique, so this is safe for resolving
 * the tenant from an incoming Slack event where tenant is unknown.
 */
export const findWorkAppSlackWorkspaceBySlackTeamId =
  (db: AgentsRunDatabaseClient) =>
  async (slackTeamId: string): Promise<WorkAppSlackWorkspaceSelect | null> => {
    const results = await db
      .select()
      .from(workAppSlackWorkspaces)
      .where(eq(workAppSlackWorkspaces.slackTeamId, slackTeamId))
      .limit(1);

    return results[0] || null;
  };

/**
 * Find a workspace by its Nango connection ID.
 *
 * One Nango connection = one OAuth token = one Slack workspace.
 * The nangoConnectionId should be globally unique (not per-tenant).
 * The schema has a unique constraint on nangoConnectionId ensuring this.
 */
export const findWorkAppSlackWorkspaceByNangoConnectionId =
  (db: AgentsRunDatabaseClient) =>
  async (nangoConnectionId: string): Promise<WorkAppSlackWorkspaceSelect | null> => {
    const results = await db
      .select()
      .from(workAppSlackWorkspaces)
      .where(eq(workAppSlackWorkspaces.nangoConnectionId, nangoConnectionId));

    return results[0] || null;
  };

export const listWorkAppSlackWorkspacesByTenant =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string): Promise<WorkAppSlackWorkspaceSelect[]> => {
    return db
      .select()
      .from(workAppSlackWorkspaces)
      .where(eq(workAppSlackWorkspaces.tenantId, tenantId));
  };

export const updateWorkAppSlackWorkspace =
  (db: AgentsRunDatabaseClient) =>
  async (
    id: string,
    data: Partial<
      Pick<WorkAppSlackWorkspaceInsert, 'status' | 'slackTeamName' | 'shouldAllowJoinFromWorkspace'>
    >
  ): Promise<WorkAppSlackWorkspaceSelect | null> => {
    const [result] = await db
      .update(workAppSlackWorkspaces)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workAppSlackWorkspaces.id, id))
      .returning();

    return result || null;
  };

export const deleteWorkAppSlackWorkspace =
  (db: AgentsRunDatabaseClient) =>
  async (id: string): Promise<boolean> => {
    const result = await db
      .delete(workAppSlackWorkspaces)
      .where(eq(workAppSlackWorkspaces.id, id))
      .returning();

    return result.length > 0;
  };

export const deleteWorkAppSlackWorkspaceByNangoConnectionId =
  (db: AgentsRunDatabaseClient) =>
  async (nangoConnectionId: string): Promise<boolean> => {
    const result = await db
      .delete(workAppSlackWorkspaces)
      .where(eq(workAppSlackWorkspaces.nangoConnectionId, nangoConnectionId))
      .returning();

    return result.length > 0;
  };

export const findWorkAppSlackUserMapping =
  (db: AgentsRunDatabaseClient) =>
  async (
    tenantId: string,
    slackUserId: string,
    slackTeamId: string,
    clientId: string = DEFAULT_CLIENT_ID
  ): Promise<WorkAppSlackUserMappingSelect | null> => {
    const results = await db
      .select()
      .from(workAppSlackUserMappings)
      .where(
        and(
          eq(workAppSlackUserMappings.tenantId, tenantId),
          eq(workAppSlackUserMappings.clientId, clientId),
          eq(workAppSlackUserMappings.slackUserId, slackUserId),
          eq(workAppSlackUserMappings.slackTeamId, slackTeamId)
        )
      )
      .limit(1);

    return results[0] || null;
  };

export const findWorkAppSlackUserMappingByInkeepUserId =
  (db: AgentsRunDatabaseClient) =>
  async (inkeepUserId: string): Promise<WorkAppSlackUserMappingSelect[]> => {
    return db
      .select()
      .from(workAppSlackUserMappings)
      .where(eq(workAppSlackUserMappings.inkeepUserId, inkeepUserId));
  };

/**
 * Find a user mapping by Slack user ID and team ID only (ignores tenant).
 * Use this when you need to find the user's tenant from their mapping.
 */
export const findWorkAppSlackUserMappingBySlackUser =
  (db: AgentsRunDatabaseClient) =>
  async (
    slackUserId: string,
    slackTeamId: string,
    clientId: string = DEFAULT_CLIENT_ID
  ): Promise<WorkAppSlackUserMappingSelect | null> => {
    const results = await db
      .select()
      .from(workAppSlackUserMappings)
      .where(
        and(
          eq(workAppSlackUserMappings.clientId, clientId),
          eq(workAppSlackUserMappings.slackUserId, slackUserId),
          eq(workAppSlackUserMappings.slackTeamId, slackTeamId)
        )
      )
      .limit(1);

    return results[0] || null;
  };

export const listWorkAppSlackUserMappingsByTeam =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, slackTeamId: string): Promise<WorkAppSlackUserMappingSelect[]> => {
    return db
      .select()
      .from(workAppSlackUserMappings)
      .where(
        and(
          eq(workAppSlackUserMappings.tenantId, tenantId),
          eq(workAppSlackUserMappings.slackTeamId, slackTeamId)
        )
      );
  };

export const createWorkAppSlackUserMapping =
  (db: AgentsRunDatabaseClient) =>
  async (
    data: Omit<WorkAppSlackUserMappingInsert, 'id' | 'clientId' | 'createdAt' | 'updatedAt'> & {
      clientId?: string;
    }
  ): Promise<WorkAppSlackUserMappingSelect> => {
    const id = `wsum_${nanoid(21)}`;
    const now = new Date().toISOString();

    const [result] = await db
      .insert(workAppSlackUserMappings)
      .values({
        id,
        clientId: data.clientId || DEFAULT_CLIENT_ID,
        ...data,
        linkedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result;
  };

export const deleteWorkAppSlackUserMapping =
  (db: AgentsRunDatabaseClient) =>
  async (
    tenantId: string,
    slackUserId: string,
    slackTeamId: string,
    clientId: string = DEFAULT_CLIENT_ID
  ): Promise<boolean> => {
    const result = await db
      .delete(workAppSlackUserMappings)
      .where(
        and(
          eq(workAppSlackUserMappings.tenantId, tenantId),
          eq(workAppSlackUserMappings.clientId, clientId),
          eq(workAppSlackUserMappings.slackUserId, slackUserId),
          eq(workAppSlackUserMappings.slackTeamId, slackTeamId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteAllWorkAppSlackUserMappingsByTeam =
  (db: AgentsRunDatabaseClient) =>
  async (
    tenantId: string,
    slackTeamId: string,
    clientId: string = DEFAULT_CLIENT_ID
  ): Promise<number> => {
    const result = await db
      .delete(workAppSlackUserMappings)
      .where(
        and(
          eq(workAppSlackUserMappings.tenantId, tenantId),
          eq(workAppSlackUserMappings.clientId, clientId),
          eq(workAppSlackUserMappings.slackTeamId, slackTeamId)
        )
      )
      .returning();

    return result.length;
  };

export const createWorkAppSlackChannelAgentConfig =
  (db: AgentsRunDatabaseClient) =>
  async (
    data: Omit<WorkAppSlackChannelAgentConfigInsert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WorkAppSlackChannelAgentConfigSelect> => {
    const id = `wscac_${nanoid(21)}`;
    const now = new Date().toISOString();

    const [result] = await db
      .insert(workAppSlackChannelAgentConfigs)
      .values({
        id,
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result;
  };

export const findWorkAppSlackChannelAgentConfig =
  (db: AgentsRunDatabaseClient) =>
  async (
    tenantId: string,
    slackTeamId: string,
    slackChannelId: string
  ): Promise<WorkAppSlackChannelAgentConfigSelect | null> => {
    const results = await db
      .select()
      .from(workAppSlackChannelAgentConfigs)
      .where(
        and(
          eq(workAppSlackChannelAgentConfigs.tenantId, tenantId),
          eq(workAppSlackChannelAgentConfigs.slackTeamId, slackTeamId),
          eq(workAppSlackChannelAgentConfigs.slackChannelId, slackChannelId)
        )
      )
      .limit(1);

    return results[0] || null;
  };

export const listWorkAppSlackChannelAgentConfigsByTeam =
  (db: AgentsRunDatabaseClient) =>
  async (
    tenantId: string,
    slackTeamId: string
  ): Promise<WorkAppSlackChannelAgentConfigSelect[]> => {
    return db
      .select()
      .from(workAppSlackChannelAgentConfigs)
      .where(
        and(
          eq(workAppSlackChannelAgentConfigs.tenantId, tenantId),
          eq(workAppSlackChannelAgentConfigs.slackTeamId, slackTeamId)
        )
      );
  };

/**
 * Atomic upsert using onConflictDoUpdate to avoid TOCTOU race conditions.
 * Uses the unique constraint on (tenantId, slackTeamId, slackChannelId).
 */
export const upsertWorkAppSlackChannelAgentConfig =
  (db: AgentsRunDatabaseClient) =>
  async (
    data: Omit<WorkAppSlackChannelAgentConfigInsert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WorkAppSlackChannelAgentConfigSelect> => {
    const id = `wscac_${nanoid(21)}`;
    const now = new Date().toISOString();

    const [result] = await db
      .insert(workAppSlackChannelAgentConfigs)
      .values({
        id,
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          workAppSlackChannelAgentConfigs.tenantId,
          workAppSlackChannelAgentConfigs.slackTeamId,
          workAppSlackChannelAgentConfigs.slackChannelId,
        ],
        set: {
          projectId: data.projectId,
          agentId: data.agentId,
          slackChannelName: data.slackChannelName,
          slackChannelType: data.slackChannelType,
          enabled: data.enabled,
          grantAccessToMembers: data.grantAccessToMembers,
          configuredByUserId: data.configuredByUserId,
          updatedAt: now,
        },
      })
      .returning();

    return result;
  };

export const deleteWorkAppSlackChannelAgentConfig =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, slackTeamId: string, slackChannelId: string): Promise<boolean> => {
    const result = await db
      .delete(workAppSlackChannelAgentConfigs)
      .where(
        and(
          eq(workAppSlackChannelAgentConfigs.tenantId, tenantId),
          eq(workAppSlackChannelAgentConfigs.slackTeamId, slackTeamId),
          eq(workAppSlackChannelAgentConfigs.slackChannelId, slackChannelId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteAllWorkAppSlackChannelAgentConfigsByTeam =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, slackTeamId: string): Promise<number> => {
    const result = await db
      .delete(workAppSlackChannelAgentConfigs)
      .where(
        and(
          eq(workAppSlackChannelAgentConfigs.tenantId, tenantId),
          eq(workAppSlackChannelAgentConfigs.slackTeamId, slackTeamId)
        )
      )
      .returning();

    return result.length;
  };

export const deleteWorkAppSlackChannelAgentConfigsByAgent =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, projectId: string, agentId: string): Promise<number> => {
    const result = await db
      .delete(workAppSlackChannelAgentConfigs)
      .where(
        and(
          eq(workAppSlackChannelAgentConfigs.tenantId, tenantId),
          eq(workAppSlackChannelAgentConfigs.projectId, projectId),
          eq(workAppSlackChannelAgentConfigs.agentId, agentId)
        )
      )
      .returning();

    return result.length;
  };

export const deleteWorkAppSlackChannelAgentConfigsByProject =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, projectId: string): Promise<number> => {
    const result = await db
      .delete(workAppSlackChannelAgentConfigs)
      .where(
        and(
          eq(workAppSlackChannelAgentConfigs.tenantId, tenantId),
          eq(workAppSlackChannelAgentConfigs.projectId, projectId)
        )
      )
      .returning();

    return result.length;
  };
