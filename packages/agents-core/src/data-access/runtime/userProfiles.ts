import { eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { userProfile } from '../../db/runtime/runtime-schema';
import { generateId } from '../../utils';

export type UserProfile = typeof userProfile.$inferSelect;

export type UpsertUserProfileData = {
  timezone?: string | null;
  attributes?: Record<string, unknown>;
};

export const getUserProfile =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string): Promise<UserProfile | null> => {
    const result = await db
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1);

    return result[0] ?? null;
  };

export const createUserProfileIfNotExists =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string): Promise<void> => {
    const id = generateId();
    const now = new Date().toISOString();

    await db
      .insert(userProfile)
      .values({
        id,
        userId,
        timezone: null,
        attributes: {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  };

export const upsertUserProfile =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string, data: UpsertUserProfileData): Promise<UserProfile> => {
    const id = generateId();
    const now = new Date().toISOString();

    const result = await db
      .insert(userProfile)
      .values({
        id,
        userId,
        timezone: data.timezone ?? null,
        attributes: data.attributes ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: {
          ...(data.timezone !== undefined && { timezone: data.timezone }),
          ...(data.attributes !== undefined && { attributes: data.attributes }),
          updatedAt: now,
        },
      })
      .returning();

    return result[0];
  };
