import { eq } from 'drizzle-orm';
import { user } from '../auth/auth-schema';
import type { User } from '../auth/auth-validation-schemas';
import type { DatabaseClient } from '../db/client';

/**
 * User data access layer
 * All database queries for Better Auth's user table
 */

/**
 * Get user by ID
 */
export const getUserById =
  (db: DatabaseClient) =>
  async (userId: string): Promise<User | null> => {
    const result = await db.select().from(user).where(eq(user.id, userId)).limit(1);

    return result[0] || null;
  };

/**
 * Get user by email
 */
export const getUserByEmail =
  (db: DatabaseClient) =>
  async (email: string): Promise<User | null> => {
    const result = await db.select().from(user).where(eq(user.email, email)).limit(1);

    return result[0] || null;
  };
