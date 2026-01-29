import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { slackLinkCodes, slackUserLinks } from '../../db/runtime/runtime-schema';

export type SlackUserLinkInsert = typeof slackUserLinks.$inferInsert;
export type SlackUserLinkSelect = typeof slackUserLinks.$inferSelect;
export type SlackLinkCodeInsert = typeof slackLinkCodes.$inferInsert;
export type SlackLinkCodeSelect = typeof slackLinkCodes.$inferSelect;

function generateLinkCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export const findSlackUserLink =
  (db: AgentsRunDatabaseClient) =>
  async (slackUserId: string, slackTeamId: string): Promise<SlackUserLinkSelect | null> => {
    const results = await db
      .select()
      .from(slackUserLinks)
      .where(
        and(
          eq(slackUserLinks.slackUserId, slackUserId),
          eq(slackUserLinks.slackTeamId, slackTeamId)
        )
      )
      .limit(1);

    return results[0] || null;
  };

export const findSlackUserLinkByUserId =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string): Promise<SlackUserLinkSelect[]> => {
    return db.select().from(slackUserLinks).where(eq(slackUserLinks.userId, userId));
  };

export const listSlackUserLinksByTeam =
  (db: AgentsRunDatabaseClient) =>
  async (slackTeamId: string): Promise<SlackUserLinkSelect[]> => {
    return db.select().from(slackUserLinks).where(eq(slackUserLinks.slackTeamId, slackTeamId));
  };

export const createSlackUserLink =
  (db: AgentsRunDatabaseClient) =>
  async (data: Omit<SlackUserLinkInsert, 'id'>): Promise<SlackUserLinkSelect> => {
    const id = `slk_${nanoid(21)}`;

    const [result] = await db
      .insert(slackUserLinks)
      .values({
        id,
        ...data,
        linkedAt: new Date().toISOString(),
      })
      .returning();

    return result;
  };

export const updateSlackUserLinkLastUsed =
  (db: AgentsRunDatabaseClient) =>
  async (slackUserId: string, slackTeamId: string): Promise<void> => {
    await db
      .update(slackUserLinks)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(
        and(
          eq(slackUserLinks.slackUserId, slackUserId),
          eq(slackUserLinks.slackTeamId, slackTeamId)
        )
      );
  };

export const deleteSlackUserLink =
  (db: AgentsRunDatabaseClient) =>
  async (slackUserId: string, slackTeamId: string): Promise<boolean> => {
    const result = await db
      .delete(slackUserLinks)
      .where(
        and(
          eq(slackUserLinks.slackUserId, slackUserId),
          eq(slackUserLinks.slackTeamId, slackTeamId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const createSlackLinkCode =
  (db: AgentsRunDatabaseClient) =>
  async (
    data: Omit<SlackLinkCodeInsert, 'id' | 'code' | 'expiresAt' | 'status'>
  ): Promise<SlackLinkCodeSelect> => {
    const id = `slc_${nanoid(21)}`;
    const code = generateLinkCode();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const [result] = await db
      .insert(slackLinkCodes)
      .values({
        id,
        code,
        status: 'pending',
        expiresAt: expiresAt.toISOString(),
        ...data,
      })
      .returning();

    return result;
  };

export const findSlackLinkCodeByCode =
  (db: AgentsRunDatabaseClient) =>
  async (code: string): Promise<SlackLinkCodeSelect | null> => {
    const results = await db
      .select()
      .from(slackLinkCodes)
      .where(eq(slackLinkCodes.code, code.toUpperCase()))
      .limit(1);

    return results[0] || null;
  };

export const consumeSlackLinkCode =
  (db: AgentsRunDatabaseClient) =>
  async (code: string, userId: string): Promise<SlackLinkCodeSelect | null> => {
    const linkCode = await findSlackLinkCodeByCode(db)(code);

    if (!linkCode) {
      return null;
    }

    if (linkCode.status !== 'pending') {
      return null;
    }

    if (new Date(linkCode.expiresAt) < new Date()) {
      await db
        .update(slackLinkCodes)
        .set({ status: 'expired' })
        .where(eq(slackLinkCodes.id, linkCode.id));
      return null;
    }

    const [updated] = await db
      .update(slackLinkCodes)
      .set({
        status: 'used',
        usedAt: new Date().toISOString(),
        usedByUserId: userId,
      })
      .where(eq(slackLinkCodes.id, linkCode.id))
      .returning();

    return updated;
  };

export const cleanupExpiredSlackLinkCodes =
  (db: AgentsRunDatabaseClient) => async (): Promise<number> => {
    const now = new Date().toISOString();

    const result = await db
      .delete(slackLinkCodes)
      .where(and(eq(slackLinkCodes.status, 'pending'), eq(slackLinkCodes.expiresAt, now)))
      .returning();

    return result.length;
  };
