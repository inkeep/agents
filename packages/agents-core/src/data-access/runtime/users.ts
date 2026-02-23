import { and, eq } from 'drizzle-orm';
import { member, user } from '../../auth/auth-schema';
import type { User } from '../../auth/auth-validation-schemas';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';

/**
 * User data access layer
 * All database queries for Better Auth's user table
 */

/**
 * Get user by ID
 */
export const getUserById =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string): Promise<User | null> => {
    const result = await db.select().from(user).where(eq(user.id, userId)).limit(1);

    return result[0] || null;
  };

/**
 * Get user by email
 */
export const getUserByEmail =
  (db: AgentsRunDatabaseClient) =>
  async (email: string): Promise<User | null> => {
    const result = await db.select().from(user).where(eq(user.email, email)).limit(1);

    return result[0] || null;
  };

/**
 * Get organization member by email
 * Returns the user if they are a member of the specified organization
 */
export const getOrganizationMemberByEmail =
  (db: AgentsRunDatabaseClient) =>
  async (
    organizationId: string,
    email: string
  ): Promise<(User & { role: string; memberId: string }) | null> => {
    const result = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        role: member.role,
        memberId: member.id,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(and(eq(member.organizationId, organizationId), eq(user.email, email)))
      .limit(1);

    return result[0] || null;
  };
