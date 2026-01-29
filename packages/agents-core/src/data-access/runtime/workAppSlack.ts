import { createHash } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  workAppSlackAccountLinkCodes,
  workAppSlackUserMappings,
  workAppSlackWorkspaces,
} from '../../db/runtime/runtime-schema';

export type WorkAppSlackWorkspaceInsert = typeof workAppSlackWorkspaces.$inferInsert;
export type WorkAppSlackWorkspaceSelect = typeof workAppSlackWorkspaces.$inferSelect;
export type WorkAppSlackUserMappingInsert = typeof workAppSlackUserMappings.$inferInsert;
export type WorkAppSlackUserMappingSelect = typeof workAppSlackUserMappings.$inferSelect;
export type WorkAppSlackAccountLinkCodeInsert = typeof workAppSlackAccountLinkCodes.$inferInsert;
export type WorkAppSlackAccountLinkCodeSelect = typeof workAppSlackAccountLinkCodes.$inferSelect;

const DEFAULT_CLIENT_ID = 'work-apps-slack';
const LINK_CODE_TTL_HOURS = 1;

function generateLinkCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function hashLinkCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase()).digest('hex');
}

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

export const findWorkAppSlackWorkspaceByNangoConnectionId =
  (db: AgentsRunDatabaseClient) =>
  async (nangoConnectionId: string): Promise<WorkAppSlackWorkspaceSelect | null> => {
    const results = await db
      .select()
      .from(workAppSlackWorkspaces)
      .where(eq(workAppSlackWorkspaces.nangoConnectionId, nangoConnectionId))
      .limit(1);

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
    data: Partial<Pick<WorkAppSlackWorkspaceInsert, 'status' | 'slackTeamName'>>
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

export const updateWorkAppSlackUserMappingLastUsed =
  (db: AgentsRunDatabaseClient) =>
  async (
    tenantId: string,
    slackUserId: string,
    slackTeamId: string,
    clientId: string = DEFAULT_CLIENT_ID
  ): Promise<void> => {
    const now = new Date().toISOString();

    await db
      .update(workAppSlackUserMappings)
      .set({ lastUsedAt: now, updatedAt: now })
      .where(
        and(
          eq(workAppSlackUserMappings.tenantId, tenantId),
          eq(workAppSlackUserMappings.clientId, clientId),
          eq(workAppSlackUserMappings.slackUserId, slackUserId),
          eq(workAppSlackUserMappings.slackTeamId, slackTeamId)
        )
      );
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

export type CreateLinkCodeResult = {
  linkCode: WorkAppSlackAccountLinkCodeSelect;
  plaintextCode: string;
};

export const createWorkAppSlackAccountLinkCode =
  (db: AgentsRunDatabaseClient) =>
  async (
    data: Omit<
      WorkAppSlackAccountLinkCodeInsert,
      'id' | 'clientId' | 'linkCodeHash' | 'expiresAt' | 'status' | 'createdAt' | 'updatedAt'
    > & { clientId?: string }
  ): Promise<CreateLinkCodeResult> => {
    const id = `wslc_${nanoid(21)}`;
    const plaintextCode = generateLinkCode();
    const linkCodeHash = hashLinkCode(plaintextCode);
    const now = new Date();

    const expiresAt = new Date(now);
    expiresAt.setHours(expiresAt.getHours() + LINK_CODE_TTL_HOURS);

    const [result] = await db
      .insert(workAppSlackAccountLinkCodes)
      .values({
        id,
        clientId: data.clientId || DEFAULT_CLIENT_ID,
        linkCodeHash,
        status: 'pending',
        expiresAt: expiresAt.toISOString(),
        ...data,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .returning();

    return { linkCode: result, plaintextCode };
  };

export const findWorkAppSlackAccountLinkCodeByHash =
  (db: AgentsRunDatabaseClient) =>
  async (plaintextCode: string): Promise<WorkAppSlackAccountLinkCodeSelect | null> => {
    const linkCodeHash = hashLinkCode(plaintextCode);

    const results = await db
      .select()
      .from(workAppSlackAccountLinkCodes)
      .where(eq(workAppSlackAccountLinkCodes.linkCodeHash, linkCodeHash))
      .limit(1);

    return results[0] || null;
  };

export const consumeWorkAppSlackAccountLinkCode =
  (db: AgentsRunDatabaseClient) =>
  async (
    plaintextCode: string,
    usedByUserId: string
  ): Promise<WorkAppSlackAccountLinkCodeSelect | null> => {
    const linkCode = await findWorkAppSlackAccountLinkCodeByHash(db)(plaintextCode);

    if (!linkCode) {
      return null;
    }

    if (linkCode.status !== 'pending') {
      return null;
    }

    if (new Date(linkCode.expiresAt) < new Date()) {
      await db
        .update(workAppSlackAccountLinkCodes)
        .set({ status: 'expired', updatedAt: new Date().toISOString() })
        .where(eq(workAppSlackAccountLinkCodes.id, linkCode.id));
      return null;
    }

    const now = new Date().toISOString();

    const [updated] = await db
      .update(workAppSlackAccountLinkCodes)
      .set({
        status: 'used',
        usedAt: now,
        usedByUserId,
        updatedAt: now,
      })
      .where(eq(workAppSlackAccountLinkCodes.id, linkCode.id))
      .returning();

    return updated;
  };

export const cleanupExpiredWorkAppSlackAccountLinkCodes =
  (db: AgentsRunDatabaseClient) => async (): Promise<number> => {
    const now = new Date().toISOString();

    const result = await db
      .delete(workAppSlackAccountLinkCodes)
      .where(
        and(
          eq(workAppSlackAccountLinkCodes.status, 'pending'),
          lt(workAppSlackAccountLinkCodes.expiresAt, now)
        )
      )
      .returning();

    return result.length;
  };

export const cleanupAllExpiredOrUsedLinkCodes =
  (db: AgentsRunDatabaseClient) =>
  async (retentionDays: number = 7): Promise<{ expired: number; used: number }> => {
    const now = new Date();
    const retentionCutoff = new Date(now);
    retentionCutoff.setDate(retentionCutoff.getDate() - retentionDays);
    const cutoffStr = retentionCutoff.toISOString();
    const nowStr = now.toISOString();

    const expiredResult = await db
      .delete(workAppSlackAccountLinkCodes)
      .where(
        and(
          eq(workAppSlackAccountLinkCodes.status, 'pending'),
          lt(workAppSlackAccountLinkCodes.expiresAt, nowStr)
        )
      )
      .returning();

    const usedResult = await db
      .delete(workAppSlackAccountLinkCodes)
      .where(
        and(
          eq(workAppSlackAccountLinkCodes.status, 'used'),
          lt(workAppSlackAccountLinkCodes.updatedAt, cutoffStr)
        )
      )
      .returning();

    return { expired: expiredResult.length, used: usedResult.length };
  };
